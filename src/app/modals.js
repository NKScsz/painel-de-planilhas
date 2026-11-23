import { el } from '../core/utils.ts';

/* ============ Modais ============ */
function modal(title,text,content,buttons){
  const bg=el('div',{class:'modal-bg'}); const close=()=>bg.remove();
  bg.addEventListener('click',e=>{ if(e.target===bg) close(); });
  const m=el('div',{class:'modal',role:'dialog','aria-modal':'true'},el('h3',{text:title}),text?el('p',{text}):null,content,
    el('div',{class:'actions'},buttons.map(b=>el('button',{class:'btn'+(b.primary?' primary':'')+(b.danger?' danger':''),onclick:async()=>{ close(); if(b.onclick) await b.onclick(); }},b.label))));
  bg.append(m); document.body.append(bg);
  document.addEventListener('keydown',function k(e){ if(e.key==='Escape'){close();document.removeEventListener('keydown',k);} });
  return close;
}
function confirmBox(title,text,okLabel){ return new Promise(res=>{ modal(title,text,null,[{label:'Cancelar',onclick:()=>res(false)},{label:okLabel,danger:true,onclick:()=>res(true)}]); const bg=document.querySelector('.modal-bg:last-child'); bg.addEventListener('click',e=>{if(e.target===bg)res(false);}); }); }

export { confirmBox, modal };
