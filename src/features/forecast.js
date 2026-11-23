import { MESES, fmtDate, fmtNum } from '../core/utils.ts';
import { pad } from '../core/values.ts';
import { pDate } from './extras.js';
import { isoDay } from '../views/reports-tab.js';

/* ----- Tendência (previsão simples por linha reta) ----- */
const keyLabel=(k,gran)=>gran==='y'?k:gran==='m'?`${MESES[+k.split('-')[1]-1]}/${k.slice(2,4)}`:fmtDate(k);
function forecastOf(res){
  if (!res||!res.keys||!['d','m','y'].includes(res.gran)) return null;
  const ks=res.keys, vs=res.values, now=new Date();
  const curKey=res.gran==='m'?isoDay(now).slice(0,7):res.gran==='y'?String(now.getFullYear()):isoDay(now);
  const partial=ks[ks.length-1]===curKey; // período atual ainda em andamento: fica fora do cálculo
  const fitN=vs.length-(partial?1:0); if(fitN<4) return null;
  const take=Math.min(fitN,res.gran==='d'?60:24), x0=fitN-take;
  let sx=0,sy=0,sxx=0,sxy=0; for(let i=x0;i<fitN;i++){ sx+=i; sy+=vs[i]; sxx+=i*i; sxy+=i*vs[i]; }
  const den=take*sxx-sx*sx; if(!den) return null;
  const b=(take*sxy-sx*sy)/den, a=(sy-b*sx)/take;
  const next=k=>{ if(res.gran==='y') return String(+k+1); if(res.gran==='m'){ const [y,m]=k.split('-').map(Number); const d=new Date(y,m,1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; } const d=pDate(k); d.setDate(d.getDate()+1); return isoDay(d); };
  const keys=[...ks], ahead=res.gran==='d'?7:res.gran==='m'?3:2; while(keys.length<ks.length+ahead) keys.push(next(keys[keys.length-1]));
  const nonNeg=vs.every(v=>v>=0);
  const trend=keys.map((_,i)=>i<x0?null:(nonNeg?Math.max(0,a+b*i):a+b*i));
  return {keys,labels:keys.map(k=>keyLabel(k,res.gran)),trend,slope:b,partial,n:ks.length};
}
function forecastText(fc,res){
  const per={d:'dia',m:'mês',y:'ano'}[res.gran], rel=Math.abs(fc.slope)/(Math.max(...res.values.map(Math.abs))||1);
  const dir=rel<0.005?'estável':`${fc.slope>0?'alta':'queda'} de cerca de ${fmtNum(Math.abs(fc.slope))} por ${per}`;
  return `Tendência: ${dir}. Se o ritmo continuar, ${fc.labels[fc.labels.length-1]} deve ficar perto de ${fmtNum(fc.trend[fc.trend.length-1])}.${fc.partial?` O último ${per} ainda está em andamento e não entrou no cálculo.`:''} É uma estimativa simples, não uma garantia.`;
}

export { forecastOf, forecastText, keyLabel };
