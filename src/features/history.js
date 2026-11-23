import { currentMeta, downloads } from '../app/init.js';
import { confirmBox } from '../app/modals.js';
import { render } from '../app/render.js';
import { autoCharts } from '../charts/auto-charts.js';
import { hashStr } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { basesCol, chunkRows, cid, handleWriteError, queue, retry, saveBase } from '../core/storage.js';
import { el, fmtWhen, nf, toast, uid8 } from '../core/utils.ts';
import { formModal } from './extras.js';

/* ----- Histórico de versões -----
   Antes de cada gravação de linhas, a versão anterior da base (a que estava aberta) é guardada em
   bases/{id}/versions/{vid} (+ chunks). Ficam as 5 mais recentes. Sem login, ficam só nesta aba. */
const MAX_VERSIONS=5;
const verCol=id=>basesCol().doc(id).collection('versions');
function setBaseline(meta,rows){ S.baseline={id:meta.id,rows:rows.map(r=>r.slice()),columns:structuredClone(meta.columns.filter(c=>!c.virtual)),sig:rows.length+':'+hashStr(JSON.stringify(rows))}; }
async function snapshotVersion(meta,reason){
  const b=S.baseline; if(!b||b.id!==meta.id||!b.rows.length) return;
  const at=Date.now(), v={id:uid8(),at,reason:reason||'Antes de uma alteração',rowCount:b.rows.length,columns:b.columns};
  if (S.mode!=='cloud'){ const L=(S.localVersions=S.localVersions||{})[meta.id]=(S.localVersions?.[meta.id]||[]); L.unshift({...v,rows:b.rows}); L.splice(MAX_VERSIONS); S.baseline=null; return; }
  S.baseline=null; // a próxima versão só depois de recarregar o que foi salvo
  try{
    await queue(async()=>{
      const chunks=chunkRows(b.rows), ref=verCol(meta.id).doc(v.id);
      for (let i=0;i<chunks.length;i++) await retry(()=>ref.collection('chunks').doc(cid(i)).set({json:JSON.stringify(chunks[i])}));
      await retry(()=>ref.set({...v,chunkCount:chunks.length}));
      const all=(await verCol(meta.id).get()).docs.map(d=>d.data()).sort((a,b)=>b.at-a.at);
      for (const old of all.slice(MAX_VERSIONS)) await deleteVersion(meta.id,old);
    });
  }catch(e){ console.warn('versão não salva',e); }
}
async function deleteVersion(baseId,v){
  const ref=verCol(baseId).doc(v.id);
  for (let i=0;i<(v.chunkCount||0);i++) await retry(()=>ref.collection('chunks').doc(cid(i)).delete());
  await retry(()=>ref.delete());
}
async function listVersions(meta){
  if (S.mode!=='cloud') return (S.localVersions?.[meta.id]||[]);
  return (await verCol(meta.id).get()).docs.map(d=>d.data()).sort((a,b)=>b.at-a.at);
}
async function versionRows(meta,v){
  if (v.rows) return v.rows.map(r=>r.slice());
  const snap=await verCol(meta.id).doc(v.id).collection('chunks').get();
  const rows=[]; for (const d of snap.docs.filter(d=>parseInt(d.id,10)<(v.chunkCount||0)).sort((a,b)=>a.id<b.id?-1:1)) for(const r of JSON.parse(d.data().json||'[]')) rows.push(r);
  return rows;
}
async function historyDialog(meta){
  const box=el('div',{class:'hist-list'},el('div',{class:'muted'},el('span',{class:'spinner'}),'  Carregando versões…'));
  const dlg=formModal('Histórico da base',`Antes de cada alteração, guardamos a versão anterior da base. Ficam as ${MAX_VERSIONS} mais recentes${S.mode==='cloud'?'':' (sem login, só enquanto esta aba estiver aberta)'}.`,box,null,null,'hist-modal');
  let list=[]; try{ list=await listVersions(meta); }catch(e){ console.error(e); box.innerHTML=''; box.append(el('div',{class:'form-err',text:'Não foi possível carregar o histórico agora.'})); return; }
  box.innerHTML='';
  box.append(el('div',{class:'hist-item cur'},el('div',{},el('b',{text:'Versão atual'}),el('div',{class:'muted',text:`${nf.format(S.rows?S.rows.length:meta.rowCount||0)} linhas · ${meta.columns.length} colunas · ${fmtWhen(meta.updatedAt)}`})),el('span',{class:'chip',text:'em uso'})));
  if (!list.length) box.append(el('p',{class:'muted',style:'font-size:13px',text:'Ainda não há versões anteriores. Elas aparecem aqui depois da próxima alteração nos dados (edição, nova planilha, limpeza, sincronização…).'}));
  for (const v of list) box.append(el('div',{class:'hist-item'},
    el('div',{},el('b',{text:fmtWhen(v.at)}),el('div',{class:'muted',text:`${v.reason} · ${nf.format(v.rowCount)} linhas · ${v.columns.length} colunas`})),
    el('div',{class:'hist-btns'},
      el('button',{class:'btn sm',onclick:async()=>{ try{ const rows=await versionRows(meta,v); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([v.columns.map(c=>c.name),...rows]),'Dados');
        await downloads.save({filename:`${meta.name.replace(/[\\/:*?"<>|]/g,'_')} - versão ${new Date(v.at).toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`,data:new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})])}); }catch(e){ toast('Não foi possível baixar esta versão.',true); } }},'Baixar'),
      S.readOnly?null:el('button',{class:'btn sm primary',onclick:async()=>{
        if (S.dirty){ toast('Salve ou descarte suas edições antes de restaurar.',true); return; }
        if (!await confirmBox('Restaurar esta versão?',`A base volta a ficar como estava em ${fmtWhen(v.at)} (${nf.format(v.rowCount)} linhas). A versão atual vai para o histórico, então dá para desfazer.`,'Restaurar')) return;
        const t=toast('Restaurando…',false,60000);
        try{ const rows=await versionRows(meta,v), m=structuredClone(currentMeta()); m.columns=structuredClone(v.columns);
          const names=new Set(m.columns.map(c=>c.name)); m.charts=(m.charts||[]).filter(c=>(!c.x||names.has(c.x))&&(!c.y||names.has(c.y))); if(!m.charts.length) m.charts=autoCharts(m.columns,rows);
          await saveBase(m,rows,'Antes de restaurar uma versão'); S.rows=rows; S.dirty=false; setBaseline(m,rows); t.remove(); dlg.close(); toast('Versão restaurada.'); render(); }
        catch(e){ t.remove(); handleWriteError(e); } }},'Restaurar'))));
}

export { MAX_VERSIONS, deleteVersion, historyDialog, listVersions, setBaseline, snapshotVersion, verCol, versionRows };
