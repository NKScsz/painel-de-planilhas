import { currentMeta, openBase } from '../app/init.js';
import { render } from '../app/render.js';
import { autoCharts } from '../charts/auto-charts.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase } from '../core/storage.js';
import { el, nf, toast, uid8 } from '../core/utils.ts';
import { convert } from '../core/values.ts';
import { autoClean, cleanInfo } from './auto-clean.js';
import { applyCalcs, keepCalcs } from './calc-columns.js';
import { fld, formModal } from './extras.js';
import { readWorkbook } from '../import/spreadsheet.js';

/* ----- Google Sheets (planilha compartilhada por link) ----- */
function parseSheetUrl(u){ const m=/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(String(u||'')); if(!m) return null; const g=/[#&?]gid=(\d+)/.exec(u); return {id:m[1],gid:g?g[1]:'0'}; }
async function fetchSheetTable(src){
  const urls=[`https://docs.google.com/spreadsheets/d/${src.id}/export?format=csv&gid=${src.gid}`,`https://docs.google.com/spreadsheets/d/${src.id}/gviz/tq?tqx=out:csv&gid=${src.gid}`];
  for (const u of urls){
    try{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) continue; const txt=await r.text(); if(/^\s*<(!doctype|html)/i.test(txt)) continue;
      const t=(await readWorkbook(new File([txt],'planilha.csv',{type:'text/csv'})))[0]; if(t) return t; }catch(e){ console.warn(e); }
  }
  const e=new Error('sheet'); e.code='sheet'; throw e;
}
function sheetDialog(){
  if (S.readOnly){ toast('Acesso somente leitura.',true); return; }
  const url=el('input',{placeholder:'https://docs.google.com/spreadsheets/d/…',autocomplete:'off'}), name=el('input',{placeholder:'Ex.: Vendas 2026',maxlength:80});
  const err=el('div',{class:'form-err'});
  const content=el('div',{class:'sheet-form'},
    el('ol',{class:'steps-list'},
      el('li',{},'No Google Sheets, clique em ',el('b',{text:'Compartilhar'}),' e, em “Acesso geral”, escolha ',el('b',{text:'Qualquer pessoa com o link'}),' (Leitor).'),
      el('li',{},'Abra a aba que quer usar, copie o endereço da página e cole abaixo.')),
    fld('Link da planilha',url),fld('Nome da base',name),
    el('p',{class:'muted',style:'font-size:12.5px',text:'A base se atualiza sozinha toda vez que você abrir, e também pelo botão “Sincronizar”. Edite os dados no Google Sheets: alterações feitas aqui são substituídas na próxima sincronização.'}),err);
  const dlg=formModal('Conectar Google Sheets','',content,'Conectar planilha',async()=>{
    const src=parseSheetUrl(url.value.trim());
    if (!src){ err.textContent='Cole o link completo da planilha (começa com https://docs.google.com/spreadsheets/d/).'; url.focus(); return false; }
    err.textContent=''; dlg.ok.textContent='Lendo planilha…';
    try{
      const t=autoClean(await fetchSheetTable(src));
      const meta={id:uid8(),name:name.value.trim()||'Planilha do Google',fileName:'Google Sheets',columns:t.columns,createdAt:Date.now(),charts:autoCharts(t.columns,t.rows),cleanLog:cleanInfo(t),source:{type:'gsheet',id:src.id,gid:src.gid,syncedAt:Date.now()}};
      await saveBase(meta,t.rows);
      if (!S.bases.find(b=>b.id===meta.id)) S.bases.unshift(structuredClone(meta));
      toast(`Planilha conectada: ${nf.format(t.rows.length)} linhas.`); S.tab='dados'; openBase(meta.id);
    }catch(e){ dlg.ok.textContent='Conectar planilha'; console.error(e);
      if (e.code==='sheet'){ err.textContent='Não conseguimos ler a planilha. Confira se ela está compartilhada como “Qualquer pessoa com o link” e se o link é da aba certa.'; return false; }
      handleWriteError(e); return false; }
  },'sheet-modal');
  setTimeout(()=>url.focus(),50);
}
const syncing=new Set();
async function syncSheet(meta,silent){
  const src=meta&&meta.source; if(!src||src.type!=='gsheet'||S.readOnly||syncing.has(meta.id)) return;
  if (S.dirty){ if(!silent) toast('Salve ou descarte suas edições antes de sincronizar.',true); return; }
  syncing.add(meta.id); const t=silent?null:toast('Buscando dados no Google Sheets…',false,60000);
  try{
    const tb=autoClean(await fetchSheetTable(src));
    if (S.currentId!==meta.id||S.dirty||!S.rows) return;
    const m=structuredClone(currentMeta()), old=new Map(m.columns.map(c=>[c.name,c.type])); // mantém os tipos que a pessoa ajustou
    const cols=keepCalcs(m.columns,tb.columns.map(c=>({name:c.name,type:old.get(c.name)||c.type})));
    const rows=applyCalcs({columns:cols},tb.rows.map(r=>r.map((v,j)=>cols[j].type!==tb.columns[j].type?convert(v,cols[j].type):v)));
    if (JSON.stringify(rows)===JSON.stringify(S.rows)&&JSON.stringify(cols)===JSON.stringify(m.columns)){ if(!silent) toast('Tudo certo: a base já está igual ao Google Sheets.'); return; }
    m.columns=cols; m.source={...src,syncedAt:Date.now()};
    const names=new Set(cols.map(c=>c.name)); m.charts=(m.charts||[]).filter(c=>(!c.x||names.has(c.x))&&(!c.y||names.has(c.y))); if(!m.charts.length) m.charts=autoCharts(cols,rows);
    await saveBase(m,rows,'Antes da sincronização com o Google Sheets'); S.rows=rows; render();
    toast(`Dados atualizados com o Google Sheets (${nf.format(rows.length)} linhas).`);
  }catch(e){ console.error(e); if(!silent) toast(e.code==='sheet'?'Não foi possível ler a planilha. Confira se ela continua compartilhada como “Qualquer pessoa com o link”.':'Não foi possível sincronizar agora.',true,7000); }
  finally{ syncing.delete(meta.id); if(t) t.remove(); }
}

export { fetchSheetTable, parseSheetUrl, sheetDialog, syncSheet, syncing };
