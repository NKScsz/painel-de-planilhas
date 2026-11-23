import { pct1 } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { inRange, monthEnd, pDate } from './extras.js';
import { isoDay, periodRange } from '../views/reports-tab.js';

/* ----- Comparação com o período anterior ----- */
// meses inteiros -> os mesmos meses antes; mês ou ano até hoje -> mesmo trecho do mês/ano anterior;
// outros intervalos -> o mesmo número de dias imediatamente antes
function compareRange(from,to,now=new Date()){
  if (!from||!to||from>to) return null;
  const today=isoDay(now), a=pDate(from), b=pDate(to>today&&from<=today?today:to), oe=pDate(to);
  if (a.getDate()===1&&b.getDate()===monthEnd(b)){ const ms=(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth()+1;
    return {from:isoDay(new Date(a.getFullYear(),a.getMonth()-ms,1)),to:isoDay(new Date(a.getFullYear(),a.getMonth(),0))}; }
  if (a.getMonth()===0&&a.getDate()===1&&oe.getFullYear()===a.getFullYear()&&oe.getMonth()===11){ const y=a.getFullYear()-1;
    return {from:`${y}-01-01`,to:isoDay(new Date(y,b.getMonth(),Math.min(b.getDate(),new Date(y,b.getMonth()+1,0).getDate())))}; }
  if (a.getDate()===1&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()){ const pm=new Date(a.getFullYear(),a.getMonth()-1,1);
    return {from:isoDay(pm),to:isoDay(new Date(pm.getFullYear(),pm.getMonth(),Math.min(b.getDate(),monthEnd(pm))))}; }
  const days=Math.round((b-a)/864e5)+1, pb=new Date(a); pb.setDate(pb.getDate()-1); const pa=new Date(pb); pa.setDate(pa.getDate()-days+1);
  return {from:isoDay(pa),to:isoDay(pb)};
}
const byCat=(meta,rows,f)=>{ if(!f||!f.col||f.val==='') return rows; const j=meta.columns.findIndex(c=>c.name===f.col); return j<0?rows:rows.filter(r=>String(r[j]??'(vazio)')===f.val); };
function vizPrev(meta){
  const f=S.vfilter, dj=meta.columns.findIndex(c=>c.type==='date'), rg=dj>=0?compareRange(f.from,f.to):null;
  return rg?{rows:inRange(byCat(meta,S.rows,f),dj,rg),range:rg}:null;
}
function reportPrev(meta,rep){
  const p=periodRange(rep.period), dj=meta.columns.findIndex(c=>c.type==='date'), rg=p&&dj>=0?compareRange(p.from,p.to):null;
  return rg?{rows:inRange(byCat(meta,S.rows,rep.filter),dj,rg),range:rg}:null;
}
const BAD_UP=/despesa|custo|gasto|sa[ií]da|d[eé]bito|perda|devolu|cancel|reclama|atraso|inadimpl|imposto|tarifa/i;
function deltaOf(cur,prev,name){
  if (cur==null||prev==null) return null;
  if (prev===0) return cur===0?{pct:0,dir:0,txt:'igual',good:null}:null;
  const pct=(cur-prev)/Math.abs(prev)*100, dir=Math.abs(pct)<0.05?0:pct>0?1:-1;
  return {pct,dir,txt:dir===0?'estável':`${pct>0?'+':'-'}${pct1(Math.abs(pct))}`,good:dir===0?null:(dir>0)!==BAD_UP.test(name)};
}
const QUICK_PER=[['all','Tudo'],['7d','7 dias'],['30d','30 dias'],['month','Este mês'],['prevmonth','Mês passado'],['year','Este ano']];

export { BAD_UP, QUICK_PER, byCat, compareRange, deltaOf, reportPrev, vizPrev };
