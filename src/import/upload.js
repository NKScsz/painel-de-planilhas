import { currentMeta, openBase } from '../app/init.js';
import { render } from '../app/render.js';
import { autoCharts } from '../charts/auto-charts.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase } from '../core/storage.js';
import { $, nf, toast, uid8 } from '../core/utils.ts';
import { convert } from '../core/values.ts';
import { autoClean, cleanInfo } from '../features/auto-clean.js';
import { keepCalcs } from '../features/calc-columns.js';
import { DOC_EXT, previewDocImport, readDocument } from './pdf-image.js';
import { mergeSheets, readWorkbook, tableFromAoa } from './spreadsheet.js';
import { enrichStatement } from './pdf-image.js';
import { categorizeTable } from '../features/categorize.js';
import { nfeTable } from './nfe.ts';
import { decodeOfx, parseOfx } from './ofx.ts';

/* ============ Upload ============ */
const SHEET_EXT=['xlsx','xls','xlsm','csv','ods','tsv','txt'];
// Lê um arquivo (menos XML de nota, que é lido em grupo) e devolve as tabelas.
// preview=false pula a tela de conferência do PDF/foto (usado na atualização do Google Drive).
async function fileTables(f,{onMsg=()=>{},preview=true}={}){
  const ext=f.name.split('.').pop().toLowerCase(), notes=[];
  if (DOC_EXT.includes(ext)){
    onMsg(`Abrindo “${f.name}”…`);
    const res=await readDocument(f,onMsg);
    if (!res.tables.length){ toast(`Não encontramos texto legível em “${f.name}”.`,true,6000); return {tables:[],notes}; }
    if (preview){ onMsg('Aguardando sua confirmação…'); if (!await previewDocImport(f,res)) return {tables:[],notes,cancelled:true}; }
    for (const tb of res.tables) tb.fileName=tb.fileName||f.name;
    return {tables:res.tables,notes};
  }
  if (ext==='ofx'){
    onMsg(`Lendo o extrato “${f.name}”…`);
    const r=parseOfx(decodeOfx(await f.arrayBuffer()));
    if (!r){ toast(`Não encontramos lançamentos em “${f.name}”. Confira se é o extrato em OFX exportado pelo banco.`,true,7000); return {tables:[],notes}; }
    const tb=tableFromAoa(r.aoa); enrichStatement(tb); categorizeTable(tb);
    tb.name=`Extrato ${r.banco||'OFX'}${r.conta?` · conta ${String(r.conta).slice(-4)}`:''}`; tb.fileName=f.name;
    if (r.repetidos) notes.push(`${r.repetidos} lançamentos repetidos no arquivo “${f.name}” foram ignorados.`);
    return {tables:[tb],notes};
  }
  if (SHEET_EXT.includes(ext)){
    const mg=mergeSheets(await readWorkbook(f),f.name);
    if (mg.merged) notes.push(`As ${mg.merged} abas de “${f.name}” viraram uma base só (a coluna “${mg.srcCol}” mostra de qual aba veio cada linha).${mg.apart.length?` Ficaram separadas por terem outro formato ou serem de resumo: ${mg.apart.join(', ')}.`:''}`);
    return {tables:mg.tables,notes};
  }
  toast(`Formato não suportado: “${f.name}”. Use planilha, PDF, imagem, XML de nota fiscal ou extrato OFX.`,true,6000);
  return {tables:[],notes};
}
async function handleFiles(files){
  if (!files || !files.length) return;
  if (S.readOnly){ toast('Acesso somente leitura: não é possível enviar planilhas.',true); return; }
  const mode=S.uploadMode; S.uploadMode='new';
  const t=toast('Lendo arquivo…',false,900000);
  try{
    let tables=[], cancelled=0; const mergeNotes=[], xmls=[];
    for (const f of files){
      const ext=f.name.split('.').pop().toLowerCase();
      if (ext==='xml'){ xmls.push({name:f.name,xml:await f.text()}); continue; } // notas fiscais: juntas viram uma tabela só (lidas depois do laço)
      const r=await fileTables(f,{onMsg:m=>{ t.textContent=m; }});
      tables.push(...r.tables); mergeNotes.push(...r.notes); if (r.cancelled) cancelled++;
      t.textContent='Lendo arquivo…';
    }
    if (xmls.length){
      t.textContent=`Lendo ${xmls.length===1?'a nota fiscal':`${xmls.length} notas fiscais`}…`;
      const r=nfeTable(xmls);
      if (r.table) tables.push(r.table);
      if (r.ignored.length) toast(`${r.ignored.length===1?`“${r.ignored[0]}” não é uma nota fiscal`:`${r.ignored.length} arquivos XML não são notas fiscais`} (pode ser um evento, como cancelamento) e ${r.ignored.length===1?'ficou':'ficaram'} de fora.`,true,8000);
      if (r.repeated) mergeNotes.push(`${r.repeated} ${r.repeated===1?'nota repetida foi ignorada':'notas repetidas foram ignoradas'}.`);
    }
    if (!tables.length){ t.remove(); if(!cancelled) toast('Nenhum dado encontrado no arquivo.',true); return; }
    t.textContent='Arrumando os dados…';
    tables=tables.map(autoClean).filter(tb=>tb.rows.length&&tb.columns.length);
    if (!tables.length){ t.remove(); toast('O arquivo não tem linhas com dados depois da limpeza.',true); return; }
    const fixes=tables.reduce((s,tb)=>s+tb.cleanLog.length,0);
    if (mode!=='new' && S.currentId){
      const meta=structuredClone(currentMeta()); const tb=tables[0];
      let rows;
      if (mode==='append'){
        // alinha colunas pelo nome
        const idx=meta.columns.map(c=>tb.columns.findIndex(x=>x.name.toLowerCase()===c.name.toLowerCase()));
        const extra=tb.columns.map((c,j)=>j).filter(j=>!idx.includes(j));
        for (const j of extra) meta.columns.push({name:tb.columns[j].name,type:tb.columns[j].type});
        const old=S.rows.map(r=>{ const a=r.slice(); while(a.length<meta.columns.length) a.push(null); return a; });
        const add=tb.rows.map(r=>[...idx.map((j,k)=>j<0?null:convert(r[j],meta.columns[k].type)),...extra.map(j=>r[j])]);
        rows=old.concat(add);
      } else {
        rows=tb.rows; meta.columns=keepCalcs(meta.columns,tb.columns); meta.fileName=tb.fileName; meta.cleanLog=cleanInfo(tb);
        const names=new Set(tb.columns.map(c=>c.name));
        meta.charts=(meta.charts||[]).filter(c=>(!c.x||names.has(c.x))&&(!c.y||names.has(c.y)));
        if (!meta.charts.length) meta.charts=autoCharts(tb.columns,tb.rows);
      }
      t.textContent='Salvando…';
      await saveBase(meta,rows,mode==='append'?'Antes de adicionar linhas':'Antes de substituir pela nova planilha');
      S.rows=rows; S.dirty=false; if(S.mode!=='cloud') render();
      t.remove(); toast(mode==='append'?`${nf.format(tb.rows.length)} linhas adicionadas.`:'Base atualizada com a nova planilha.');
      render();
      return;
    }
    let firstId=null;
    for (const tb of tables){
      const meta={id:uid8(),name:tb.name,fileName:tb.fileName,columns:tb.columns,createdAt:Date.now(),charts:autoCharts(tb.columns,tb.rows),cleanLog:cleanInfo(tb)};
      t.textContent=`Salvando “${tb.name}” (${nf.format(tb.rows.length)} linhas)…`;
      await saveBase(meta,tb.rows);
      firstId=firstId||meta.id;
      if (!S.bases.find(b=>b.id===meta.id)) S.bases.unshift(structuredClone({...meta,chunkCount:meta.chunkCount}));
    }
    t.remove();
    const cleanTxt=fixes?` Dados higienizados (${fixes} ${fixes===1?'tipo de ajuste':'tipos de ajuste'}): veja o resumo na aba Dados.`:'';
    if (mergeNotes.length) toast(mergeNotes.join(' ')+cleanTxt,false,10000);
    else toast((tables.length>1?`${tables.length} tabelas importadas como bases separadas.`:'Planilha importada e salva.')+cleanTxt,false,fixes?7000:3800);
    openBase(firstId);
  }catch(e){
    t.remove(); console.error(e);
    if (e&&e.code==='lib-load') toast('Não foi possível carregar o leitor de PDF/imagem. Verifique sua conexão e tente de novo.',true,7000);
    else if (e&&e.name==='PasswordException') toast('Este PDF está protegido por senha. Gere o extrato sem senha e tente de novo.',true,7000);
    else if (e&&e.code) handleWriteError(e);
    else toast('Não consegui ler este arquivo. Verifique se é uma planilha, PDF ou imagem válida.',true);
  }
}
function pickFile(mode='new'){ S.uploadMode=mode; const fi=$('#fileInput'); fi.multiple=(mode==='new'); fi.value=''; fi.click(); }

function bindDrop(node){
  node.addEventListener('dragover',e=>{e.preventDefault();node.classList.add('over');});
  node.addEventListener('dragleave',()=>node.classList.remove('over'));
  node.addEventListener('drop',e=>{e.preventDefault();node.classList.remove('over');S.uploadMode='new';handleFiles([...e.dataTransfer.files]);});
}




// celular: ao trocar de aba ou de tela, volta para o topo do conteúdo (cada aba abre "travada" no começo)
var lastScrollKey='';
function resetScroll(){ const k=`${S.view}|${S.currentId}|${S.tab}`; if(k!==lastScrollKey){ lastScrollKey=k; const m=$('#main'); if(m) m.scrollTop=0; } }

export { SHEET_EXT, bindDrop, fileTables, handleFiles, lastScrollKey, pickFile, resetScroll };
