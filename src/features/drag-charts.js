import { persistCharts } from '../charts/draw-and-pdf.js';

/* ----- Painel personalizável: arrastar para reordenar e alargar gráficos ----- */
// dragChartId fica em charts/draw-and-pdf.js, onde os cartões são desenhados
function moveChart(meta,fromId,toId){
  if (!fromId||fromId===toId) return;
  const m=structuredClone(meta); m.columns=m.columns.filter(c=>!c.virtual);
  const a=m.charts.findIndex(c=>c.id===fromId), b=m.charts.findIndex(c=>c.id===toId); if(a<0||b<0) return;
  const [x]=m.charts.splice(a,1); m.charts.splice(b,0,x); persistCharts(m);
}

export { moveChart };
