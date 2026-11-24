import { colorsFor, pct1, withAlpha } from './draw-and-pdf.js';
import { css, el, fmtNum, nf, nfc } from '../core/utils.ts';
import { hexRgb, mixRgb } from '../features/brand.js';
import { fold } from '../features/extras.js';
import { pivotTable } from '../features/tv-mode.js';

/* ----- Tipos de gráfico extras: empilhadas, funil, mapa do Brasil (UF) e tabela dinâmica -----
   Mapa e tabela dinâmica são desenhados em HTML (na tela) e em canvas (PDF); empilhadas e funil usam Chart.js.
   No PowerPoint viram gráficos nativos equivalentes (barras empilhadas, barras, tabela). */
const HTML_TYPES=new Set(['map','pivot']);
const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const UF_NAMES={acre:'AC',alagoas:'AL',amapa:'AP',amazonas:'AM',bahia:'BA',ceara:'CE','distrito federal':'DF','espirito santo':'ES',goias:'GO',maranhao:'MA','mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG',para:'PA',paraiba:'PB',parana:'PR',pernambuco:'PE',piaui:'PI','rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS',rondonia:'RO',roraima:'RR','santa catarina':'SC','sao paulo':'SP',sergipe:'SE',tocantins:'TO'};
const ufOf=v=>{ if(v==null) return null; const s=String(v).trim(); if(/^[A-Za-z]{2}$/.test(s)&&UFS.includes(s.toUpperCase())) return s.toUpperCase(); return UF_NAMES[fold(s).replace(/\s+/g,' ')]||null; };
// posição de cada estado num mapa em blocos (coluna, linha), aproximando a geografia
const UF_TILE={RR:[2,0],AP:[4,0],AM:[1,1],PA:[3,1],MA:[4,1],CE:[5,1],RN:[6,1],AC:[0,2],RO:[1,2],MT:[2,2],TO:[3,2],PI:[4,2],PE:[5,2],PB:[6,2],MS:[2,3],GO:[3,3],DF:[4,3],BA:[5,3],AL:[6,3],PR:[2,4],SP:[3,4],MG:[4,4],ES:[5,4],SE:[6,4],SC:[2,5],RJ:[4,5],RS:[2,6]};
function isUfCol(rows,j){ let n=0,m=0; for(const r of rows){ const v=r[j]; if(v==null||v==='') continue; n++; if(ufOf(v)) m++; if(n>=300) break; } return n>0&&m/n>=0.6; }
function mapData(res){
  const by={}, orig={};
  res.labels.forEach((l,i)=>{ const u=ufOf(l); if(!u) return; by[u]=(by[u]||0)+res.values[i]; if(!orig[u]) orig[u]=String(l); });
  const vals=Object.values(by), mx=Math.max(...vals.map(Math.abs),0)||1;
  return {by,orig,mx,mn:vals.length?Math.min(...vals):0};
}
function htmlChart(spec,res,meta,opts={}){
  if (spec.type==='pivot'){ const w=el('div',{class:'chart-pivot'}); w.append(pivotTable(res.pivot)); return w; }
  const {by,orig,mx}=mapData(res), acc=css('--accent')||'#2962ff';
  const g=el('div',{class:'uf-map'});
  for (const [u,[c,r]] of Object.entries(UF_TILE)){
    const v=by[u], has=v!=null, t=has?Math.max(0.12,Math.abs(v)/mx):0;
    const tile=el('div',{class:'uf'+(has?' on':''),style:`grid-column:${c+1};grid-row:${r+1};${has?`background:color-mix(in srgb,${acc} ${Math.round(t*100)}%,var(--surface-2))`:''}`,title:has?`${u}: ${nf.format(v)}`:`${u}: sem dados`},
      el('b',{text:u}),has?el('span',{text:nfc.format(v)}):null);
    if (has&&opts.onPick){ tile.classList.add('pick'); tile.onclick=()=>opts.onPick(orig[u]); }
    g.append(tile);
  }
  const lg=el('div',{class:'uf-legend'},el('span',{text:'menor'}),el('i',{style:`background:linear-gradient(90deg,color-mix(in srgb,${acc} 12%,var(--surface-2)),${acc})`}),el('span',{text:'maior'}));
  const missing=res.labels.filter(l=>!ufOf(l)).length;
  return el('div',{class:'uf-wrap'},g,lg,missing?el('div',{class:'muted',style:'font-size:11.5px;text-align:center',text:`${missing} ${missing===1?'valor não reconhecido':'valores não reconhecidos'} como estado`}):null);
}
// desenho em canvas para PDF (mapa e tabela dinâmica)
function htmlChartImage(spec,res,th){
  const W=th.w||900,H=th.h||400, cv=el('canvas',{width:W*2,height:H*2}), c=cv.getContext('2d'); c.scale(2,2);
  c.fillStyle=th.bg||'#fff'; c.fillRect(0,0,W,H);
  const t2=th.t2||'#52514e', txt=th.mode==='dark'?'#ffffff':'#111111', fs=th.font||13, acc=th.accent||'#2962ff';
  if (spec.type==='map'){
    const {by,mx}=mapData(res), s=Math.min((W-40)/7,(H-30)/7), ox=(W-s*7)/2, oy=8, [ar,ag,ab]=hexRgb(acc), base=th.mode==='dark'?[38,38,38]:[236,238,242];
    for (const [u,[col,row]] of Object.entries(UF_TILE)){
      const v=by[u], t=v!=null?Math.max(0.12,Math.abs(v)/mx):0, rgb=v!=null?mixRgb(base,[ar,ag,ab],t):base;
      c.fillStyle=`rgb(${rgb.join(',')})`; c.beginPath(); c.roundRect(ox+col*s+2,oy+row*s+2,s-4,s-4,6); c.fill();
      c.fillStyle=t>0.55?'#ffffff':(v!=null?txt:t2); c.textAlign='center'; c.font=`700 ${fs}px Segoe UI, -apple-system, Roboto, Arial, sans-serif`; c.fillText(u,ox+col*s+s/2,oy+row*s+s/2-(v!=null?2:-4));
      if (v!=null){ c.font=`500 ${fs-3}px Segoe UI, -apple-system, Roboto, Arial, sans-serif`; c.fillText(nfc.format(v),ox+col*s+s/2,oy+row*s+s/2+fs-2); }
    }
  } else {
    const p=res.pivot; if(!p) return cv.toDataURL('image/jpeg',0.93);
    const cols=[p.rowName,...p.cols,p.cols.length?'Total':(p.agg==='count'?'Registros':p.measure)], rowsT=[...p.rows.map(r=>[r.key,...r.cells,r.total]),['Total',...p.total.cells,p.total.total]];
    const rh=Math.min(34,(H-10)/(rowsT.length+1)), cw0=Math.min(W*0.38,260), cw=(W-cw0-10)/(cols.length-1); c.font=`${fs}px Segoe UI, -apple-system, Roboto, Arial, sans-serif`;
    const cell=(s,x,y,w,right,bold,color)=>{ c.fillStyle=color; c.font=`${bold?700:400} ${fs}px Segoe UI, -apple-system, Roboto, Arial, sans-serif`; c.textAlign=right?'right':'left'; let t=String(s); while(c.measureText(t).width>w-12&&t.length>3) t=t.slice(0,-2)+'…'; c.fillText(t,right?x+w-6:x+6,y+rh*0.65); };
    cols.forEach((h,i)=>cell(h,i?cw0+(i-1)*cw:0,0,i?cw:cw0,i>0,true,t2));
    rowsT.forEach((r,ri)=>{ const y=(ri+1)*rh, last=ri===rowsT.length-1; c.fillStyle=th.grid||'#e8e7e2'; c.fillRect(0,y,W,1);
      r.forEach((v,i)=>cell(i?(v==null?'—':fmtNum(v)):v,i?cw0+(i-1)*cw:0,y,i?cw:cw0,i>0,last||i===r.length-1,txt)); });
  }
  return cv.toDataURL('image/jpeg',0.93);
}

// configuração Chart.js de "empilhadas" e "funil" (tela e PDF); null para os outros tipos
function extraChartConfig(spec,res,yLabel,o){
  const t2=o.t2, grid=o.grid, font=o.font||{size:11}, fpx=o.fontPx||12;
  const cut=n=>function(v){ const l=String(this.getLabelForValue(v)); return l.length>n?l.slice(0,n-1)+'…':l; };
  if (spec.type==='stacked'&&res.stack){
    const st=res.stack, cols=colorsFor(st.series.map(s=>s.name),o.mode);
    return {type:'bar',labelsOf:st.labels,data:{labels:st.labels,datasets:st.series.map((s,i)=>({label:s.name,data:s.values,backgroundColor:o.live?withAlpha(cols[i],.85):cols[i],hoverBackgroundColor:cols[i],borderWidth:0,borderRadius:2,maxBarThickness:46}))},
      options:{responsive:true,maintainAspectRatio:false,animation:{duration:700},
        plugins:{legend:{display:st.series.length>1,position:'top',align:'end',labels:{color:t2,boxWidth:10,boxHeight:10,font}},tooltip:o.tip?{...o.tip,mode:'index',intersect:false,callbacks:{label:ctx=>` ${ctx.dataset.label}: ${nf.format(ctx.parsed.y)}`,footer:items=>items.length>1?`Total: ${nf.format(items.reduce((s,it)=>s+(it.parsed.y||0),0))}`:''}}:{enabled:false}},
        scales:{x:{stacked:true,grid:{display:false},border:{color:grid},ticks:{color:t2,font,maxRotation:0,autoSkip:true,callback:cut(16)}},y:{stacked:true,beginAtZero:true,grid:{color:grid,drawTicks:false},border:{display:false},ticks:{color:t2,font,callback:v=>nfc.format(v)}}}}};
  }
  if (spec.type==='funnel'){
    const v=res.values.map(x=>Math.abs(x)), mx=Math.max(...v,0)||1, cols=colorsFor(res.labels,o.mode);
    return {type:'bar',labelsOf:res.labels,data:{labels:res.labels,datasets:[{label:yLabel,data:v.map(x=>[-x/2,x/2]),backgroundColor:o.live?cols.map(c=>withAlpha(c,.85)):cols,hoverBackgroundColor:cols,borderRadius:4,borderSkipped:false,barPercentage:.94,categoryPercentage:.96}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:700},
        plugins:{legend:{display:false},tooltip:o.tip?{...o.tip,callbacks:{label:ctx=>` ${yLabel}: ${nf.format(v[ctx.dataIndex])}${v[0]?` (${pct1(v[ctx.dataIndex]/v[0]*100)} da 1ª etapa)`:''}`}}:{enabled:false}},
        scales:{x:{display:false,min:-mx/2*1.04,max:mx/2*1.04},y:{grid:{display:false},border:{display:false},ticks:{color:t2,font,callback:cut(20)}}}},
      plugins:[{id:'funnelLabels',afterDatasetsDraw(c2){ const x=c2.ctx; x.save(); x.font=`600 ${fpx}px Segoe UI, -apple-system, Roboto, Arial, sans-serif`; x.fillStyle='#fff'; x.textAlign='center'; x.textBaseline='middle';
        c2.getDatasetMeta(0).data.forEach((b,i)=>{ if(b.height<12) return; x.fillText(`${nfc.format(v[i])}${i&&v[0]?` · ${pct1(v[i]/v[0]*100)}`:''}`,(c2.chartArea.left+c2.chartArea.right)/2,b.y); }); x.restore(); }}]};
  }
  return null;
}

export { HTML_TYPES, UFS, UF_NAMES, UF_TILE, extraChartConfig, htmlChart, htmlChartImage, isUfCol, mapData, ufOf };
