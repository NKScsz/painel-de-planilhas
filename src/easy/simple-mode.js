import { goHome } from '../app/init.js';
import { icon, render } from '../app/render.js';
import { S } from '../core/state.js';
import { $, el, toast } from '../core/utils.ts';

/* ============ Mais fácil para quem está começando ============
   Modo simples (esconde o avançado), menu "••• Mais", resumo em poucas palavras, perguntas prontas,
   primeiros passos, ajuda e tour por tela, telas vazias que explicam e "Desfazer". */
const LS={get:(k,d=null)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } },set:(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} }};

function applySimple(){
  document.body.classList.toggle('simple',S.simple);
  const b=$('#advNav'); if(!b) return;
  b.querySelector('.nm').textContent=S.simple?'Controles avançados':'Modo simples';
  b.querySelector('.sub').textContent=S.simple?'Controles extras dos gráficos':'Mostrar só o essencial';
  b.title=S.simple?'Mostra os controles extras de cada gráfico':'Esconde os controles extras de cada gráfico';
}
function setSimple(on){
  S.simple=on; LS.set('modoSimples',on?'1':'0'); applySimple();
  render();
  toast(on?'Modo simples: só o essencial aparece. As ferramentas avançadas continuam no menu.':'Ferramentas avançadas ligadas: Consulta SQL, Ligar planilhas, Consultas de CNPJ/CEP e os controles de cada gráfico.',false,5500);
}



// menu suspenso (no celular abre de baixo). items: {label,hint,icon,onclick,danger,disabled} | {sep:true} | null
function popMenu(anchor,items,title){
  document.querySelectorAll('.pop-bg').forEach(x=>x.remove());
  const bg=el('div',{class:'pop-bg'}), m=el('div',{class:'pop-menu',role:'menu','aria-label':title||'Mais opções'});
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',key); anchor&&anchor.focus&&anchor.focus(); };
  const key=e=>{ if(e.key==='Escape') close(); };
  if (title) m.append(el('div',{class:'pop-t',text:title}));
  for (const it of items){ if(!it) continue; if(it.sep){ m.append(el('div',{class:'pop-sep'})); continue; }
    m.append(el('button',{class:'pop-it'+(it.danger?' danger':''),role:'menuitem',type:'button',disabled:!!it.disabled,onclick:()=>{ close(); it.onclick(); }},
      it.icon?icon(it.icon):el('span',{class:'pop-ic'}),el('span',{class:'pop-tx'},el('b',{text:it.label}),it.hint?el('small',{text:it.hint}):null))); }
  bg.addEventListener('click',e=>{ if(e.target===bg) close(); });
  bg.append(m); document.body.append(bg); document.addEventListener('keydown',key);
  if (innerWidth>860&&anchor){ const r=anchor.getBoundingClientRect(), w=m.offsetWidth, h=m.offsetHeight;
    m.style.left=`${Math.max(8,Math.min(r.right-w,innerWidth-w-8))}px`; m.style.top=`${r.bottom+6+h>innerHeight-8?Math.max(8,r.top-6-h):r.bottom+6}px`; }
  const f=m.querySelector('.pop-it:not(:disabled)'); if(f) f.focus();
}

// aviso com "Desfazer" (no lugar de perguntar "tem certeza?" para coisas fáceis de refazer)
function undoToast(msg,onUndo,ms=7000){
  const t=el('div',{class:'toast undo',role:'status'},el('span',{text:msg}),el('button',{class:'undo-btn',onclick:()=>{ t.remove(); onUndo(); }},'Desfazer'));
  $('#toasts').append(t); setTimeout(()=>t.remove(),ms); return t;
}

export { LS, applySimple, popMenu, setSimple, undoToast };
