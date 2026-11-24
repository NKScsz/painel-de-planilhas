import { currentMeta, downloads, profileName } from '../app/init.js';
import { imageButton } from '../features/chart-share.js';
import { pinButton } from '../views/board.js';
import { icon, render } from '../app/render.js';
import { isTimeCol } from './auto-charts.js';
import { HTML_TYPES, extraChartConfig, htmlChart, htmlChartImage, ufOf } from './extra-types.js';
import { S, charts } from '../core/state.js';
import { handleWriteError, saveMeta } from '../core/storage.js';
import { MESES, css, el, fmtDate, fmtNum, fmtWhen, nf, nfc, toast } from '../core/utils.ts';
import { pad } from '../core/values.ts';
import { markStep } from '../easy/checklist.js';
import { undoToast } from '../easy/simple-mode.js';
import { brand, hexRgb, logoFit, lum, mixRgb, rgbHex } from '../features/brand.js';
import { vizPrev } from '../features/compare.js';
import { moveChart } from '../features/drag-charts.js';
import { rangeTxt } from '../features/extras.js';
import { forecastOf, forecastText } from '../features/forecast.js';
import { goalStatus } from '../features/goals.js';
import { pivotData } from '../features/tv-mode.js';
import { sheetMonth } from '../import/spreadsheet.js';
import { vizRows } from '../views/charts-tab.js';
import { vizData } from '../views/data-model.js';
import { CHART_TYPES, colType, computeKpis, defaultSeries, typeOk } from '../views/new-chart.js';

/* ----- Relatório em PDF ----- */ let dragChartId=null; // cartão sendo arrastado (ver features/drag-charts.js)
const PDFC={accent:[42,120,214],accentWeak:[234,242,252],text:[17,17,17],t2:[82,81,78],t3:[125,124,119],line:[222,221,216],soft:[245,246,248]};
// fontes padrão do PDF só aceitam Latin-1: troca travessões, aspas curvas etc.
const pdfTxt=s=>String(s??'').replace(/›/g,'>').replace(/[—–]/g,'-').replace(/[“”„]/g,'"').replace(/[‘’]/g,"'").replace(/…/g,'...').replace(/•/g,'-').replace(/[  ]/g,' ').replace(/[^\x00-\xFF]/g,'');
const pct1=v=>nf.format(Math.round(v*10)/10)+'%';

// título, subtítulo e rótulo da medida de um gráfico
function chartLabels(spec,res){
  const yLabel=(!spec.y||spec.agg==='count')?'Quantidade de registros':`${AGG[spec.agg]} de ${spec.y}`;
  const gTxt=res&&res.gran&&!(res.gran==='h'&&/hora|hor[aá]rio/i.test(spec.x))?{y:' por ano',m:' por mês',d:' por dia',h:' por hora'}[res.gran]:'';
  return {yLabel,title:spec.title||yLabel,sub:`${spec.title?yLabel+' ':''}por ${spec.x}${gTxt}`};
}
// explicação do gráfico: o que ele mostra + leituras dos dados (short = versão curta para o card)
function describeChart(meta,spec,res,short=false){
  if (!res||!res.labels.length) return 'Não há dados para este gráfico com os filtros aplicados.';
  const isCount=!spec.y||spec.agg==='count';
  const additive=isCount||spec.agg==='sum';
  let measure=isCount?'a quantidade de registros':`${{sum:'a soma',avg:'a média',max:'o valor máximo',min:'o valor mínimo'}[spec.agg]} de "${spec.y}"`;
  if (spec.abs&&!isCount) measure+=' (sem o sinal de negativo)';
  const scope=spec.filter?`, considerando só "${spec.filter.col}" = ${spec.filter.val}`:'';
  const vals=res.values, labels=res.labels, n=vals.length;
  const total=vals.reduce((a,b)=>a+b,0);
  const idx=labels.map((_,i)=>i).filter(i=>res.ordered||!String(labels[i]).startsWith('Outros ('));
  let iMax=idx[0], iMin=idx[0]; for(const i of idx){ if(vals[i]>vals[iMax]) iMax=i; if(vals[i]<vals[iMin]) iMin=i; }
  const share=v=>additive&&total>0&&vals.every(x=>x>=0)?` (${pct1(v/total*100)} do total)`:'';
  const timeLike=res.ordered&&!!res.gran;
  const per={y:'ano',m:'mês',d:'dia',h:'hora'}[res.gran]||'período';
  const at=l=>res.gran==='h'?`às ${l}`:`em ${l}`;
  let what;
  if (spec.why) what=spec.why;
  else if (timeLike) what=`Mostra a evolução de ${measure} ${res.gran==='h'?'ao longo do dia, hora a hora':`ao longo do tempo, por ${per}`}${scope}.`;
  else if (spec.type==='pie') what=`Mostra como ${measure} se divide entre os valores de "${spec.x}"${scope}.`;
  else what=`Compara ${measure} entre os valores de "${spec.x}"${scope}.`;
  const p=[];
  if (/^movimento$/i.test(spec.x)&&!isCount&&spec.agg==='sum'){
    const e=labels.indexOf('Entrada'), s=labels.indexOf('Saída');
    const ve=e>=0?Math.abs(vals[e]):0, vs=s>=0?Math.abs(vals[s]):0, d=ve-vs;
    p.push(`Entraram ${fmtNum(ve)} e saíram ${fmtNum(vs)}.`);
    p.push(d===0?'Entradas e saídas se anularam no período.':`O resultado foi ${d>0?'positivo':'negativo'} em ${fmtNum(Math.abs(d))}${ve>0?` (as saídas consumiram ${pct1(vs/ve*100)} do que entrou)`:''}.`);
  } else if (timeLike){
    if (n>1) p.push(`O pico foi ${at(labels[iMax])}, com ${fmtNum(vals[iMax])}; o menor valor foi ${at(labels[iMin])}, com ${fmtNum(vals[iMin])}.`);
    if (res.gran!=='h'&&n>=2&&vals[0]!==0){ const ch=(vals[n-1]-vals[0])/Math.abs(vals[0])*100;
      p.push(Math.abs(ch)<0.05?`O valor ficou estável entre ${labels[0]} e ${labels[n-1]}.`:`Entre ${labels[0]} e ${labels[n-1]} houve ${ch>0?'alta':'queda'} de ${pct1(Math.abs(ch))}.`); }
    if (additive) p.push(`Total: ${fmtNum(total)}, média de ${fmtNum(total/n)} por ${per}.`);
  } else {
    p.push(`${spec.type==='pie'?'A maior fatia é':'O destaque é'} "${labels[iMax]}", com ${fmtNum(vals[iMax])}${share(vals[iMax])}.`);
    if (additive&&!res.ordered&&idx.length>=4&&total>0&&vals.every(x=>x>=0)){ const top3=[...idx].sort((a,b)=>vals[b]-vals[a]).slice(0,3).reduce((s,i)=>s+vals[i],0); p.push(`Os 3 primeiros concentram ${pct1(top3/total*100)} do total.`); }
    if (idx.length>1&&iMin!==iMax) p.push(`O menor é "${labels[iMin]}", com ${fmtNum(vals[iMin])}.`);
    if (additive) p.push(`Total: ${fmtNum(total)}.`);
  }
  const fc=spec.forecast&&spec.type==='line'?forecastOf(res):null;
  if (spec.type==='funnel'&&n>=2&&vals[0]){ what=spec.why||`Mostra ${measure} em cada etapa de "${spec.x}", da maior para a menor${scope}.`; p.length=0;
    p.push(`Da primeira etapa ("${labels[0]}") para a última ("${labels[n-1]}") ficam ${pct1(Math.abs(vals[n-1]/vals[0])*100)}.`);
    let worst=1; for(let i=2;i<n;i++) if(vals[i]/vals[i-1]<vals[worst]/vals[worst-1]) worst=i; p.push(`A maior perda é de "${labels[worst-1]}" para "${labels[worst]}": passam ${pct1(Math.abs(vals[worst]/vals[worst-1])*100)}.`); }
  if (spec.type==='map'){ const ufs=res.labels.filter(l=>ufOf(l)).length; if(!spec.why) what=`Mostra ${measure} em cada estado (${ufs} de 27 com dados)${scope}.`; }
  if (spec.type==='stacked'&&spec.series&&res.stack&&res.stack.series.length>1&&!spec.why) what=`Compara ${measure} entre os valores de "${spec.x}", com cada barra dividida por "${spec.series}"${scope}.`;
  if (spec.type==='pivot'&&!spec.why) what=`Tabela resumo: ${measure} por "${spec.x}"${spec.series?` e "${spec.series}"`:''}${scope}.`;
  return [what,...(short?p.slice(0,2):p),fc?forecastText(fc,res):null].filter(Boolean).join(' ');
}

// th (opcional): {w,h,mode:'light'|'dark',bg,grid,t2,border,val,font} para o PDF da apresentação
function chartImage(spec,res,yLabel,th={}){
  const W=th.w||900,H=th.h||400, mode=th.mode||'light', grid=th.grid||'#e8e7e2', t2=th.t2||'#52514e', bgc=th.bg||'#fff';
  const wrap=el('div',{style:`position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px`});
  const cv=el('canvas',{width:W,height:H}); wrap.append(cv); document.body.append(wrap);
  const horiz=spec.type==='hbar', line=spec.type==='line';
  const font={family:'Segoe UI, -apple-system, Roboto, Arial, sans-serif',size:th.font||13};
  const showVals=res.labels.length<=(line?12:16);
  const bg={id:'bg',beforeDraw(ch){ const c=ch.ctx; c.save(); c.fillStyle=bgc; c.fillRect(0,0,ch.width,ch.height); c.restore(); }};
  const vl={id:'vl',afterDatasetsDraw(ch){ if(!showVals) return; const c=ch.ctx; c.save(); c.font=`600 ${(th.font||13)-1}px Segoe UI, -apple-system, Roboto, Arial, sans-serif`; c.fillStyle=th.val||'#222';
    ch.getDatasetMeta(0).data.forEach((pt,i)=>{ if(i>=res.values.length) return; const t=fmtNum(res.values[i]); if(horiz){ c.textAlign='left'; c.textBaseline='middle'; c.fillText(t,pt.x+6,pt.y); } else { c.textAlign='center'; c.textBaseline='bottom'; c.fillText(t,pt.x,pt.y-(line?8:5)); } }); c.restore(); }};
  const valueAxis={beginAtZero:true,grace:'10%',grid:{color:grid,drawTicks:false},border:{display:false},ticks:{color:t2,padding:8,font,callback:v=>nfc.format(v)}};
  const catAxis={grid:{display:false},border:{color:th.border||'#cfcec8'},ticks:{color:t2,font,autoSkip:true,maxRotation:horiz?0:40,callback:function(v){ const l=String(this.getLabelForValue(v)); return l.length>26?l.slice(0,25)+'…':l; }}};
  let ch;
  if (HTML_TYPES.has(spec.type)){ wrap.remove(); return htmlChartImage(spec,res,{...th,w:W,h:H,mode,bg:bgc,t2,grid,accent:brand().color}); }
  const extra=extraChartConfig(spec,res,yLabel,{mode,t2,grid,font,fontPx:th.font||13});
  if (extra){ delete extra.labelsOf; Object.assign(extra.options,{responsive:false,animation:false,devicePixelRatio:2}); extra.plugins=[bg,...(extra.plugins||[])]; ch=new Chart(cv,extra); ch.update('none'); const url=cv.toDataURL('image/jpeg',0.93); ch.destroy(); wrap.remove(); return url; }
  if (spec.type==='pie'){
    const cfg=pieConfig(res,{dark:mode==='dark',surf:bgc,t2,fontSize:(th.font||13)+2}); delete cfg.pc;
    Object.assign(cfg.options,{responsive:false,animation:false,devicePixelRatio:2,layout:{padding:16}});
    cfg.options.plugins.tooltip={enabled:false}; cfg.plugins=[bg];
    ch=new Chart(cv,cfg);
  } else {
    const fc=line&&spec.forecast?forecastOf(res):null;
    const sets=[line
      ?{label:yLabel||'Valor',data:fc?[...res.values,...Array(fc.labels.length-res.values.length).fill(null)]:res.values,backgroundColor:withAlpha(ACCENT[mode],.14),borderColor:ACCENT[mode],borderWidth:2.5,pointRadius:res.labels.length>40?0:3.5,pointBackgroundColor:ACCENT[mode],tension:.3,fill:true}
      :{data:res.values,backgroundColor:barColors(res,mode),borderWidth:0,borderRadius:5,borderSkipped:'start',maxBarThickness:46}];
    if (fc) sets.push({label:'Tendência (estimativa)',data:fc.trend,borderColor:t2,backgroundColor:t2,borderDash:[7,6],borderWidth:2,pointRadius:0,fill:false,tension:0,spanGaps:true});
    ch=new Chart(cv,{
    type:line?'line':'bar',
    // mesmas cores do painel (versão para papel branco): cada categoria com sua cor; linha com a cor do gráfico
    data:{labels:fc?fc.labels:res.labels,datasets:sets},
    options:{indexAxis:horiz?'y':'x',responsive:false,animation:false,devicePixelRatio:2,layout:{padding:{top:12,right:horiz?40:12,left:4,bottom:4}},
      plugins:{legend:{display:!!fc,position:'top',align:'end',labels:{color:t2,font,usePointStyle:true,pointStyle:'line',boxWidth:26}},tooltip:{enabled:false}},scales:horiz?{x:valueAxis,y:catAxis}:{x:catAxis,y:valueAxis}},
    plugins:[bg,vl]
  }); }
  ch.update('none');
  const url=cv.toDataURL('image/jpeg',0.93);
  ch.destroy(); wrap.remove();
  return url;
}

async function exportChartsPdf(meta){ markStep('rep');
  if (!window.jspdf?.jsPDF||!window.Chart){ toast('Não foi possível carregar o gerador de PDF. Verifique sua conexão e recarregue a página.',true); return; }
  const specs=meta.charts||[];
  if (!specs.length||!S.rows){ toast('Esta base não tem gráficos para exportar.',true); return; }
  const t=toast('Gerando PDF…',false,60000);
  await new Promise(r=>setTimeout(r,30));
  let doc, filename;
  try{
    const f=S.vfilter, fl=[];
    if (f.col&&f.val!=='') fl.push(`${f.col} = ${f.val}`);
    if (f.from||f.to){ const dc=meta.columns.find(c=>c.type==='date'); fl.push(`${dc?dc.name:'Data'} ${f.from?'de '+fmtDate(f.from):''}${f.from&&f.to?' ':''}${f.to?'até '+fmtDate(f.to):''}`); }
    ({doc,filename}=buildReportPdf(meta,{specs,rows:vizRows(meta),prev:vizPrev(meta),goals:true,filterText:fl.length?`Filtros aplicados: ${fl.join('; ')}`:'Sem filtros: todos os registros da base foram considerados.'}));
  }catch(e){ console.error(e); t.remove(); toast('Não foi possível gerar o PDF.',true); return; }
  t.remove();
  await savePdf(doc,filename);
}
async function savePdf(doc,filename){
  if (downloads){
    try{ await downloads.save({filename,data:doc.output('blob')}); toast('PDF gerado.'); }
    catch(e){ if(e&&(e.code==='cancelled'||e.code==='declined')) return; try{ doc.save(filename); }catch(e2){ toast('Download não concluído.',true); } }
  } else { doc.save(filename); toast('PDF gerado.'); }
}
// monta o PDF (síncrono). o: {specs, rows (linhas da base já filtradas), filterText, kicker, title, kpis}
function buildReportPdf(meta,o){
  const specs=o.specs, rows=o.rows, vd=vizData(meta,rows);
  let doc, filename;
  {
    doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    const PW=210, PH=297, M=15, CW=PW-2*M, BOTTOM=PH-18;
    const T=pdfTxt, fill=c=>doc.setFillColor(...c), ink=c=>doc.setTextColor(...c), stroke=c=>doc.setDrawColor(...c);
    const font=(style,size)=>{ doc.setFont('helvetica',style); doc.setFontSize(size); };
    const fit=(s,w)=>{ const l=doc.splitTextToSize(T(s),w); return l.length>1?l[0].replace(/\s*\S{0,3}$/,'')+'...':(l[0]||''); };

    // Cabeçalho (cor e logo da marca, se configurados no perfil)
    const br=brand(), A=br.custom?hexRgb(br.color):PDFC.accent, AW=mixRgb(A,[255,255,255],0.9), onA=br.custom&&lum(br.color)>0.55?[17,17,17]:[255,255,255];
    fill(A); doc.rect(0,0,PW,36,'F');
    let HW=CW;
    if (br.logo){ const lf=logoFit(br,46,16), pw=lf.w+6, ph=lf.h+6, px=PW-M-pw, py=18-ph/2;
      fill([255,255,255]); doc.roundedRect(px,py,pw,ph,2,2,'F');
      try{ doc.addImage(br.logo,'PNG',px+3,py+3,lf.w,lf.h); }catch(e){ console.warn(e); }
      HW=CW-pw-6; }
    const pf=S.profile||{}, who=[profileName(),pf.role].filter(Boolean).join(' · '), org=[pf.department,pf.company].filter(Boolean).join(' · ');
    ink(onA); font('bold',8.5); doc.text(fit(`${br.name?br.name.toUpperCase()+'  ·  ':''}${o.kicker||'RELATÓRIO DE GRÁFICOS'}`,HW),M,12,{charSpace:0.6});
    font('bold',20); doc.text(fit(o.title||meta.name,HW),M,23);
    font('normal',9); doc.text(fit(`Gerado em ${fmtWhen(Date.now())} · Preparado por ${who}${org?' · '+org:''}`,HW),M,30);
    let y=46;
    ink(PDFC.t2); font('normal',9.5);
    doc.text(T(`${nf.format(rows.length)} registros analisados · ${meta.columns.length} colunas · arquivo ${meta.fileName||'-'}`),M,y); y+=5.5;
    doc.splitTextToSize(T(o.filterText||''),CW).forEach(l=>{ doc.text(l,M,y); y+=4.6; });
    y+=5;

    const section=label=>{ ink(PDFC.text); font('bold',12); doc.text(label,M,y); stroke(A); doc.setLineWidth(0.6); doc.line(M,y+2,M+12,y+2); y+=8; };

    // Indicadores (com variação em relação ao período anterior, quando houver)
    const kp=o.kpis===false?[]:computeKpis(meta,rows,o.prev), gap=4, kw=(CW-gap*2)/3, kh=21;
    if (kp.length) section('Indicadores');
    kp.forEach((k,i)=>{
      const x=M+(i%3)*(kw+gap), yy=y+Math.floor(i/3)*(kh+gap);
      fill(PDFC.soft); doc.roundedRect(x,yy,kw,kh,2,2,'F');
      fill(A); doc.rect(x,yy+4,0.9,kh-8,'F');
      ink(PDFC.t2); font('normal',7.5); doc.text(fit(k.lb,kw-8),x+4.5,yy+6);
      ink(PDFC.text); font('bold',k.small?10.5:14); doc.text(fit(k.vl,kw-8),x+4.5,yy+13.5);
      if (k.cmp){ ink(k.d.good==null?PDFC.t3:k.d.good?[8,128,96]:[200,40,50]); font('bold',6.8); doc.text(fit(k.cmp,kw-8),x+4.5,yy+18); }
      else if (k.sm){ ink(PDFC.t3); font('normal',6.8); doc.text(fit(k.sm,kw-8),x+4.5,yy+18); }
    });
    if (kp.length) y+=Math.ceil(kp.length/3)*(kh+gap)+6;
    if (o.prev&&kp.some(k=>k.cmp)){ y-=3; ink(PDFC.t3); font('normal',7.5); doc.text(T(`Variações comparadas com ${rangeTxt(o.prev.range)}.`),M,y); y+=6; }
    // Metas (só no relatório geral, que usa todos os dados)
    const goals=o.goals?(meta.goals||[]).map(g=>({g,s:goalStatus(meta,g)})).filter(x=>x.s):[];
    if (goals.length){
      section('Metas');
      goals.forEach(({g,s})=>{
        if (y+14>BOTTOM){ doc.addPage(); y=M+4; }
        const col=s.st==='ok'?[8,128,96]:s.st==='track'?A:s.st==='warn'?[176,112,0]:[200,40,50];
        ink(PDFC.text); font('bold',9.5); doc.text(fit(g.name,CW*0.55),M,y+3.5);
        ink(PDFC.t2); font('normal',9); doc.text(T(`${fmtNum(s.v)} de ${fmtNum(s.t)} (${pct1(s.pct)})`),PW-M,y+3.5,{align:'right'});
        fill(PDFC.soft); doc.roundedRect(M,y+5.5,CW,2.2,1.1,1.1,'F');
        fill(col); doc.roundedRect(M,y+5.5,Math.max(2.2,CW*Math.min(1,s.pct/100)),2.2,1.1,1.1,'F');
        ink(col); font('normal',8); doc.text(fit(s.txt,CW),M,y+11.5);
        y+=16;
      });
      y+=2;
    }

    // Gráficos
    const imgH=CW*400/900;
    if (specs.length){ if(y+8+13+imgH+30>BOTTOM){ doc.addPage(); y=M+4; } section('Gráficos'); } // título nunca fica sozinho no fim da página
    const typeName={bar:'Gráfico de colunas',hbar:'Gráfico de barras',line:'Gráfico de linha',pie:'Gráfico de rosca'};
    specs.forEach((spec,n)=>{
      const res=aggregate(vd.vmeta,spec,vd.rows);
      const L=chartLabels(spec,res), yLabel=L.yLabel;
      const has=res&&res.labels.length;
      font('normal',9); const lines=doc.splitTextToSize(T(describeChart(vd.vmeta,spec,res)),CW-12);
      const boxH=11+lines.length*4.6;
      const blockH=15+(has?imgH:18)+4+boxH;
      if (y+blockH>BOTTOM){ doc.addPage(); y=M+4; }
      // título com número
      fill(A); doc.roundedRect(M,y-1,7,7,1.5,1.5,'F');
      ink(onA); font('bold',9); doc.text(String(n+1),M+3.5,y+3.9,{align:'center'});
      ink(PDFC.text); font('bold',12); doc.text(fit(L.title,CW-10),M+10,y+4);
      ink(PDFC.t3); font('normal',8.5); doc.text(fit(`${typeName[spec.type]||'Gráfico'} · ${L.sub}${spec.filter?` · só ${spec.filter.col}: ${spec.filter.val}`:''}`,CW-10),M+10,y+9);
      y+=13;
      if (has){
        doc.addImage(chartImage(spec,res,yLabel),'JPEG',M,y,CW,imgH);
        stroke(PDFC.line); doc.setLineWidth(0.25); doc.roundedRect(M,y,CW,imgH,2,2,'S');
        y+=imgH+4;
      } else {
        fill(PDFC.soft); doc.roundedRect(M,y,CW,18,2,2,'F');
        ink(PDFC.t3); font('normal',9); doc.text('Sem dados para este gráfico com os filtros atuais.',PW/2,y+10.5,{align:'center'});
        y+=22;
      }
      // explicação
      fill(AW); doc.roundedRect(M,y,CW,boxH,2,2,'F');
      fill(A); doc.rect(M,y+3,1,boxH-6,'F');
      ink(lum('#'+rgbHex(A))>0.4?mixRgb(A,[0,0,0],0.45):A); font('bold',8); doc.text('SOBRE ESTE GRÁFICO',M+6,y+6,{charSpace:0.3});
      ink(PDFC.t2); font('normal',9); doc.text(lines,M+6,y+11,{lineHeightFactor:1.45});
      y+=boxH+11;
    });

    // Rodapé
    const total=doc.getNumberOfPages();
    for (let i=1;i<=total;i++){
      doc.setPage(i);
      stroke(PDFC.line); doc.setLineWidth(0.25); doc.line(M,PH-12,PW-M,PH-12);
      ink(PDFC.t3); font('normal',7.5);
      doc.text(fit(`${br.name||'Painel de Planilhas'} · ${meta.name}`,CW-30),M,PH-7.5);
      doc.text(`Página ${i} de ${total}`,PW-M,PH-7.5,{align:'right'});
    }
    filename=`${(o.title||meta.name).replace(/[\\/:*?"<>|]/g,'_')||'graficos'} - ${o.title?'relatorio':'graficos'}.pdf`;
  }
  return {doc,filename};
}
function persistCharts(m){ m.columns=m.columns.filter(c=>!c.virtual); /* colunas de bases conectadas nunca são gravadas na base */ const i=S.bases.findIndex(b=>b.id===m.id); if(i>=0) S.bases[i]=structuredClone(m); render(); saveMeta(m).catch(handleWriteError); }
function aggregate(meta,spec,rows){
  const xj=meta.columns.findIndex(c=>c.name===spec.x); const yj=spec.y?meta.columns.findIndex(c=>c.name===spec.y):-1;
  if (xj<0) return null;
  if (spec.filter&&spec.filter.col){ const fj=meta.columns.findIndex(c=>c.name===spec.filter.col); if(fj>=0) rows=rows.filter(r=>String(r[fj]??'')===String(spec.filter.val)); }
  const xt=meta.columns[xj].type, emptyLb=meta.columns[xj].virtual?'(sem correspondência)':'(vazio)';
  let gran=null, keyOf=v=>v==null||v===''?emptyLb:String(v);
  if (xt==='text'&&isTimeCol(rows,xj)){ // coluna de horário ("23:32"): agrupa por hora cheia
    gran='h'; keyOf=v=>{ const m=/^(\d{1,2}):\d{2}/.exec(String(v??'').trim()); return m?pad(+m[1]):null; };
  } else if (xt==='date'){
    const ds=rows.map(r=>r[xj]).filter(v=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)).sort();
    if (!ds.length) return {labels:[],values:[],ordered:true};
    const span=(new Date(ds[ds.length-1])-new Date(ds[0]))/864e5;
    gran=span>365*4?'y':span>62?'m':'d';
    keyOf=v=>(!v||!/^\d{4}-\d{2}-\d{2}$/.test(v))?null:(gran==='y'?v.slice(0,4):gran==='m'?v.slice(0,7):v);
  } else if (xt==='number'){ keyOf=v=>typeof v==='number'?v:null; }
  if (spec.skipEmpty){ const k0=keyOf; keyOf=v=>v==null||v===''?null:k0(v); } // ignora linhas sem valor (ex.: colunas de enriquecimento)
  const g=new Map();
  for (const r of rows){ const k=keyOf(r[xj]); if(k==null) continue; let o=g.get(k); if(!o){o={s:0,n:0,c:0,mn:Infinity,mx:-Infinity};g.set(k,o);} o.c++; if(yj>=0){ let v=r[yj]; if(typeof v==='number'){ if(spec.abs) v=Math.abs(v); o.s+=v;o.n++; if(v<o.mn)o.mn=v; if(v>o.mx)o.mx=v;} } }
  const val=o=>{ if(yj<0||spec.agg==='count') return o.c; if(spec.agg==='avg') return o.n?o.s/o.n:0; if(spec.agg==='max') return o.n?o.mx:0; if(spec.agg==='min') return o.n?o.mn:0; return o.s; };
  let entries=[...g.entries()].map(([k,o])=>[k,val(o)]);
  let ordered = xt==='date'||xt==='number'||gran==='h';
  if (ordered) entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  else if (xt==='text'&&entries.length>=2&&entries.length<=36){ // nomes de meses (“Janeiro”, “fev/25”…) ficam na ordem do calendário
    const ms=entries.map(e=>sheetMonth(String(e[0])));
    if (ms.every(Boolean)){ entries=entries.map((e,i)=>[e,ms[i]]).sort((a,b)=>((+a[1].y||0)-(+b[1].y||0))||a[1].m-b[1].m).map(x=>x[0]); ordered=true; }
  }
  else {
    entries.sort((a,b)=>b[1]-a[1]);
    const top=spec.type==='line'?30:spec.type==='pie'?7:spec.type==='map'?60:spec.type==='funnel'?8:12;
    if (entries.length>top){ const rest=entries.slice(top); let other; if(spec.agg==='avg'||spec.agg==='max'||spec.agg==='min'){ other=null; } else other=rest.reduce((s,e)=>s+e[1],0); entries=entries.slice(0,top); if(other!=null) entries.push([`Outros (${rest.length})`,other]); }
  }
  const lab=k=>{ if(gran==='h') return `${k}h`; if(xt!=='date') return xt==='number'?nf.format(k):k; if(gran==='y') return k; if(gran==='m'){ const [y,m]=k.split('-'); return `${MESES[+m-1]}/${y.slice(2)}`; } return fmtDate(k); };
  const out={labels:entries.map(e=>lab(e[0])),values:entries.map(e=>e[1]),ordered,gran,keys:xt==='date'?entries.map(e=>e[0]):null};
  // empilhadas e tabela dinâmica: cruzam a coluna do eixo com a coluna "dividir por"
  if (spec.type==='stacked'&&xt==='date'&&out.keys){ // empilhadas no tempo: cada período dividido pelas maiores categorias
    const sj=spec.series?meta.columns.findIndex(c=>c.name===spec.series):-1, pos=new Map(out.keys.map((k,i)=>[k,i])), T=new Map();
    const lbS=v=>v==null||v===''?'(vazio)':String(v), vOf=r=>{ if(yj<0||spec.agg==='count') return 1; let v=r[yj]; if(typeof v!=='number') return null; return spec.abs?Math.abs(v):v; };
    for (const r of rows){ const i=pos.get(keyOf(r[xj])); if(i==null) continue; const v=vOf(r); if(v==null) continue; const s=sj>=0?lbS(r[sj]):(spec.y||'Registros');
      let a=T.get(s); if(!a){ a={tot:0,s:out.keys.map(()=>0),n:out.keys.map(()=>0)}; T.set(s,a); } a.s[i]+=v; a.n[i]++; a.tot+=Math.abs(v); }
    let names=[...T.entries()].sort((a,b)=>b[1].tot-a[1].tot).map(e=>e[0]);
    const val=(a,i)=>spec.agg==='avg'?(a.n[i]?a.s[i]/a.n[i]:0):a.s[i];
    let series=names.slice(0,names.length>6?5:6).map(nm=>({name:nm,values:out.keys.map((_,i)=>val(T.get(nm),i))}));
    if (names.length>6&&spec.agg!=='avg'){ const rest=names.slice(5); series.push({name:`Outros (${rest.length})`,values:out.keys.map((_,i)=>rest.reduce((s,nm)=>s+T.get(nm).s[i],0))}); }
    out.stack={labels:out.labels,series};
  } else if (spec.type==='stacked'||spec.type==='pivot'){
    const p=pivotData(meta,rows,{row:spec.x,col:spec.series||'',measure:spec.y||'',agg:spec.agg==='avg'?'avg':'sum'});
    if (p){ out.pivot=p; out.stack={labels:p.rows.map(r=>r.key),series:p.cols.length?p.cols.map((c,i)=>({name:c,values:p.rows.map(r=>r.cells[i]??0)})):[{name:spec.y||'Registros',values:p.rows.map(r=>r.total??0)}]}; }
  }
  return out;
}
const AGG={sum:'Soma',avg:'Média',count:'Contagem',max:'Máximo',min:'Mínimo'};
function chartCard(meta,spec,rows){
  const card=el('div',{class:'chart-card'+(spec.wide?' wide':'')});
  const res=aggregate(meta,spec,rows);
  if (!S.readOnly){ // arrastar pelo puxador para reordenar
    card.addEventListener('dragover',e=>{ if(!dragChartId||dragChartId===spec.id) return; e.preventDefault(); card.classList.add('drop-over'); });
    card.addEventListener('dragleave',()=>card.classList.remove('drop-over'));
    card.addEventListener('drop',e=>{ e.preventDefault(); card.classList.remove('drop-over'); const from=dragChartId; dragChartId=null; moveChart(meta,from,spec.id); });
  }
  const {yLabel,title,sub}=chartLabels(spec,res);
  const tableMode={v:false};
  const head=el('div',{class:'chart-head'},
    el('div',{style:'flex:1;min-width:0'},el('div',{class:'chart-title',text:title}),el('div',{class:'chart-sub',text:sub}),
      spec.filter?el('button',{class:'filter-chip',title:S.readOnly?'':'Remover este filtro do gráfico',disabled:S.readOnly,onclick:()=>{ const m=structuredClone(meta); const c=m.charts.find(c=>c.id===spec.id); delete c.filter; delete c.title; delete c.why; persistCharts(m); }},`Só ${spec.filter.col}: ${spec.filter.val}`,S.readOnly?'':' ×'):null),
    S.readOnly?null:el('span',{class:'drag-h',title:'Arraste para mudar a ordem',draggable:'true',ondragstart:e=>{ dragChartId=spec.id; e.dataTransfer.effectAllowed='move'; try{ e.dataTransfer.setDragImage(card,20,20); }catch(x){} card.classList.add('dragging'); },ondragend:()=>{ dragChartId=null; card.classList.remove('dragging'); }},'⠿'),
    S.readOnly?null:el('button',{class:'icon-btn',title:spec.wide?'Deixar no tamanho normal':'Ocupar a largura toda',onclick:()=>{ const m=structuredClone(meta); m.columns=m.columns.filter(c=>!c.virtual); const c=m.charts.find(c=>c.id===spec.id); c.wide=!c.wide; persistCharts(m); }},icon(spec.wide?'shrink':'expand')),
    imageButton(meta,spec,()=>res),
    S.readOnly||S.mode==='share'?null:pinButton(meta,spec),
    el('button',{class:'icon-btn',title:'Ver como tabela',onclick:()=>{tableMode.v=!tableMode.v;draw();}},icon('table')),
    S.readOnly?null:el('button',{class:'icon-btn edit-toggle simple-only',title:'Mudar este gráfico (tipo, o que mostrar, o que somar)','aria-label':'Mudar este gráfico',onclick:e=>{ const on=card.classList.toggle('editing'); e.currentTarget.classList.toggle('on',on); e.currentTarget.setAttribute('aria-pressed',String(on)); }},icon('edit')),
    S.readOnly?null:el('button',{class:'icon-btn',title:'Remover gráfico','aria-label':'Remover gráfico',onclick:()=>{ const before=structuredClone(currentMeta().charts||[]), m=structuredClone(meta); m.charts=m.charts.filter(c=>c.id!==spec.id); persistCharts(m); undoToast('Gráfico removido.',()=>{ const cur=structuredClone(currentMeta()); cur.charts=before; persistCharts(cur); }); }},icon('trash')));
  card.append(head);
  if (!S.readOnly){
    // mudar o que é medido/agrupado invalida o título e a explicação automáticos
    const upd=patch=>{ const m=structuredClone(meta); const c=m.charts.find(c=>c.id===spec.id); Object.assign(c,patch); if('x' in patch||'y' in patch||'agg' in patch||'type' in patch){ delete c.title; delete c.why; delete c.abs; } if(!c.y) c.agg='count'; else if(c.agg==='count'&&patch.y) c.agg='sum'; if((c.type==='pie'||c.type==='map'||c.type==='funnel')&&c.y&&c.agg!=='sum'&&c.agg!=='avg') c.agg='sum'; if(c.type==='pie'&&c.y) c.agg='sum'; if(!typeOk(m,c.type,c.x)) c.type=colType(m,c.x)==='date'?'line':'bar';
      if (c.type==='stacked'&&(!c.series||c.series===c.x)) c.series=defaultSeries(m,c.x); if(c.series===c.x) c.series=''; m.columns=m.columns.filter(x=>!x.virtual); persistCharts(m); };
    const typeSel=el('select',{title:'Tipo'},CHART_TYPES.map(({v,t})=>el('option',{value:v,selected:spec.type===v,disabled:!typeOk(meta,v,spec.x),text:t})));
    typeSel.onchange=()=>upd({type:typeSel.value});
    const xSel=el('select',{title:'Mostrar por'},meta.columns.map(c=>el('option',{value:c.name,selected:spec.x===c.name,text:'Mostrar por: '+c.name})));
    xSel.onchange=()=>upd({x:xSel.value});
    const ySel=el('select',{title:'O que somar'},el('option',{value:'',text:'Contar registros'}),meta.columns.filter(c=>c.type==='number').map(c=>el('option',{value:c.name,selected:spec.y===c.name,text:'Valor: '+c.name})));
    ySel.onchange=()=>upd({y:ySel.value});
    const aSel=el('select',{title:'Cálculo',disabled:!spec.y||spec.type==='pie'},['sum','avg','max','min'].map(a=>el('option',{value:a,selected:spec.agg===a,text:AGG[a]})));
    aSel.onchange=()=>upd({agg:aSel.value});
    const canTrend=spec.type==='line'&&colType(meta,spec.x)==='date';
    let serSel=null;
    if (spec.type==='stacked'||spec.type==='pivot'){
      serSel=el('select',{title:'Dividir por'},el('option',{value:'',text:spec.type==='pivot'?'Colunas: nenhuma':'Dividir por: nada'}),meta.columns.filter(c=>c.type==='text'&&c.name!==spec.x).map(c=>el('option',{value:c.name,selected:spec.series===c.name,text:(spec.type==='pivot'?'Colunas: ':'Dividir por: ')+c.name})));
      serSel.onchange=()=>upd({series:serSel.value});
    }
    card.append(el('div',{class:'chart-controls'},typeSel,xSel,ySel,aSel,serSel,
      canTrend?el('button',{class:'btn sm trend-btn'+(spec.forecast?' on':''),'aria-pressed':String(!!spec.forecast),title:'Mostra uma linha de tendência e uma estimativa dos próximos períodos',onclick:()=>upd({forecast:!spec.forecast})},spec.forecast?'✓ Tendência':'Tendência'):null));
  }
  const body=el('div'); card.append(body);
  function draw(){
    body.innerHTML='';
    if (!res||!res.labels.length){ body.append(el('div',{class:'muted',style:'height:120px;display:grid;place-items:center',text:'Sem dados para este gráfico com os filtros atuais.'})); return; }
    if (tableMode.v){
      body.append(el('div',{class:'chart-table'},el('table',{},el('thead',{},el('tr',{},el('th',{text:spec.x}),el('th',{text:yLabel}))),el('tbody',{},res.labels.map((l,i)=>el('tr',{},el('td',{text:l}),el('td',{text:nf.format(res.values[i])})))))));
      return;
    }
    // clicar numa barra/fatia filtra o painel inteiro por aquela categoria (só colunas de texto da própria base)
    const xc=meta.columns.find(c=>c.name===spec.x);
    const canFilter=spec.type!=='line'&&spec.type!=='pivot'&&xc&&xc.type==='text'&&!xc.virtual&&!res.gran&&S.vfilter.col!==spec.x;
    if (HTML_TYPES.has(spec.type)){
      body.append(htmlChart(spec,res,meta,canFilter?{onPick:l=>{ S.vfilter={...S.vfilter,col:spec.x,val:String(l)}; render(); toast(`Painel filtrado: ${spec.x} = ${l}. Use “Limpar filtros” para voltar.`); }}:{}));
      if (canFilter) body.append(el('div',{class:'chart-hint',text:'Clique num estado para filtrar o painel'}));
      return;
    }
    const box=el('div',{class:'chart-box'}); const cv=el('canvas',{'aria-label':`${yLabel} por ${spec.x}`,role:'img'}); box.append(cv); body.append(box);
    if (canFilter) body.append(el('div',{class:'chart-hint',text:spec.type==='pie'?'Clique numa fatia para filtrar o painel':'Clique numa barra para filtrar o painel'}));
    requestAnimationFrame(()=>makeChart(cv,spec,res,yLabel,canFilter?{onPick:l=>{
      S.vfilter={...S.vfilter,col:spec.x,val:String(l)}; render();
      toast(`Painel filtrado: ${spec.x} = ${l}. Use “Limpar filtros” para voltar.`);
    }}:{}));
  }
  draw();
  card.append(el('div',{class:'chart-note'},el('b',{text:'Sobre este gráfico: '}),describeChart(meta,spec,res,true)));
  return card;
}
// paleta categórica validada (8 cores, versões para fundo claro e escuro)
const PIE_COLORS={light:['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#6250d6','#e34948'],dark:['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767']};
const OTHER_COLOR={light:'#a3a29c',dark:'#6b6a64'};
// tema da página (claro ou escuro): os gráficos usam a versão da paleta validada para aquele fundo
const isDark=()=>document.documentElement.dataset.theme!=='light';

// a cor acompanha a categoria (não a posição): "Bruno" tem a mesma cor em todos os gráficos.
// Dentro de um mesmo gráfico, duas categorias nunca repetem cor enquanto houver cor livre.
const hashStr=s=>{ let h=5381; for(const ch of String(s)) h=((h*33)^ch.charCodeAt(0))>>>0; return h; };
function colorsFor(labels,mode){
  const pal=PIE_COLORS[mode], used=new Set();
  // entrada/saída têm cor fixa com sentido (verde = entrou, vermelho = saiu)
  const fixed=l=>/^entrada$/i.test(String(l).trim())?2:/^sa[ií]da$/i.test(String(l).trim())?7:-1;
  for (const l of labels){ const f=fixed(l); if(f>=0) used.add(f); }
  return labels.map(l=>{
    if (String(l).startsWith('Outros (')) return OTHER_COLOR[mode];
    const f=fixed(l); if(f>=0) return pal[f];
    let i=hashStr(String(l).trim().toLowerCase())%pal.length;
    if (used.size<pal.length) while(used.has(i)) i=(i+1)%pal.length;
    used.add(i); return pal[i];
  });
}
/* Uma cor de destaque por gráfico: numa série só, a maior barra leva o azul e as outras ficam em cinza.
   Entrada/saída mantêm verde e vermelho, porque ali a cor tem significado. */
const ACCENT={dark:'#4299e0',light:'#2272b4'}, BAR_NEUTRAL={dark:'#3e4c57',light:'#c0cdd8'};
function barColors(res,mode){
  if (res.labels.some(l=>/^(entrada|sa[ií]da)s?$/i.test(String(l).trim()))) return colorsFor(res.labels,mode);
  const vals=res.values.map(v=>Math.abs(+v||0)), max=Math.max(0,...vals); let hit=false;
  return vals.map(v=>{ if(!hit&&max>0&&v===max){ hit=true; return ACCENT[mode]; } return BAR_NEUTRAL[mode]; });
}
const seriesColor=(spec,mode)=>PIE_COLORS[mode][hashStr(spec.id||spec.x||'')%PIE_COLORS[mode].length];
const withAlpha=(hex,a)=>hex+Math.round(a*255).toString(16).padStart(2,'0');
function pieConfig(res,{dark,surf,t2,fontSize}){
  const mode=dark?'dark':'light';
  const colors=colorsFor(res.labels,mode);
  const total=res.values.reduce((a,b)=>a+b,0);
  const pc=v=>total?pct1(v/total*100):'';
  return {type:'doughnut',
    data:{labels:res.labels,datasets:[{data:res.values,backgroundColor:colors,borderColor:surf,borderWidth:2,hoverOffset:4}]},
    options:{cutout:'58%',plugins:{legend:{position:'right',labels:{color:t2,font:{size:fontSize},boxWidth:10,boxHeight:10,padding:10,
      generateLabels(ch){ return Chart.overrides.doughnut.plugins.legend.labels.generateLabels(ch).map((it,i)=>{ const l=String(res.labels[i]); it.text=`${l.length>24?l.slice(0,23)+'…':l}  ${pc(res.values[i])}`; it.fontColor=t2; return it; }); }}}}},
    pc};
}
// linha-guia vertical que acompanha o mouse nos gráficos de linha
const crosshair={id:'crosshair',afterDatasetsDraw(ch){
  const a=ch.tooltip&&ch.tooltip.getActiveElements&&ch.tooltip.getActiveElements(); if(!a||!a.length) return;
  const x=a[0].element.x, {top,bottom}=ch.chartArea, c=ch.ctx;
  c.save(); c.strokeStyle=isDark()?'rgba(209,212,220,.35)':'rgba(40,40,48,.3)'; c.setLineDash([4,4]); c.lineWidth=1; c.beginPath(); c.moveTo(x,top); c.lineTo(x,bottom); c.stroke(); c.restore();
}};
// opts.onPick(label): clique numa barra/fatia (usado para filtrar o painel)
function makeChart(cv,spec,res,yLabel,opts={}){
  if (!window.Chart || !cv.isConnected) return;
  const grid=css('--grid'), t2=css('--text-2'), surf=css('--surface'), mode=isDark()?'dark':'light';
  const tip=mode==='dark'
    ?{backgroundColor:'#1f272d',borderColor:'#37444f',borderWidth:1,titleColor:'#e8ecf0',bodyColor:'#c0cdd8',padding:10,cornerRadius:4,boxPadding:4}
    :{backgroundColor:'#ffffff',borderColor:'#d1d9e1',borderWidth:1,titleColor:'#11171c',bodyColor:'#5f7281',padding:10,cornerRadius:4,boxPadding:4};
  const pick=opts.onPick?(evt,els)=>{ if(!els.length) return; const l=res.labels[els[0].index]; if(String(l).startsWith('Outros (')) return; opts.onPick(l); }:undefined;
  const hover=(evt,els)=>{ const t=evt.native&&evt.native.target; if(t) t.style.cursor=opts.onPick&&els.length?'pointer':'default'; };
  if (spec.type==='pie'){
    const cfg=pieConfig(res,{dark:isDark(),surf,t2,fontSize:Math.max(12,Chart.defaults.font.size)});
    Object.assign(cfg.options,{responsive:true,maintainAspectRatio:false,animation:{animateRotate:true,animateScale:true,duration:900,easing:'easeOutQuart'},onClick:pick,onHover:hover});
    cfg.data.datasets[0].hoverOffset=10;
    const pc=cfg.pc; delete cfg.pc;
    cfg.options.plugins.tooltip={...tip,callbacks:{label:ctx=>` ${yLabel}: ${nf.format(ctx.parsed)} (${pc(ctx.parsed)})`}};
    const ch=new Chart(cv,cfg); charts.push(ch); return ch;
  }
  const extra=extraChartConfig(spec,res,yLabel,{mode,t2,grid,tip,live:true});
  if (extra){ const lo=extra.labelsOf; delete extra.labelsOf; Object.assign(extra.options,{onClick:opts.onPick?(evt,els)=>{ if(!els.length) return; const l=lo[els[0].index]; if(String(l).startsWith('Outros (')) return; opts.onPick(l); }:undefined,onHover:hover}); const ch=new Chart(cv,extra); charts.push(ch); return ch; }
  const horiz=spec.type==='hbar', line=spec.type==='line', n=res.labels.length;
  const valueAxis={beginAtZero:true,grid:{color:grid,drawTicks:false},border:{display:false},ticks:{color:t2,padding:6,callback:v=>nfc.format(v)}};
  const catAxis={grid:{display:false},border:{color:grid},ticks:{color:t2,autoSkip:true,maxRotation:0,callback:function(v){ const l=this.getLabelForValue(v); return String(l).length>22?String(l).slice(0,21)+'…':l; }}};
  let dataset, animation;
  if (line){
    const col=ACCENT[mode];
    dataset={label:yLabel,data:res.values,borderColor:col,borderWidth:2.5,tension:.3,pointRadius:n>40?0:3,pointHoverRadius:6,pointBackgroundColor:col,pointBorderColor:surf,pointBorderWidth:2,
      fill:true,backgroundColor:c=>{ const a=c.chart.chartArea; if(!a) return withAlpha(col,.15); const g=c.chart.ctx.createLinearGradient(0,a.top,0,a.bottom); g.addColorStop(0,withAlpha(col,.32)); g.addColorStop(1,withAlpha(col,0)); return g; }};
    // os pontos sobem da base um após o outro (onda da esquerda para a direita)
    const step=Math.max(10,Math.min(45,700/Math.max(n,1)));
    animation={duration:850,easing:'easeOutQuart',delay(c){ return c.type==='data'&&c.mode==='default'?c.dataIndex*step:0; }};
    var fc=spec.forecast?forecastOf(res):null;
  } else {
    const cols=barColors(res,mode);
    dataset={label:yLabel,data:res.values,backgroundColor:cols.map(c=>withAlpha(c,.82)),hoverBackgroundColor:cols,borderColor:cols,borderWidth:0,hoverBorderWidth:0,borderRadius:4,borderSkipped:'start',maxBarThickness:40};
    // barras crescem uma a uma
    animation={duration:750,easing:'easeOutQuart',delay(c){ return c.type==='data'&&c.mode==='default'?c.dataIndex*55:0; }};
  }
  const sets=[dataset]; let labels=res.labels;
  // barras de categorias (não tempo): rótulo com valor e fatia do total na ponta de cada barra
  const tot=res.values.reduce((a,b)=>a+b,0), shareOk=!line&&!res.ordered&&(!spec.y||spec.agg==='sum'||spec.agg==='count')&&tot>0&&res.values.every(v=>v>=0);
  const pctOf=v=>shareOk?` (${pct1(v/tot*100)})`:'';
  const barLabels=!line&&!res.ordered&&n<=(horiz?15:8)?{id:'barLabels',afterDatasetsDraw(c2){ const x=c2.ctx; x.save(); x.font='600 11px Segoe UI, -apple-system, Roboto, Arial, sans-serif'; x.fillStyle=t2;
    c2.getDatasetMeta(0).data.forEach((b,i)=>{ const v=res.values[i], t=nfc.format(v)+(shareOk?` · ${pct1(v/tot*100)}`:'');
      if (horiz){ x.textAlign='left'; x.textBaseline='middle'; x.fillText(t,b.x+6,b.y); } else { x.textAlign='center'; x.textBaseline='bottom'; x.fillText(t,b.x,b.y-4); } }); x.restore(); }}:null;
  if (barLabels) valueAxis.grace=horiz?'22%':'12%';
  if (fc){ // tendência: linha tracejada que segue além do último ponto
    labels=fc.labels; dataset.data=[...res.values,...Array(fc.labels.length-res.values.length).fill(null)];
    sets.push({label:'Tendência (estimativa)',data:fc.trend,borderColor:t2,backgroundColor:t2,borderDash:[6,5],borderWidth:2,pointRadius:0,pointHoverRadius:3,fill:false,tension:0,spanGaps:true});
  }
  const ch=new Chart(cv,{
    type:line?'line':'bar',
    data:{labels,datasets:sets},
    options:{
      indexAxis:horiz?'y':'x', responsive:true, maintainAspectRatio:false, animation,
      interaction:line?{mode:'index',intersect:false}:{mode:'nearest',intersect:true,axis:horiz?'y':'x'},
      onClick:pick, onHover:hover,
      plugins:{legend:{display:!!fc,position:'top',align:'end',labels:{color:t2,usePointStyle:true,pointStyle:'line',boxWidth:22,font:{size:11}}},tooltip:{...tip,displayColors:!line||!!fc,filter:it=>it.raw!=null,callbacks:{label:ctx=>{ const v=horiz?ctx.parsed.x:ctx.parsed.y; return ` ${ctx.dataset.label}: ${nf.format(v)}${ctx.datasetIndex===0?pctOf(v):''}`; }}}},
      scales: horiz?{x:valueAxis,y:catAxis}:{x:catAxis,y:valueAxis}
    },
    plugins:line?[crosshair]:barLabels?[barLabels]:[]
  });
  charts.push(ch);
  return ch;
}
function destroyCharts(){ while(charts.length){ try{charts.pop().destroy();}catch(e){} } }

export { ACCENT, AGG, BAR_NEUTRAL, OTHER_COLOR, PDFC, PIE_COLORS, aggregate, barColors, buildReportPdf, chartCard, chartImage, chartLabels, colorsFor, crosshair, describeChart, destroyCharts, dragChartId, exportChartsPdf, hashStr, isDark, makeChart, pct1, pdfTxt, persistCharts, pieConfig, savePdf, seriesColor, withAlpha };
