import { el, fmtDate } from '../core/utils.ts';

/* ============ Recursos extras ============
   Comparação com o período anterior, metas, tendência, link público, Google Sheets, categorização de
   extratos, limpeza de dados, modelos por tipo de negócio e marca própria nos relatórios.
   Tudo roda no navegador e cabe no plano gratuito do Firebase. */
const fold=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const dayOf=v=>(v&&/^\d{4}-\d{2}-\d{2}/.test(v))?String(v).slice(0,10):null;
const monthEnd=d=>new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
const pDate=s=>new Date(s+'T12:00:00');
const inRange=(rows,dj,r)=>rows.filter(x=>{ const d=dayOf(x[dj]); return d&&d>=r.from&&d<=r.to; });
const rangeTxt=r=>`${fmtDate(r.from)} a ${fmtDate(r.to)}`;
const fld=(label,input)=>el('label',{class:'field'},label,input);
// modal com formulário: onOk devolve false para manter aberto (erro de validação)
function formModal(title,text,content,okLabel,onOk,cls=''){
  const bg=el('div',{class:'modal-bg'}); const onKey=e=>{ if(e.key==='Escape') close(); };
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); };
  bg.addEventListener('click',e=>{ if(e.target===bg) close(); }); document.addEventListener('keydown',onKey);
  const ok=okLabel?el('button',{class:'btn primary',onclick:async()=>{ ok.disabled=true; try{ if(await onOk()!==false) close(); }finally{ ok.disabled=false; } }},okLabel):null;
  const m=el('div',{class:'modal '+cls,role:'dialog','aria-modal':'true'},el('h3',{text:title}),text?el('p',{text}):null,content,
    el('div',{class:'actions'},el('button',{class:'btn',onclick:close},okLabel?'Cancelar':'Fechar'),ok));
  bg.append(m); document.body.append(bg); return {close,m,ok};
}

export { dayOf, fld, fold, formModal, inRange, monthEnd, pDate, rangeTxt };
