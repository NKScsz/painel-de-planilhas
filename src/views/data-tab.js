import { currentMeta, downloads, openBase } from '../app/init.js';
import { confirmBox, modal } from '../app/modals.js';
import { icon, render, tyIcon } from '../app/render.js';
import { S } from '../core/state.js';
import { deleteBase, handleWriteError, loadRows, saveBase } from '../core/storage.js';
import { el, fmtDate, nf, toast } from '../core/utils.ts';
import { convert, display } from '../core/values.ts';
import { autoTour, helpBar } from '../easy/help.js';
import { popMenu, undoToast } from '../easy/simple-mode.js';
import { cleanNote } from '../features/auto-clean.js';
import { calcDialog } from '../features/calc-columns.js';
import { categorizeDialog } from '../features/categorize.js';
import { cleanDialog } from '../features/clean.js';
import { enrichDialog } from '../features/cnpj-cep.js';
import { historyDialog } from '../features/history.js';
import { unpublishShare } from '../features/share.js';
import { pickFile } from '../import/upload.js';

/* ----- Aba Dados ----- */
function filteredIdx(meta){
  const q=S.search.trim().toLowerCase();
  let idx=S.rows.map((_,i)=>i);
  if (q) idx=idx.filter(i=>S.rows[i].some((v,j)=>v!=null&&display(v,meta.columns[j].type).toLowerCase().includes(q)));
  if (S.sort.col>=0){ const j=S.sort.col, d=S.sort.dir, num=meta.columns[j].type==='number';
    idx.sort((a,b)=>{ const x=S.rows[a][j], y=S.rows[b][j]; if(x==null&&y==null) return 0; if(x==null) return 1; if(y==null) return -1; return (num&&typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'pt-BR',{numeric:true}))*d; }); }
  return idx;
}
function renderData(view,meta){
  if (S.dirty) view.append(el('div',{class:'dirtybar'},el('b',{text:'Alterações não salvas'}),el('span',{class:'spacer'}),
    el('button',{class:'btn sm',onclick:async()=>{S.dirty=false;S.loadingRows=true;render();S.rows=await loadRows(meta);S.loadingRows=false;render();}},'Descartar'),
    el('button',{class:'btn sm primary',onclick:saveEdits},'Salvar alterações')));
  const cn=cleanNote(meta); if(cn) view.append(cn);
  const searchIn=el('input',{placeholder:'Buscar',title:'Busca em todas as colunas',value:S.search});
  const sw=el('div',{class:'search'},searchIn); sw.prepend(svgSearch());
  let st; searchIn.addEventListener('input',()=>{clearTimeout(st);st=setTimeout(()=>{S.search=searchIn.value;S.page=0;drawTable();},180);});
  const countEl=el('span',{class:'count'});
  view.append(el('div',{class:'toolbar'},sw,
    el('button',{class:'btn',onclick:addRow,disabled:S.readOnly,title:'Adiciona uma linha em branco para digitar'},icon('plus'),'Linha'),
    el('button',{class:'btn','data-tour':'clean',onclick:()=>{ if(S.dirty){ toast('Salve ou descarte suas edições antes de arrumar os dados.',true); return; } cleanDialog(meta); },disabled:S.readOnly,title:'Encontra espaços sobrando, nomes escritos de jeitos diferentes, tipos errados, linhas vazias e repetidas'},icon('clean'),'Arrumar dados'),
    el('button',{class:'btn','data-tour':'tools','aria-haspopup':'menu',onclick:e=>{ const need=fn=>()=>{ if(S.dirty){ toast('Salve ou descarte suas edições antes.',true); return; } fn(); };
      popMenu(e.currentTarget,[
        {icon:'columns',label:'Colunas e tipos',hint:'Renomear colunas e dizer se são texto, número ou data',onclick:()=>columnsDialog(meta),disabled:S.readOnly},
        {icon:'formula',label:'Coluna com fórmula',hint:'Calcule lucro, margem, mês, faixa de valor…',onclick:need(()=>calcDialog(meta)),disabled:S.readOnly},
        {icon:'history',label:'Versões anteriores',hint:'Veja e volte para como a planilha estava antes',onclick:()=>historyDialog(meta)},
        {icon:'tag',label:'Separar lançamentos por categoria',hint:'Para extratos: mercado, transporte, contas…',onclick:need(()=>categorizeDialog(meta)),disabled:S.readOnly},
        {icon:'building',label:'Completar dados pelo CNPJ ou CEP',hint:'Busca razão social, situação, cidade ou endereço',onclick:need(()=>enrichDialog(meta)),disabled:S.readOnly}],'Mais ferramentas'); }},icon('more'),'Mais ferramentas'),
    countEl));
  view.prepend(helpBar('dados'));
  autoTour('dados');
  const card=el('div',{class:'table-card'}); view.append(card);
  view.append(el('div',{class:'muted',style:'font-size:12px;margin-top:8px',text:S.readOnly?'':meta.source?.type==='gdrive'?'Esta planilha vem do Google Drive: edite o arquivo lá e toque em Atualizar. Alterações feitas aqui são substituídas na próxima atualização.':meta.source?.type==='gsheet'?'Esta base vem do Google Sheets: edite os dados lá. Alterações feitas aqui são substituídas na próxima sincronização.':'Dica: dê dois cliques numa célula para editar.'}));
  function drawTable(){
    card.innerHTML='';
    const idx=filteredIdx(meta);
    const pages=Math.max(1,Math.ceil(idx.length/S.pageSize)); if(S.page>=pages) S.page=pages-1;
    countEl.textContent=`${nf.format(idx.length)} de ${nf.format(S.rows.length)} linhas`;
    const thead=el('tr',{},meta.columns.map((c,j)=>el('th',{class:(c.type==='number'?'num':'')+(c.calc?' calc-th':''),title:c.calc?`Coluna calculada: ${c.calc}`:'Ordenar',onclick:()=>{ S.sort = S.sort.col===j?{col:j,dir:-S.sort.dir}:{col:j,dir:1}; drawTable(); }},
      c.calc&&!S.readOnly?el('button',{class:'calc-ed',title:'Editar fórmula',onclick:e=>{ e.stopPropagation(); if(S.dirty){ toast('Salve ou descarte suas edições antes.',true); return; } calcDialog(meta,j); }},'ƒ'):c.calc?el('span',{class:'calc-ed',text:'ƒ'}):null,
      tyIcon(c.type), c.name, S.sort.col===j?(S.sort.dir>0?' ↑':' ↓'):'')), S.readOnly?null:el('th',{}));
    const tb=el('tbody');
    for (const i of idx.slice(S.page*S.pageSize,(S.page+1)*S.pageSize)){
      const r=S.rows[i];
      const tr=el('tr');
      meta.columns.forEach((c,j)=>{
        const v=r[j]; const td=el('td',{class:(c.type==='number'?'num ':'')+(S.readOnly||c.calc?'':'edit')+(c.calc?' calc-td':''),title:c.calc?'Valor calculado pela fórmula':v==null?'':display(v,c.type)});
        if (v==null||v==='') td.append(el('span',{class:'null',text:'—'})); else td.textContent=display(v,c.type);
        if (!S.readOnly&&!c.calc) td.addEventListener('dblclick',()=>editCell(td,i,j,meta));
        tr.append(td);
      });
      if (!S.readOnly) tr.append(el('td',{class:'rowact'},el('button',{class:'icon-btn',title:'Excluir linha','aria-label':'Excluir linha',onclick:()=>{ const was=S.dirty, row=S.rows[i]; S.rows.splice(i,1); S.dirty=true; render(); undoToast('Linha removida (ainda não salvo).',()=>{ S.rows.splice(i,0,row); S.dirty=was; render(); }); }},icon('trash'))));
      tb.append(tr);
    }
    if (!idx.length) tb.append(el('tr',{},el('td',{colspan:meta.columns.length+1,class:'muted',style:'text-align:center;padding:30px',text:S.rows.length?'Nenhuma linha tem o que você buscou. Confira a escrita ou apague a busca.':'Esta planilha está vazia. Use “+ Linha” para digitar ou “••• Mais → Atualizar com nova planilha” no topo para enviar os dados.'})));
    card.append(el('div',{class:'table-scroll'},el('table',{class:'data'},el('thead',{},thead),tb)));
    card.append(el('div',{class:'pager'},
      el('span',{text:`Página ${S.page+1} de ${pages}`}),
      el('button',{class:'btn sm',disabled:S.page===0,onclick:()=>{S.page--;drawTable();}},'‹ Anterior'),
      el('button',{class:'btn sm',disabled:S.page>=pages-1,onclick:()=>{S.page++;drawTable();}},'Próxima ›')));
  }
  drawTable();
}
function svgSearch(){ return icon('search'); }
function editCell(td,i,j,meta){
  const c=meta.columns[j]; const v=S.rows[i][j];
  const inp=el('input',{value:v==null?'':(c.type==='date'?fmtDate(v):(c.type==='number'&&typeof v==='number'?String(v).replace('.',','):String(v)))});
  td.innerHTML=''; td.append(inp); inp.focus(); inp.select();
  let done=false;
  const commit=save=>{ if(done) return; done=true; if(save){ const nv=convert(inp.value,c.type); if(nv!==v){ S.rows[i][j]=nv; S.dirty=true; } } render(); };
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') commit(true); if(e.key==='Escape') commit(false); });
  inp.addEventListener('blur',()=>commit(true));
}
function addRow(){ const m=currentMeta(); S.rows.unshift(new Array(m.columns.length).fill(null)); S.dirty=true; S.search=''; S.sort={col:-1,dir:1}; S.page=0; render(); }
async function saveEdits(){
  const meta=structuredClone(currentMeta()); const t=toast('Salvando…',false,60000);
  try{ await saveBase(meta,S.rows,'Antes da edição manual'); S.dirty=false; t.remove(); toast('Alterações salvas.'); render(); }catch(e){ t.remove(); handleWriteError(e); }
}
function columnsDialog(meta){
  const m=structuredClone(meta);
  const rows=m.columns.map((c,j)=>{ const sel=el('select',{},['text','number','date'].map(t=>el('option',{value:t,selected:c.type===t},{text:'Texto',number:'Número',date:'Data'}[t]))); sel.onchange=()=>{c.type=sel.value;}; return el('div',{class:'col-row'},el('span',{text:c.name,title:c.name}),sel); });
  modal('Colunas e tipos','O tipo define como cada coluna é ordenada, somada e usada nos gráficos. Ex.: códigos e CPFs devem ser Texto.',rows,[
    {label:'Cancelar'},
    {label:'Aplicar',primary:true,onclick:async()=>{
      const changed=m.columns.map((c,j)=>c.type!==meta.columns[j].type);
      if (!changed.some(Boolean)) return;
      S.rows=S.rows.map(r=>r.map((v,j)=>changed[j]?convert(v,m.columns[j].type):v));
      const t=toast('Salvando…',false,60000);
      try{ await saveBase(m,S.rows,'Antes de mudar os tipos das colunas'); t.remove(); toast('Tipos atualizados.'); }catch(e){ t.remove(); handleWriteError(e); }
      render();
    }}]);
}
function updateDialog(){
  const close=modal('Atualizar com nova planilha','Escolha como usar o novo arquivo nesta base:',[
    el('button',{class:'choice',onclick:()=>{close();pickFile('append');}},el('div',{},el('b',{text:'Adicionar linhas ao final'}),el('small',{text:'Mantém os dados atuais e junta as novas linhas (colunas casadas pelo nome).'}))),
    el('button',{class:'choice',onclick:()=>{close();pickFile('replace');}},el('div',{},el('b',{text:'Substituir todos os dados'}),el('small',{text:'Troca o conteúdo da base pela nova planilha (só a primeira aba).'})))
  ],[{label:'Cancelar'}]);
}
async function removeBase(meta){
  const ok=await confirmBox('Excluir esta base?',`“${meta.name}” e todos os seus dados serão apagados da sua conta. Isso não pode ser desfeito.`,'Excluir');
  if (!ok) return;
  try{ if(meta.share&&meta.share.token&&S.mode==='cloud') await unpublishShare(meta.share.token).catch(e=>console.warn(e));
    await deleteBase(meta); S.currentId=null; S.rows=null; S.dirty=false; toast('Base excluída.'); if(S.mode!=='cloud'){ S.bases.length?openBase(S.bases[0].id):render(); } else { S.bases=S.bases.filter(b=>b.id!==meta.id); S.bases.length?openBase(S.bases[0].id):render(); } }catch(e){ handleWriteError(e); }
}
function toCsv(meta){
  const esc=v=>{ if(v==null) return ''; const s=String(v); return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const lines=[meta.columns.map(c=>esc(c.name)).join(';')];
  for (const r of S.rows) lines.push(r.map((v,j)=>esc(meta.columns[j].type==='number'&&typeof v==='number'?String(v).replace('.',','):(meta.columns[j].type==='date'?fmtDate(v):v))).join(';'));
  return lines.join('\n');
}
async function copyCsv(){ const meta=currentMeta(); try{ await navigator.clipboard.writeText(toCsv(meta)); toast('CSV copiado. Cole no Excel ou Google Planilhas.'); }catch(e){ toast('O navegador bloqueou a cópia.',true); } }
async function exportXlsx(){
  const meta=currentMeta();
  const aoa=[meta.columns.map(c=>c.name),...S.rows.map(r=>r.map((v,j)=>meta.columns[j].type==='date'&&v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?new Date(v+'T12:00:00'):v))];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa,{cellDates:true}),'Dados');
  const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  const filename=(meta.name.replace(/[\\/:*?"<>|]/g,'_')||'dados')+'.xlsx';
  const blob=new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  try{ await downloads.save({filename,data:blob}); }
  catch(e){ try{ await downloads.save({filename,data:new Uint8Array(out)}); }catch(e2){ if(e2&&e2.code!=='cancelled'&&e2.code!=='declined') toast('Download não concluído.',true); } }
}

export { addRow, columnsDialog, copyCsv, editCell, exportXlsx, filteredIdx, removeBase, renderData, saveEdits, svgSearch, toCsv, updateDialog };
