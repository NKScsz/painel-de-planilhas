import { currentMeta } from '../app/init.js';
import { icon, render } from '../app/render.js';
import { autoCharts, distinctCount } from '../charts/auto-charts.js';
import { chartCard, persistCharts } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { el, toast } from '../core/utils.ts';
import { askSection } from '../easy/ask.js';
import { markStep } from '../easy/checklist.js';
import { autoTour, helpBar } from '../easy/help.js';
import { undoToast } from '../easy/simple-mode.js';
import { easySummary } from '../easy/summary.js';
import { anomaliesSection } from '../features/anomalies.js';
import { cleanNote } from '../features/auto-clean.js';
import { QUICK_PER, vizPrev } from '../features/compare.js';
import { rangeTxt } from '../features/extras.js';
import { goalsSection } from '../features/goals.js';
import { templatesDialog } from '../features/templates.js';
import { vizData } from './data-model.js';
import { chartDialog, computeKpis } from './new-chart.js';
import { periodRange } from './reports-tab.js';

/* ----- Aba Visualização ----- */
function vizRows(meta){
  const f=S.vfilter; let rows=S.rows;
  if (f.col){ const j=meta.columns.findIndex(c=>c.name===f.col); if(j>=0&&f.val!=='') rows=rows.filter(r=>String(r[j]??'(vazio)')===f.val); }
  const dj=meta.columns.findIndex(c=>c.type==='date');
  if (dj>=0&&(f.from||f.to)) rows=rows.filter(r=>{ const v=r[dj]; if(!v||!/^\d{4}/.test(v)) return false; return (!f.from||v>=f.from)&&(!f.to||v<=f.to); });
  return rows;
}
function renderViz(view,meta){
  if (S.mode!=='share'){ const cn=cleanNote(meta); if(cn) view.append(cn); }
  const cats=meta.columns.map((c,j)=>({c,j})).filter(({c,j})=>c.type==='text'&&distinctCount(S.rows,j,200)<=200);
  const dcol=meta.columns.find(c=>c.type==='date');
  // filtros
  const colSel=el('select',{},el('option',{value:'',text:'Nenhum'}),cats.map(({c})=>el('option',{value:c.name,selected:S.vfilter.col===c.name,text:c.name})));
  const valSel=el('select',{disabled:!S.vfilter.col});
  if (S.vfilter.col){ const j=meta.columns.findIndex(c=>c.name===S.vfilter.col); const vals=[...new Set(S.rows.map(r=>String(r[j]??'(vazio)')))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})); valSel.append(el('option',{value:'',text:'Todos'}),vals.map(v=>el('option',{value:v,selected:S.vfilter.val===v,text:v}))); }
  colSel.onchange=()=>{S.vfilter.col=colSel.value;S.vfilter.val='';render();};
  valSel.onchange=()=>{S.vfilter.val=valSel.value;render();};
  const fBox=el('div',{class:'filters'},
    el('label',{class:'field'},'Filtrar por',colSel),
    el('label',{class:'field'},'Valor',valSel));
  if (dcol){
    const from=el('input',{type:'date',value:S.vfilter.from}), to=el('input',{type:'date',value:S.vfilter.to});
    from.onchange=()=>{S.vfilter.from=from.value;render();}; to.onchange=()=>{S.vfilter.to=to.value;render();};
    fBox.append(el('label',{class:'field'},`${dcol.name}: de`,from),el('label',{class:'field'},'até',to));
    // atalhos de período (também ligam a comparação com o período anterior)
    fBox.prepend(el('div',{class:'qper'},el('span',{class:'qper-lb',text:'Período'}),QUICK_PER.map(([k,t])=>{
      const rg=periodRange(k), on=k==='all'?!S.vfilter.from&&!S.vfilter.to:!!rg&&S.vfilter.from===rg.from&&S.vfilter.to===rg.to;
      return el('button',{class:'qp'+(on?' on':''),'aria-pressed':String(on),onclick:()=>{ S.vfilter.from=rg?rg.from:''; S.vfilter.to=rg?rg.to:''; render(); }},t); })));
  }
  if (S.vfilter.col||S.vfilter.from||S.vfilter.to) fBox.append(el('button',{class:'btn sm',onclick:()=>{S.vfilter={col:'',val:'',from:'',to:''};render();}},'Limpar filtros'));
  if (!S.readOnly) fBox.append(el('div',{class:'f-tools'},
    el('button',{class:'btn sm',title:'Painéis prontos para vendas, financeiro, estoque, RH e marketing',onclick:()=>templatesDialog(meta)},icon('layout'),'Modelos de painel'),
    el('button',{class:'btn sm',title:'Troca os gráficos desta planilha pelos que o painel monta a partir dos dados',onclick:()=>remakeCharts(meta)},icon('refresh'),'Refazer gráficos')));
  view.prepend(helpBar('graficos'));
  view.append(fBox);
  const rows=vizRows(meta), prev=vizPrev(meta);
  markStep('ch');
  const es=easySummary(meta,rows,prev); if(es) view.append(es);
  // KPIs (com variação em relação ao período anterior quando há um período escolhido)
  const k=el('div',{class:'kpis'});
  for (const x of computeKpis(meta,rows,prev))
    k.append(el('div',{class:'kpi',title:x.title||null},el('div',{class:'lb',text:x.lb}),el('div',{class:'vl',style:x.small?'font-size:17px;margin-top:9px':null,text:x.vl}),
      x.d?el('div',{class:'dl '+(x.d.good==null?'eq':x.d.good?'up':'down'),title:`Comparado com ${rangeTxt(prev.range)}`},el('span',{'aria-hidden':'true',text:x.d.dir>0?'▲ ':x.d.dir<0?'▼ ':'■ '}),`${x.d.txt.replace(/^[+-]/,'')} vs período anterior`):null,
      x.sm?el('div',{class:'sm',text:x.sm}):null));
  view.append(k);
  if (dcol) view.append(el('div',{class:'cmp-note',text:prev?`Variações comparadas com ${rangeTxt(prev.range)}.`:'Escolha um período (por exemplo, “Este mês”) para comparar os indicadores com o período anterior.'}));
  if (S.mode!=='share'){ const ask=askSection(meta); if(ask) view.append(ask); }
  const an=anomaliesSection(meta); if(an) view.append(an);
  const gsec=goalsSection(meta); if(gsec) view.append(gsec);
  // gráficos
  const grid=el('div',{class:'charts'}); view.append(grid);
  const list=meta.charts||[];
  const vd=vizData(meta); // inclui colunas das bases conectadas no modelo de dados
  for (const spec of list) grid.append(chartCard(vd.vmeta,spec,vd.rows));
  if (!list.length) grid.append(el('div',{class:'teach'},el('b',{text:'Ainda não há gráficos nesta planilha'}),
    el('p',{text:'Gráficos mostram de um jeito visual o que está nos números: o que cresceu, quem vendeu mais, onde foi o dinheiro. O painel pode montá-los sozinho a partir das colunas.'}),
    S.readOnly?null:el('div',{class:'teach-btns'},el('button',{class:'btn primary',onclick:()=>remakeCharts(meta)},'Montar gráficos automaticamente'),el('button',{class:'btn',onclick:()=>chartDialog(meta)},'Escolher um gráfico'))));
  if (!S.readOnly&&list.length) grid.append(el('button',{class:'add-card',onclick:()=>chartDialog(meta)},el('span',{class:'add-in'},icon('plus',18),'Adicionar gráfico')));
  autoTour('graficos');
}
// refaz os gráficos a partir dos dados, com "Desfazer" em vez de pergunta
function remakeCharts(meta){
  const before=structuredClone(meta.charts||[]), m=structuredClone(meta); m.charts=autoCharts(m.columns.filter(c=>!c.virtual),S.rows);
  persistCharts(m);
  if (before.length) undoToast('Gráficos refeitos a partir dos dados.',()=>{ const cur=structuredClone(currentMeta()); cur.charts=before; persistCharts(cur); toast('Gráficos anteriores de volta.'); });
  else toast(`${m.charts.length} gráficos montados, cada um com explicação.`);
}

export { remakeCharts, renderViz, vizRows };
