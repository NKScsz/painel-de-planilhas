import { render } from '../app/render.js';
import { S } from '../core/state.js';
import { deleteBase } from '../core/storage.js';
import { el, nf, toast } from '../core/utils.ts';
import { fld, formModal } from './extras.js';
import { unpublishShare } from './share.js';
import { saveModel } from '../views/data-model.js';

/* ----- Excluir várias bases de uma vez ----- */
async function bulkDelete(ids){
  if (S.readOnly) return;
  const metas=S.bases.filter(b=>ids.includes(b.id)); if(!metas.length) return;
  const all=metas.length===S.bases.length, n=metas.length, shared=metas.filter(m=>m.share&&m.share.token).length;
  // confirmação digitando EXCLUIR: apagar várias bases não tem volta
  const inp=el('input',{placeholder:'EXCLUIR',autocomplete:'off','aria-label':'Digite EXCLUIR para confirmar'}), err=el('div',{class:'form-err'});
  const names=el('ul',{class:'del-list'},metas.slice(0,8).map(m=>el('li',{},el('b',{text:m.name}),` · ${nf.format(m.rowCount||0)} linhas`)),n>8?el('li',{class:'muted',text:`e mais ${n-8}`}):null);
  const ok=await new Promise(res=>{
    const dlg=formModal(all?`Excluir todas as ${n} bases?`:`Excluir ${n} ${n===1?'base':'bases'}?`,
      `As bases abaixo e todos os dados delas serão apagados da sua conta. Isso não pode ser desfeito.${shared?` ${shared===1?'O link de compartilhamento/TV dela também será desativado.':`Os links de compartilhamento/TV de ${shared} delas também serão desativados.`}`:''}`,
      el('div',{class:'del-box'},names,fld('Para confirmar, digite EXCLUIR',inp),err),'Excluir definitivamente',()=>{
        if (inp.value.trim().toUpperCase()!=='EXCLUIR'){ err.textContent='Digite EXCLUIR para confirmar.'; inp.focus(); return false; }
        res(true); },'del-modal');
    dlg.ok.classList.remove('primary'); dlg.ok.classList.add('danger');
    const close=dlg.close; dlg.m.parentElement.addEventListener('click',e=>{ if(e.target===dlg.m.parentElement) res(false); });
    dlg.m.querySelector('.actions .btn').addEventListener('click',()=>res(false));
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') dlg.ok.click(); });
    const esc=e=>{ if(e.key==='Escape'){ document.removeEventListener('keydown',esc); res(false); } }; document.addEventListener('keydown',esc);
    setTimeout(()=>inp.focus(),50); void close;
  });
  if (!ok) return;
  const t=toast(`Excluindo 0 de ${n}…`,false,600000); let done=0, fail=0;
  const gone=new Set();
  for (const m of metas){
    try{ if(m.share&&m.share.token&&S.mode==='cloud') await unpublishShare(m.share.token).catch(e=>console.warn(e));
      await deleteBase(m); gone.add(m.id); done++; }
    catch(e){ console.error(e); fail++; }
    t.textContent=`Excluindo ${done+fail} de ${n}…`;
  }
  t.remove();
  S.bases=S.bases.filter(b=>!gone.has(b.id)); if(S.sel) for(const id of gone) S.sel.delete(id);
  if (gone.has(S.currentId)){ S.currentId=null; S.rows=null; S.dirty=false; }
  for (const id of gone) delete S.rowCache[id];
  // relações do modelo de dados que apontavam para as bases apagadas
  const rels=(S.model.relationships||[]).filter(r=>!gone.has(r.from?.base)&&!gone.has(r.to?.base));
  if (rels.length!==(S.model.relationships||[]).length){ S.model={...S.model,relationships:rels}; saveModel({relationships:rels}); }
  toast(fail?`${done} ${done===1?'base excluída':'bases excluídas'}; ${fail} não ${fail===1?'pôde':'puderam'} ser excluída(s). Tente de novo.`:`${done} ${done===1?'base excluída':'bases excluídas'}.`,!!fail);
  S.view='home'; render();
}

export { bulkDelete };
