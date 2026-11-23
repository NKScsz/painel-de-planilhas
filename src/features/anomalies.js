import { AVG_RX, MEAS_RX, distinctCount } from '../charts/auto-charts.js';
import { pct1 } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { el, fmtDate, fmtNum, nf } from '../core/utils.ts';
import { CODE_RX } from '../core/values.ts';
import { byCat } from './compare.js';
import { dayOf, monthEnd, pDate } from './extras.js';
import { keyLabel } from './forecast.js';
import { isoDay } from '../views/reports-tab.js';

/* ----- Alertas automáticos (anomalias) -----
   Sem precisar criar metas: compara o último dia e o último mês com o histórico da própria base, aponta a
   categoria que mais mudou e registros com valor muito fora do padrão. Só fala quando a diferença é grande. */
function mainMeasure(meta){
  const nums=meta.columns.filter(c=>c.type==='number'&&!c.virtual&&!CODE_RX.test(c.name)&&!AVG_RX.test(c.name)&&!/saldo|(pedido|n[uú]mero|c[oó]d|nota|matr[ií]cula|^ano$)/i.test(c.name));
  return nums.find(c=>/valor|total|receita|fatur|venda|custo|despesa|lucro|montante|quantia|amount|pago|recebido/i.test(c.name))||nums.find(c=>MEAS_RX.test(c.name))||nums[0]||null;
}
function detectAnomalies(meta,rows){
  const out=[], dj=meta.columns.findIndex(c=>c.type==='date'); if(dj<0||rows.length<20) return out;
  const yc=mainMeasure(meta), yj=yc?meta.columns.indexOf(yc):-1, what=yc?yc.name:'registros';
  const val=r=>yj<0?1:(typeof r[yj]==='number'?r[yj]:0);
  const fmtV=v=>yj<0?`${nf.format(v)} registros`:fmtNum(v);
  const today=isoDay(new Date()), byDay=new Map(), byMonth=new Map();
  for (const r of rows){ const d=dayOf(r[dj]); if(!d||d>today) continue; byDay.set(d,(byDay.get(d)||0)+val(r)); const m=d.slice(0,7); byMonth.set(m,(byMonth.get(m)||0)+val(r)); }
  const days=[...byDay.keys()].sort(); if(days.length<10) return out;
  // 1) último dia com dados x os 28 dias anteriores
  const last=days[days.length-1], ld=pDate(last), prev=[];
  for (let i=1;i<=28;i++){ const d=new Date(ld); d.setDate(d.getDate()-i); prev.push(byDay.get(isoDay(d))||0); }
  if (prev.filter(v=>v!==0).length>=20){
    const mean=prev.reduce((a,b)=>a+b,0)/prev.length, sd=Math.sqrt(prev.reduce((a,b)=>a+(b-mean)**2,0)/prev.length), v=byDay.get(last), z=sd?(v-mean)/sd:0, pc=mean?(v-mean)/Math.abs(mean)*100:0;
    if (Math.abs(z)>=2&&Math.abs(pc)>=30) out.push({dir:pc>0?'up':'down',title:`${what} em ${fmtDate(last)}: ${pc>0?'acima':'abaixo'} do normal`,
      text:`Foram ${fmtV(v)}, ${pct1(Math.abs(pc))} ${pc>0?'acima':'abaixo'} da média dos 28 dias anteriores (${fmtV(mean)} por dia).`});
  }
  // 2) último mês completo x média dos 6 anteriores; e o mês atual no ritmo de hoje
  const months=[...byMonth.keys()].sort(), cur=today.slice(0,7), done=months.filter(m=>m<cur);
  if (done.length>=4){ const lm=done[done.length-1], base=done.slice(-7,-1), avg=base.reduce((a,m)=>a+byMonth.get(m),0)/base.length, v=byMonth.get(lm), pc=avg?(v-avg)/Math.abs(avg)*100:0;
    if (Math.abs(pc)>=25) out.push({dir:pc>0?'up':'down',title:`${what} em ${keyLabel(lm,'m')}: ${pc>0?'mês forte':'mês fraco'}`,text:`Fechou em ${fmtV(v)}, ${pct1(Math.abs(pc))} ${pc>0?'acima':'abaixo'} da média dos ${base.length} meses anteriores (${fmtV(avg)}).`}); }
  if (byMonth.has(cur)&&done.length>=3){ const now=new Date(), frac=now.getDate()/monthEnd(now);
    if (frac>=0.25&&frac<1){ const base=done.slice(-6), avg=base.reduce((a,m)=>a+byMonth.get(m),0)/base.length, proj=byMonth.get(cur)/frac, pc=avg?(proj-avg)/Math.abs(avg)*100:0;
      if (Math.abs(pc)>=25) out.push({dir:pc>0?'up':'down',title:`Ritmo de ${keyLabel(cur,'m')}: ${pc>0?'acima':'abaixo'} do normal`,text:`No ritmo atual, o mês deve fechar perto de ${fmtV(proj)}, ${pct1(Math.abs(pc))} ${pc>0?'acima':'abaixo'} da média mensal (${fmtV(avg)}).`}); } }
  // 3) categoria que mais mudou do penúltimo para o último mês completo
  if (done.length>=2){ const [m0,m1]=done.slice(-2);
    let best=null;
    meta.columns.forEach((c,j)=>{ if(c.type!=='text'||c.virtual||CODE_RX.test(c.name)) return; const n=distinctCount(rows,j,40); if(n<2||n>30) return;
      const a=new Map(), b=new Map(); let tot=0;
      for (const r of rows){ const d=dayOf(r[dj]); if(!d) continue; const m=d.slice(0,7); if(m!==m0&&m!==m1) continue; const k=r[j]==null||r[j]===''?null:String(r[j]); if(k==null) continue; const t=m===m0?a:b; t.set(k,(t.get(k)||0)+val(r)); if(m===m1) tot+=Math.abs(val(r)); }
      for (const [k,v1] of b){ const v0=a.get(k)||0; if(!v0||Math.abs(v1)<tot*0.1) continue; const pc=(v1-v0)/Math.abs(v0)*100; if(Math.abs(pc)>=40&&(!best||Math.abs(pc)>Math.abs(best.pc))) best={col:c.name,k,v0,v1,pc}; } });
    if (best) out.push({dir:best.pc>0?'up':'down',title:`${best.col} “${best.k}”: ${best.pc>0?'subiu':'caiu'} ${pct1(Math.abs(best.pc))}`,text:`Em ${keyLabel(m1,'m')} foram ${fmtV(best.v1)}, contra ${fmtV(best.v0)} em ${keyLabel(m0,'m')}.`}); }
  // 4) registros com valor muito fora do padrão (acima de Q3 + 3×IQR)
  if (yj>=0){ const vs=rows.map(r=>r[yj]).filter(v=>typeof v==='number').sort((a,b)=>a-b);
    if (vs.length>=30){ const q=p=>vs[Math.floor((vs.length-1)*p)], q1=q(0.25), q3=q(0.75), lim=q3+3*(q3-q1);
      if (q3>q1){ const big=rows.filter(r=>typeof r[yj]==='number'&&r[yj]>lim).sort((a,b)=>b[yj]-a[yj]);
        if (big.length&&big.length<=Math.max(3,vs.length*0.02)) out.push({dir:'info',title:`${big.length} ${big.length===1?'registro':'registros'} com ${what} muito acima do normal`,
          text:`O maior é ${fmtNum(big[0][yj])}${dayOf(big[0][dj])?` em ${fmtDate(dayOf(big[0][dj]))}`:''}. O comum fica entre ${fmtNum(q1)} e ${fmtNum(q3)}. Vale conferir se não é erro de digitação.`}); } } }
  return out;
}
function anomaliesSection(meta){
  const key=meta.id+':'+meta.updatedAt; if((S.anomHidden||{})[meta.id]===key) return null;
  const list=detectAnomalies(meta,byCat(meta,S.rows,S.vfilter)); if(!list.length) return null;
  return el('section',{class:'anom'},el('div',{class:'goals-h'},el('h3',{text:'Alertas automáticos'}),el('span',{class:'g-sum alert',text:`${list.length} ${list.length===1?'ponto':'pontos'} fora do padrão`}),el('span',{class:'spacer'}),
      el('button',{class:'btn sm',onclick:e=>{ (S.anomHidden=S.anomHidden||{})[meta.id]=key; e.currentTarget.closest('.anom').remove(); }},'Ocultar')),
    el('div',{class:'anom-grid'},list.map(a=>el('div',{class:'anom-card '+a.dir},el('span',{class:'anom-ic','aria-hidden':'true',text:a.dir==='up'?'▲':a.dir==='down'?'▼':'!'}),el('div',{},el('b',{text:a.title}),el('p',{text:a.text}))))));
}

export { anomaliesSection, detectAnomalies, mainMeasure };
