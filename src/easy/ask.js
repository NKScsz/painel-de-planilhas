import { currentMeta } from '../app/init.js';
import { autoCharts, chartKey, isTimeCol } from '../charts/auto-charts.js';
import { aggregate, chartLabels, describeChart, makeChart, persistCharts } from '../charts/draw-and-pdf.js';
import { HTML_TYPES, htmlChart } from '../charts/extra-types.js';
import { S } from '../core/state.js';
import { el, toast, uid8 } from '../core/utils.ts';
import { fold, formModal } from '../features/extras.js';
import { vizData } from '../views/data-model.js';
import { colType, specFields } from '../views/new-chart.js';

/* ----- Perguntas prontas: um toque e o gráfico certo aparece ----- */
function askQuestions(meta,rows){
  const q=s=>{ const y=s.y?`“${s.y}”`:'', x=`“${s.x}”`, cnt=!s.y||s.agg==='count', f=s.filter&&fold(s.filter.val);
    if (f==='saida') return /categoria/i.test(s.x)?'Em que estou gastando mais?':`Para onde vai mais dinheiro (${x})?`;
    if (f==='entrada') return 'De onde entra mais dinheiro?';
    if (/^movimento$/i.test(s.x)) return s.type==='stacked'?null:cnt?'Quantas entradas e saídas eu tive?':'Entrou mais ou saiu mais dinheiro?';
    if (s.type==='stacked'&&/^movimento$/i.test(s.series||'')) return 'Em quais períodos o caixa apertou?';
    switch(s.type){
      case 'line': return colType(meta,s.x)==='date'?(cnt?'Quantos registros houve em cada período?':`Como ${y} evoluiu ao longo do tempo?`):null;
      case 'stacked': return colType(meta,s.x)==='date'?`Quem puxou ${cnt?'os registros':y} em cada período (por ${'“'+s.series+'”'})?`:`Como cada ${x} se divide por “${s.series}”?`;
      case 'hbar': return s.title&&/vendedor|vendedores/i.test(s.title)&&!cnt?'Quem vendeu mais?':/cliente/i.test(s.x)&&!cnt?'Quem são meus maiores clientes?':/produto/i.test(s.x)&&!cnt?'Quais produtos vendem mais?':cnt?`Quais itens de ${x} aparecem mais?`:`Quais itens de ${x} têm mais ${y}?`;
      case 'pie': return cnt?`Como os registros se dividem por ${x}?`:`Qual a fatia de cada ${x} em ${y}?`;
      case 'map': return 'Em quais estados está o maior volume?';
      case 'funnel': return 'Quanto se perde em cada etapa?';
      case 'bar': return s.agg==='avg'?(/vendedor|cliente/i.test(s.x)?`Qual o valor médio por venda de cada ${x}?`:`Qual a média de ${y} por ${x}?`):(s.x&&isTimeCol(rows,meta.columns.findIndex(c=>c.name===s.x))?'Em que horário há mais movimento?':`Quanto foi ${cnt?'registrado':y} por ${x}?`);
    } return null; };
  const seen=new Set(), out=[];
  for (const s of autoCharts(meta.columns.filter(c=>!c.virtual),rows,16)){ const t=q(s); if(!t||seen.has(t)) continue; seen.add(t); out.push({q:t,spec:s}); if(out.length>=6) break; }
  return out;
}
function askSection(meta){
  if (!S.rows||!S.rows.length) return null;
  const qs=askQuestions(meta,S.rows); if(!qs.length) return null;
  return el('section',{class:'ask','data-tour':'ask'},el('div',{class:'ask-h',text:'Pergunte aos seus dados'}),
    el('div',{class:'ask-chips'},qs.map(o=>el('button',{class:'ask-chip',type:'button',onclick:()=>askDialog(meta,o)},o.q))));
}
function askDialog(meta,o){
  const vd=vizData(meta), spec={...o.spec,id:o.spec.id||uid8()}, res=aggregate(vd.vmeta,spec,vd.rows), {yLabel}=chartLabels(spec,res);
  const has=(meta.charts||[]).some(c=>chartKey(c)===chartKey(spec));
  const body=el('div');
  if (!res||!res.labels.length) body.append(el('div',{class:'muted',style:'padding:30px 0;text-align:center',text:'Não há dados para responder com os filtros atuais.'}));
  else if (HTML_TYPES.has(spec.type)) body.append(htmlChart(spec,res,vd.vmeta));
  else { const box=el('div',{class:'chart-box'}), cv=el('canvas',{role:'img','aria-label':o.q}); box.append(cv); body.append(box); requestAnimationFrame(()=>makeChart(cv,spec,res,yLabel)); }
  body.append(el('div',{class:'ask-ans'},describeChart(vd.vmeta,spec,res)));
  if (has) body.append(el('div',{class:'muted',style:'font-size:12.5px;margin-top:10px',text:'Este gráfico já está no seu painel.'}));
  formModal(o.q,null,body,has||S.readOnly?null:'Fixar no painel',()=>{ const m=structuredClone(currentMeta()); (m.charts=m.charts||[]).unshift({...specFields(spec),id:uid8()}); persistCharts(m); toast('Gráfico fixado no topo do painel.'); },'wide');
}

export { askDialog, askQuestions, askSection };
