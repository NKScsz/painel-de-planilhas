import { currentMeta, openBaseTab } from '../app/init.js';
import { render } from '../app/render.js';
import { S } from '../core/state.js';
import { el } from '../core/utils.ts';
import { LS } from './simple-mode.js';
import { goalDialog } from '../features/goals.js';
import { pickFile } from '../import/upload.js';

/* ----- Primeiros passos (tela inicial) ----- */
function markStep(k){ if(LS.get('ck_'+k)!=='1') LS.set('ck_'+k,'1'); }
function checklist(){
  if (S.readOnly||S.mode==='share'||LS.get('ckHide')==='1') return null;
  const b=S.bases[0];
  const steps=[
    {t:'Enviar uma planilha',d:'Excel, CSV, extrato em PDF ou foto de uma tabela',done:S.bases.length>0,go:()=>pickFile('new'),bt:'Enviar'},
    {t:'Ver os gráficos',d:'Prontos sozinhos, cada um com explicação',done:LS.get('ck_ch')==='1',go:()=>openBaseTab(b.id,'graficos'),bt:'Ver gráficos'},
    {t:'Criar uma meta',d:'Por exemplo, faturamento do mês ou limite de gastos',done:S.bases.some(x=>(x.goals||[]).length),go:async()=>{ await openBaseTab(b.id,'graficos'); const m=currentMeta(); if(m&&S.rows) goalDialog(m); },bt:'Criar meta'},
    {t:'Gerar um relatório',d:'PDF pronto para enviar ou mandar no WhatsApp',done:LS.get('ck_rep')==='1',go:()=>openBaseTab(b.id,'relatorios'),bt:'Abrir relatórios'}];
  const n=steps.filter(s=>s.done).length; if(n===steps.length) return null;
  const nextI=steps.findIndex(s=>!s.done);
  return el('section',{class:'ck','aria-label':'Primeiros passos'},
    el('div',{class:'ck-h'},el('h2',{text:'Primeiros passos'}),el('span',{class:'ck-n',text:`${n} de ${steps.length} feitos`}),el('span',{class:'spacer'}),
      el('button',{class:'btn sm',title:'Esconder esta lista',onclick:()=>{ LS.set('ckHide','1'); render(); }},'Esconder')),
    el('div',{class:'ck-bar'},el('i',{style:`width:${n/steps.length*100}%`})),
    el('div',{class:'ck-list'},steps.map((s,i)=>el('div',{class:'ck-step'+(s.done?' done':'')+(i===nextI?' next':'')},
      el('div',{class:'t'},el('span',{class:'c',text:s.done?'✓':String(i+1)}),s.t),el('small',{text:s.d}),
      s.done?null:el('button',{class:'btn sm'+(i===nextI?' primary':''),disabled:i>0&&!b,onclick:s.go},s.bt)))));
}

export { checklist, markStep };
