import { PARTY_RX, distinctCount, isTimeCol } from '../charts/auto-charts.js';
import { pct1 } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { el, fmtNum, nf } from '../core/utils.ts';
import { CODE_RX } from '../core/values.ts';
import { detectAnomalies, mainMeasure } from '../features/anomalies.js';
import { deltaOf } from '../features/compare.js';
import { dayOf, fold } from '../features/extras.js';
import { keyLabel } from '../features/forecast.js';
import { goalStatus } from '../features/goals.js';
import { isoDay } from '../views/reports-tab.js';

/* ----- Resumo em poucas palavras (topo da aba Gráficos) ----- */
function summaryCat(meta,rows,skip){
  const c=meta.columns.map((c,j)=>({c,j})).filter(({c,j})=>c.type==='text'&&!c.virtual&&j!==skip&&!CODE_RX.test(c.name)&&!/(pedido|n[uú]mero|protocolo|^id\b|^movimento$)/i.test(c.name)&&!isTimeCol(rows,j))
    .map(o=>({...o,n:distinctCount(rows,o.j,80)})).filter(o=>o.n>=2&&o.n<=60);
  return c.find(o=>PARTY_RX.test(o.c.name)&&!/descri|hist[oó]rico/i.test(o.c.name))||c.find(o=>/categoria|produto|vendedor|cliente|setor|canal/i.test(o.c.name))||c[0]||null;
}
function easySummary(meta,rows,prev){
  if (!rows||!rows.length) return null;
  const out=[], yc=mainMeasure(meta), yj=yc?meta.columns.indexOf(yc):-1, dj=meta.columns.findIndex(c=>c.type==='date');
  const num=r=>typeof r[yj]==='number'?r[yj]:0, sum=rs=>yj<0?rs.length:rs.reduce((s,r)=>s+num(r),0);
  const what=yc?`o total de “${yc.name}”`:'o número de registros', fv=v=>yj<0?`${nf.format(v)} ${v===1?'registro':'registros'}`:fmtNum(v);
  const ic=d=>!d||d.dir===0?'eq':(d.good===false?'down':d.good===true?'up':d.dir>0?'up':'down');
  const movj=meta.columns.findIndex(c=>/^movimento$/i.test(c.name));
  if (movj>=0&&yj>=0){
    let e=0,s=0; for(const r of rows){ const v=Math.abs(num(r)), m=fold(r[movj]); if(m==='entrada') e+=v; else if(m==='saida') s+=v; }
    out.push({ic:e>=s?'up':'down',tx:`Entraram ${fmtNum(e)} e saíram ${fmtNum(s)}. O resultado foi ${e>=s?'positivo':'negativo'} em ${fmtNum(Math.abs(e-s))}.`});
    const cj=meta.columns.findIndex(c=>/^categoria$/i.test(c.name)), pj=cj>=0?cj:meta.columns.findIndex(c=>/descri|hist[oó]rico|estabelecimento|favorecido/i.test(c.name));
    if (pj>=0&&s>0){ const g=new Map(); for(const r of rows) if(fold(r[movj])==='saida'){ const k=String(r[pj]??'(vazio)'); g.set(k,(g.get(k)||0)+Math.abs(num(r))); }
      const top=[...g.entries()].sort((a,b)=>b[1]-a[1])[0]; if(top) out.push({ic:'eq',tx:`Onde mais saiu dinheiro: “${top[0]}”, com ${fmtNum(top[1])} (${pct1(top[1]/s*100)} das saídas).`}); }
  } else if (prev&&prev.rows){
    const a=sum(rows), b=sum(prev.rows), d=deltaOf(a,b,yc?yc.name:'registros');
    out.push({ic:ic(d),tx:`No período escolhido, ${what} foi ${fv(a)}${d&&d.dir!==0?`: ${pct1(Math.abs(d.pct))} ${d.pct>0?'a mais':'a menos'} que no período anterior (${fv(b)})`:d?', igual ao período anterior':''}.`});
  } else if (dj>=0){
    const byM=new Map(); for(const r of rows){ const d=dayOf(r[dj]); if(!d) continue; const m=d.slice(0,7); byM.set(m,(byM.get(m)||0)+(yj<0?1:num(r))); }
    const ms=[...byM.keys()].sort(), lm=ms[ms.length-1], pm=ms[ms.length-2];
    if (lm){ const cur=lm===isoDay(new Date()).slice(0,7); let t=`Em ${keyLabel(lm,'m')}${cur?' (até hoje)':''}, ${what} foi ${fv(byM.get(lm))}`, d=null;
      if (pm&&!cur){ d=deltaOf(byM.get(lm),byM.get(pm),yc?yc.name:''); if(d&&d.dir!==0) t+=`: ${pct1(Math.abs(d.pct))} ${d.pct>0?'a mais':'a menos'} que em ${keyLabel(pm,'m')}`; }
      else if (pm) t+=`. O mês anterior, ${keyLabel(pm,'m')}, fechou em ${fv(byM.get(pm))}`;
      out.push({ic:ic(d),tx:t+'.'}); }
  } else out.push({ic:'eq',tx:`No total, ${what} é ${fv(sum(rows))}.`});
  if (movj<0){ const c=summaryCat(meta,rows,-1);
    if (c){ const g=new Map(); let tot=0; for(const r of rows){ const v=yj<0?1:num(r); const k=String(r[c.j]??'(vazio)'); g.set(k,(g.get(k)||0)+v); tot+=v; }
      const es=[...g.entries()].filter(e=>e[0]!=='(vazio)').sort((a,b)=>b[1]-a[1]);
      if (es.length>=2&&tot>0&&es.every(e=>e[1]>=0)) out.push({ic:'eq',tx:`Quem mais pesou em “${c.c.name}”: “${es[0][0]}”, com ${fv(es[0][1])} (${pct1(es[0][1]/tot*100)} do total)${es.length>=3?`. Depois vêm “${es[1][0]}” e “${es[2][0]}”`:''}.`}); } }
  const gs=(meta.goals||[]).map(g=>({g,s:goalStatus(meta,g)})).filter(x=>x.s);
  if (gs.length){ const bad=gs.filter(x=>x.s.st==='warn'||x.s.st==='bad');
    out.push(bad.length?{ic:'warn',tx:`Atenção: ${bad.length===1?`a meta “${bad[0].g.name}” está`:`${bad.length} metas estão`} fora do ritmo${bad.length>1?` (${bad.slice(0,3).map(x=>`“${x.g.name}”`).join(', ')})`:''}.`}
      :{ic:'up',tx:gs.length===1?`A meta “${gs[0].g.name}” está dentro do esperado.`:`Todas as ${gs.length} metas estão dentro do esperado.`}); }
  const an=detectAnomalies(meta,S.rows||rows)[0]; if(an) out.push({ic:'warn',tx:`Fora do padrão: ${an.title.charAt(0).toLowerCase()+an.title.slice(1)}.`});
  if (!out.length) return null;
  return el('section',{class:'easy-sum','aria-label':'Resumo'},el('h3',{},'Resumo em poucas palavras'),
    el('ul',{},out.slice(0,4).map(o=>el('li',{},el('span',{class:'ei '+o.ic,'aria-hidden':'true',text:{up:'▲',down:'▼',warn:'!',eq:'•'}[o.ic]}),el('span',{text:o.tx})))));
}

export { easySummary, summaryCat };
