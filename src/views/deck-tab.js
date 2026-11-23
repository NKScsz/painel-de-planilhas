import { profileName } from '../app/init.js';
import { icon } from '../app/render.js';
import { distinctCount } from '../charts/auto-charts.js';
import { ACCENT, PIE_COLORS, aggregate, barColors, chartImage, chartLabels, colorsFor, describeChart, pct1, pdfTxt, savePdf } from '../charts/draw-and-pdf.js';
import { ufOf } from '../charts/extra-types.js';
import { S, charts } from '../core/state.js';
import { handleWriteError, saveMeta } from '../core/storage.js';
import { el, fmtNum, nf, toast } from '../core/utils.ts';
import { autoTour, helpBar } from '../easy/help.js';
import { brand, hexRgb, logoFit, lum, mixRgb, rgbHex } from '../features/brand.js';
import { reportPrev } from '../features/compare.js';
import { rangeTxt } from '../features/extras.js';
import { loadScript } from '../import/pdf-image.js';
import { vizData } from './data-model.js';
import { computeKpis } from './new-chart.js';
import { PERIODS, pdfReady, periodText, reportRows, reportSpecs } from './reports-tab.js';

/* ----- Aba Apresentação -----
   Gera um .pptx no navegador (PptxGenJS) com gráficos nativos do PowerPoint (editáveis):
   capa · visão geral (indicadores) · um slide por gráfico com "o que os dados mostram" · encerramento.
   A configuração fica em meta.deck; período/filtro/gráficos usam os mesmos campos dos relatórios. */
let pptxLib=null;
function getPptx(){ return pptxLib||(pptxLib=loadScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js').then(()=>{ if(!window.PptxGenJS) throw new Error('pptx'); return window.PptxGenJS; }).catch(e=>{ pptxLib=null; throw e; })); }
function deckCfg(meta){
  if (!S.deckCfg[meta.id]) S.deckCfg[meta.id]={title:meta.name,subtitle:'',client:'',period:'all',filter:null,charts:(meta.charts||[]).map(c=>c.id),kpis:true,theme:'dark',notes:true,...(meta.deck||{})};
  return S.deckCfg[meta.id];
}
function deckPlan(meta,cfg){
  const rows=reportRows(meta,cfg), vd=vizData(meta,rows), plan=[];
  plan.push({kind:'cover',title:cfg.title||meta.name,sub:cfg.subtitle});
  if (cfg.kpis){ const pv=reportPrev(meta,cfg), kp=computeKpis(meta,rows,pv).map(x=>x.cmp?{...x,sm:x.cmp}:x);
    if(kp.length) plan.push({kind:'kpis',title:'Visão geral',sub:periodText(meta,cfg)+(pv&&kp.some(x=>x.cmp)?` · comparado com ${rangeTxt(pv.range)}`:''),kp:kp.slice(0,6)}); }
  for (const spec of reportSpecs(meta,cfg)){
    const res=aggregate(vd.vmeta,spec,vd.rows), L=chartLabels(spec,res);
    plan.push({kind:'chart',spec,res,title:L.title,sub:L.sub+(spec.filter?` · só ${spec.filter.col}: ${spec.filter.val}`:''),
      short:describeChart(vd.vmeta,spec,res,true),long:describeChart(vd.vmeta,spec,res)});
  }
  plan.push({kind:'end',title:'Obrigado'});
  return {plan,rows};
}
// destaque do gráfico para o painel lateral do slide
function chartHighlight(spec,res){
  if (!res||!res.labels.length) return null;
  if (spec.type==='line'){
    const i=res.values.indexOf(Math.max(...res.values));
    return {lb:'Ponto mais alto',name:String(res.labels[i]),vl:fmtNum(res.values[i])};
  }
  // o grupo "Outros (N)" nunca é o destaque: pega o maior item de verdade
  let i=-1; res.values.forEach((v,j)=>{ if(!String(res.labels[j]).startsWith('Outros (')&&(i<0||v>res.values[i])) i=j; });
  if (i<0) return null;
  const tot=res.values.reduce((a,b)=>a+b,0);
  const share=(spec.type==='pie'||!spec.y||spec.agg==='count'||spec.agg==='sum')&&tot>0?` · ${pct1(res.values[i]/tot*100)} do total`:'';
  return {lb:'Destaque',name:String(res.labels[i]),vl:fmtNum(res.values[i])+share};
}
// cores dos slides: azul padrão ou a cor da marca (com ajuste de contraste para títulos e destaques)
function deckPalette(dark){
  const br=brand(), c=br.custom?br.color:'#2962ff', acc=c.slice(1).toUpperCase(), L=lum(c);
  const hl=!br.custom?(dark?'8FA8FF':'2962FF'):dark?(L<0.12?rgbHex(mixRgb(hexRgb(c),[255,255,255],0.5)):acc):(L>0.45?rgbHex(mixRgb(hexRgb(c),[0,0,0],0.45)):acc);
  const P=dark?{bg:'0F0F0F',card:'1A1A1A',text:'FFFFFF',t2:'C9CBD2',t3:'8A8D96',line:'2A2A2A'}:{bg:'FFFFFF',card:'F2F4F7',text:'131722',t2:'3F4350',t3:'6B6F7B',line:'E3E5EA'};
  return {br,P:{...P,accent:acc,hl,onAccent:L>0.55?'111111':'FFFFFF'}};
}
async function buildDeck(meta,cfg){
  const Pptx=await getPptx();
  const {plan}=deckPlan(meta,cfg);
  const dark=cfg.theme!=='light', mode=dark?'dark':'light', BP=deckPalette(dark), P=BP.P, br=BP.br;
  const hex=c=>String(c).replace('#','').slice(0,6).toUpperCase();
  const pf=S.profile||{}, who=profileName();
  const W=13.333, H=7.5, M=0.6;
  const pres=new Pptx(); pres.layout='LAYOUT_WIDE';
  pres.author=who; pres.title=cfg.title||meta.name; if (br.name) pres.company=br.name.replace(/&/g,'&amp;');
  pres.theme={headFontFace:'Calibri',bodyFontFace:'Calibri'};
  const footer=[br.name,cfg.title||meta.name].filter(Boolean).join(' · ');
  // logo da marca numa placa branca (fica legível em qualquer fundo); devolve onde o texto pode começar
  const plate=sl=>{ if(!br.logo) return 0.6; const lf=logoFit(br,2.6,0.55);
    sl.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:M,y:0.45,w:lf.w+0.3,h:lf.h+0.3,rectRadius:0.08,fill:{color:'FFFFFF'},line:{color:'FFFFFF'},objectName:'Fundo do logo'});
    sl.addImage({data:br.logo.replace(/^data:/,''),x:M+0.15,y:0.6,w:lf.w,h:lf.h,altText:br.name||'Logo'});
    return 0.45+lf.h+0.3+0.2; };
  pres.defineSlideMaster({title:'CONTEUDO',background:{color:P.bg},
    slideNumber:{x:W-M-0.8,y:H-0.5,w:0.8,h:0.3,fontFace:'Calibri',fontSize:10,color:P.t3,align:'right'},
    objects:[{text:{text:footer,options:{x:M,y:H-0.5,w:8,h:0.3,fontFace:'Calibri',fontSize:10,color:P.t3,margin:0}}}]});
  const T=(sl,text,o)=>sl.addText(text,{margin:0,isTextBox:true,fontFace:'Calibri',...o});
  const card=(sl,x,y,w,h,name)=>sl.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w,h,rectRadius:0.12,fill:{color:P.card},line:{color:P.card},objectName:name});
  const titleSize=t=>t.length>70?24:t.length>45?28:32;
  // motivo visual: colunas coloridas (capa e encerramento)
  const bars=(sl,x0,base,scale)=>{ const hs=[1.5,2.5,1.9,3.2,4.1], cs=PIE_COLORS.dark;
    hs.forEach((h,i)=>sl.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:x0+i*0.82*scale,y:base-h*scale,w:0.56*scale,h:h*scale,rectRadius:0.08,fill:{color:hex(cs[i])},line:{color:hex(cs[i])},objectName:'Coluna decorativa '+(i+1)})); };
  const head=(sl,n,title,sub)=>{
    sl.addShape(pres.shapes.OVAL,{x:M,y:0.62,w:0.5,h:0.5,fill:{color:P.accent},line:{color:P.accent},objectName:'Número do slide'});
    T(sl,String(n).padStart(2,'0'),{x:M,y:0.62,w:0.5,h:0.5,fontSize:13,bold:true,color:P.onAccent,align:'center',valign:'middle'});
    T(sl,title,{x:M+0.75,y:0.5,w:W-2*M-0.75,h:0.75,fontSize:titleSize(title),bold:true,color:P.text,valign:'middle'});
    if (sub) T(sl,sub,{x:M+0.75,y:1.22,w:W-2*M-0.75,h:0.4,fontSize:14,color:P.t3,valign:'top'});
  };
  const dateTxt=new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
  let n=0;
  for (const s of plan){
    if (s.kind==='cover'){
      const sl=pres.addSlide(); sl.background={color:'0F0F0F'};
      const ky=plate(sl), tyy=Math.max(1.6,ky+0.5);
      T(sl,(br.name||'Apresentação de resultados').toUpperCase(),{x:M,y:ky,w:8,h:0.4,fontSize:12,bold:true,color:'8A8D96',charSpacing:2});
      const ts=s.title.length>60?32:s.title.length>32?38:46;
      T(sl,s.title,{x:M,y:tyy,w:7.6,h:4.1-tyy,fontSize:ts,bold:true,color:'FFFFFF',valign:'bottom',fit:'shrink'});
      if (s.sub) T(sl,s.sub,{x:M,y:4.25,w:7.6,h:0.9,fontSize:20,color:'C9CBD2',valign:'top'});
      const info=[cfg.client?`Preparado para ${cfg.client}`:null,`Dados: ${periodText(meta,cfg)}`,[who,pf.role].filter(Boolean).join(' · ')+` · ${dateTxt}`].filter(Boolean);
      T(sl,info.map((t,i)=>({text:t,options:{breakLine:i<info.length-1,bold:i===0&&!!cfg.client,color:i===0&&cfg.client?'FFFFFF':'C9CBD2'}})),{x:M,y:5.35,w:7.6,h:1.4,fontSize:14,valign:'bottom',paraSpaceAfter:4});
      bars(sl,9.0,6.75,1);
      continue;
    }
    if (s.kind==='end'){
      const sl=pres.addSlide(); sl.background={color:'0F0F0F'}; plate(sl);
      T(sl,'Obrigado',{x:M,y:2.0,w:7.6,h:1.4,fontSize:54,bold:true,color:'FFFFFF',valign:'bottom'});
      T(sl,'Dúvidas e próximos passos: vamos conversar.',{x:M,y:3.5,w:7.6,h:0.6,fontSize:20,color:'C9CBD2'});
      const info=[who,pf.role,pf.company].filter(Boolean);
      T(sl,info.map((t,i)=>({text:t,options:{breakLine:i<info.length-1,bold:i===0,color:i===0?'FFFFFF':'C9CBD2'}})),{x:M,y:5.0,w:7.6,h:1.6,fontSize:14,valign:'bottom'});
      bars(sl,9.0,6.75,1);
      continue;
    }
    n++;
    const sl=pres.addSlide({masterName:'CONTEUDO'});
    head(sl,n,s.title,s.sub);
    if (s.kind==='kpis'){
      const k=s.kp, cols=k.length<=3?k.length:3, rowsN=Math.ceil(k.length/cols), gap=0.3;
      const cw=(W-2*M-gap*(cols-1))/cols, top=2.0, avail=H-0.9-top, ch=Math.min(2.3,(avail-gap*(rowsN-1))/rowsN);
      const cs=PIE_COLORS[mode];
      k.forEach((x,i)=>{
        const cx=M+(i%cols)*(cw+gap), cy=top+Math.floor(i/cols)*(ch+gap);
        card(sl,cx,cy,cw,ch,'Indicador '+(i+1));
        sl.addShape(pres.shapes.OVAL,{x:cx+0.35,y:cy+0.38,w:0.16,h:0.16,fill:{color:hex(cs[i%cs.length])},line:{color:hex(cs[i%cs.length])}});
        T(sl,x.lb,{x:cx+0.62,y:cy+0.25,w:cw-0.95,h:0.42,fontSize:14,color:P.t2,valign:'middle'});
        T(sl,x.vl,{x:cx+0.35,y:cy+0.75,w:cw-0.7,h:0.85,fontSize:String(x.vl).length>18?20:x.small||String(x.vl).length>12?26:36,bold:true,color:P.text,valign:'middle'});
        if (x.sm) T(sl,x.sm,{x:cx+0.35,y:cy+ch-0.6,w:cw-0.7,h:0.4,fontSize:12,color:P.t3,valign:'top'});
      });
      if (cfg.notes) sl.addNotes(k.map(x=>`${x.lb}: ${x.vl}${x.sm?' ('+x.sm+')':''}`).join('\n'));
      continue;
    }
    // slide de gráfico: gráfico nativo à esquerda, leitura à direita
    const res=s.res, spec=s.spec, cx=M, cy=1.85, cw=8.4, chH=H-0.95-cy;
    const px=cx+cw+0.35, pw=W-M-px;
    if (!res||!res.labels.length){
      card(sl,cx,cy,cw,chH,'Sem dados');
      T(sl,'Sem dados para este gráfico no período escolhido.',{x:cx,y:cy,w:cw,h:chH,fontSize:16,color:P.t3,align:'center',valign:'middle'});
    } else {
      const cnt=res.labels.length, labels=res.labels.map(l=>{ l=String(l); return l.length>28?l.slice(0,27)+'…':l; });
      const fmt=res.values.some(v=>Math.abs(v%1)>1e-9)?'#,##0.00':'#,##0';
      const colors=colorsFor(res.labels,mode).map(hex);
      const base={x:cx,y:cy,w:cw,h:chH,
        catAxisLabelColor:P.t2,valAxisLabelColor:P.t3,catAxisLabelFontSize:11,valAxisLabelFontSize:10,
        catAxisLabelFontFace:'Calibri',valAxisLabelFontFace:'Calibri',dataLabelFontFace:'Calibri',legendFontFace:'Calibri',
        dataLabelFontSize:10,dataLabelColor:P.t2,valGridLine:{color:P.line,size:0.75},catGridLine:{style:'none'},
        catAxisLineColor:P.line,valAxisLineShow:false,showLegend:false,valAxisLabelFormatCode:fmt,dataLabelFormatCode:fmt};
      const data=[{name:s.title,labels,values:res.values}];
      const cutL=l=>{ l=String(l); return l.length>28?l.slice(0,27)+'…':l; };
      if (spec.type==='stacked'&&res.stack) sl.addChart(pres.charts.BAR,res.stack.series.map(x=>({name:x.name,labels:res.stack.labels.map(cutL),values:x.values})),{...base,barDir:'col',barGrouping:'stacked',
        chartColors:colorsFor(res.stack.series.map(x=>x.name),mode).map(hex),barGapWidthPct:55,showLegend:res.stack.series.length>1,legendPos:'t',legendFontSize:11,legendColor:P.t2,showValue:false,catAxisLabelRotate:res.stack.labels.length>8?-45:0});
      else if (spec.type==='pivot'&&res.pivot){ const p=res.pivot, hdr=[p.rowName,...p.cols,p.cols.length?'Total':(p.agg==='count'?'Registros':p.measure)];
        const cellO=(t,o={})=>({text:t,options:{fontFace:'Calibri',fontSize:12,color:P.text,fill:{color:o.head?P.card:P.bg},bold:!!o.bold,align:o.num?'right':'left',border:[{type:'none'},{type:'none'},{pt:0.75,color:P.line},{type:'none'}],...o.x}});
        const f=v=>v==null?'—':fmtNum(v);
        const rowsT=[hdr.map((h,i)=>cellO(h,{head:true,bold:true,num:i>0,x:{color:P.t2,fontSize:11}})),...p.rows.map(r=>[cellO(r.key),...r.cells.map(v=>cellO(f(v),{num:true})),cellO(f(r.total),{num:true,bold:true})]),
          [cellO('Total',{bold:true}),...p.total.cells.map(v=>cellO(f(v),{num:true,bold:true})),cellO(f(p.total.total),{num:true,bold:true})]];
        sl.addTable(rowsT,{x:cx,y:cy,w:cw,colW:[Math.min(3,cw*0.36),...Array(hdr.length-1).fill((cw-Math.min(3,cw*0.36))/(hdr.length-1))],rowH:Math.min(0.42,chH/(rowsT.length+0.5)),margin:[3,6,3,6]}); }
      else if (spec.type==='map'||spec.type==='funnel'){ // sem mapa/funil nativo no PowerPoint: barras horizontais na mesma ordem
        const lbs=spec.type==='map'?res.labels.map(l=>ufOf(l)||cutL(l)):labels;
        sl.addChart(pres.charts.BAR,[{name:s.title,labels:lbs,values:res.values}],{...base,barDir:'bar',chartColors:barColors(res,mode).map(hex),barGapWidthPct:40,showValue:cnt<=27,dataLabelPosition:'outEnd',catAxisOrientation:'maxMin'}); }
      else if (spec.type==='pie') sl.addChart(pres.charts.DOUGHNUT,data,{...base,holeSize:58,chartColors:colors,showLegend:true,legendPos:'r',legendFontSize:12,legendColor:P.t2,
        showPercent:true,showValue:false,dataLabelColor:'FFFFFF',dataLabelFontSize:11,dataBorder:{pt:1.5,color:P.bg}});
      else if (spec.type==='line') sl.addChart(pres.charts.LINE,data,{...base,chartColors:[hex(ACCENT[mode])],lineSize:2.5,
        lineDataSymbol:cnt>40?'none':'circle',lineDataSymbolSize:6,showValue:cnt<=12,dataLabelPosition:'t',catAxisLabelRotate:cnt>12?-45:0});
      else sl.addChart(pres.charts.BAR,data,{...base,barDir:spec.type==='hbar'?'bar':'col',chartColors:barColors(res,mode).map(hex),barGapWidthPct:55,
        showValue:cnt<=16,dataLabelPosition:'outEnd',catAxisOrientation:spec.type==='hbar'?'maxMin':'minMax',catAxisLabelRotate:spec.type!=='hbar'&&cnt>8?-45:0});
    }
    // painel "o que os dados mostram"
    card(sl,px,cy,pw,chH,'Leitura do gráfico');
    T(sl,'O que os dados mostram',{x:px+0.3,y:cy+0.28,w:pw-0.6,h:0.4,fontSize:14,bold:true,color:P.hl});
    const hl=chartHighlight(spec,res); let ty=cy+0.8;
    if (hl){
      T(sl,hl.lb.toUpperCase(),{x:px+0.3,y:ty,w:pw-0.6,h:0.3,fontSize:10,bold:true,color:P.t3,charSpacing:1});
      T(sl,hl.name.length>24?hl.name.slice(0,23)+'…':hl.name,{x:px+0.3,y:ty+0.3,w:pw-0.6,h:0.45,fontSize:18,bold:true,color:P.text,valign:'top'});
      T(sl,hl.vl,{x:px+0.3,y:ty+0.8,w:pw-0.6,h:0.4,fontSize:14,color:P.t2});
      ty+=1.45;
    }
    // cabe no painel: ~30 caracteres por linha de 14pt, ~0,26" por linha; corta no fim de uma frase quando possível
    const boxH=cy+chH-ty-0.25, maxC=Math.floor(boxH/0.27)*28;
    let txt=s.short;
    if (txt.length>maxC){ const cut=txt.slice(0,maxC), dot=cut.lastIndexOf('. '); txt=dot>maxC*0.5?cut.slice(0,dot+1):cut.slice(0,cut.lastIndexOf(' '))+'…'; }
    T(sl,txt,{x:px+0.3,y:ty,w:pw-0.6,h:boxH,fontSize:14,color:P.t2,valign:'top'});
    if (cfg.notes) sl.addNotes(s.long);
  }
  const fileName=`${(cfg.title||meta.name).replace(/[\\/:*?"<>|]/g,'_')} - apresentacao.pptx`;
  return {pres,fileName,slides:plan.length};
}
async function downloadDeck(meta,cfg,btn){
  if (btn){ btn.disabled=true; btn.dataset.t=btn.textContent; btn.textContent='Gerando apresentação…'; }
  try{
    const {pres,fileName}=await buildDeck(meta,cfg);
    await pres.writeFile({fileName});
    toast('Apresentação gerada. Abra no PowerPoint, Keynote ou Google Apresentações.');
    saveDeckCfg(meta,cfg);
  }catch(e){ console.error(e); toast(e&&e.code==='lib-load'?'Não foi possível carregar o gerador de apresentações. Verifique sua conexão.':'Não foi possível gerar a apresentação.',true); }
  finally{ if(btn){ btn.disabled=false; btn.textContent=''; btn.append(icon('slides'),btn.dataset.t); } }
}
// mesma apresentação em PDF (16:9), desenhada com jsPDF nas mesmas posições dos slides
function buildDeckPdf(meta,cfg){
  const {plan}=deckPlan(meta,cfg);
  const dark=cfg.theme!=='light', mode=dark?'dark':'light', BP=deckPalette(dark), P=BP.P, br=BP.br;
  const rgb=h=>{ h=String(h).replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
  const pf=S.profile||{}, who=profileName(), W=13.333, H=7.5, M=0.6;
  const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'in',format:[W,H]});
  const fill=h=>doc.setFillColor(...rgb(h));
  const lh=s=>s/72*1.2;
  // caixa de texto: quebra linhas, corta com "..." se não couber e alinha na vertical
  const T=(text,x,y,w,h,o={})=>{
    doc.setFont('helvetica',o.bold?'bold':'normal'); doc.setFontSize(o.size||14); doc.setTextColor(...rgb(o.color||P.text));
    let lines=doc.splitTextToSize(pdfTxt(text),w); const max=Math.max(1,Math.floor((h+0.01)/lh(o.size||14)));
    if (lines.length>max){ lines=lines.slice(0,max); lines[max-1]=lines[max-1].replace(/\s*\S*$/,'')+'...'; }
    const th=lines.length*lh(o.size||14), ty=o.valign==='bottom'?y+h-th:o.valign==='middle'?y+(h-th)/2:y;
    lines.forEach((l,i)=>doc.text(l,o.align==='center'?x+w/2:o.align==='right'?x+w:x,ty+i*lh(o.size||14)+(o.size||14)/72*0.92,{align:o.align||'left'}));
  };
  const card=(x,y,w,h)=>{ fill(P.card); doc.roundedRect(x,y,w,h,0.12,0.12,'F'); };
  const bg=c=>{ fill(c); doc.rect(0,0,W,H,'F'); };
  const bars=()=>{ [1.5,2.5,1.9,3.2,4.1].forEach((h,i)=>{ fill(PIE_COLORS.dark[i]); doc.roundedRect(9.0+i*0.82,6.75-h,0.56,h,0.08,0.08,'F'); }); };
  const titleSize=t=>t.length>70?24:t.length>45?28:32;
  const dateTxt=new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
  const footer=[br.name,cfg.title||meta.name].filter(Boolean).join(' · ');
  const plate=()=>{ if(!br.logo) return 0.6; const lf=logoFit(br,2.6,0.55); fill('FFFFFF'); doc.roundedRect(M,0.45,lf.w+0.3,lf.h+0.3,0.08,0.08,'F');
    try{ doc.addImage(br.logo,'PNG',M+0.15,0.6,lf.w,lf.h); }catch(e){ console.warn(e); } return 0.45+lf.h+0.3+0.2; };
  let n=0, first=true, page=0;
  for (const s of plan){
    if (!first) doc.addPage([W,H],'landscape'); first=false; page++;
    if (s.kind==='cover'){
      bg('0F0F0F');
      const ky=plate(), tyy=Math.max(1.6,ky+0.5);
      T((br.name||'Apresentação de resultados').toUpperCase(),M,ky,8,0.4,{size:12,bold:true,color:'8A8D96'});
      T(s.title,M,tyy,7.6,4.1-tyy,{size:s.title.length>60?32:s.title.length>32?38:46,bold:true,color:'FFFFFF',valign:'bottom'});
      if (s.sub) T(s.sub,M,4.25,7.6,0.9,{size:20,color:'C9CBD2'});
      const info=[cfg.client?`Preparado para ${cfg.client}`:null,`Dados: ${periodText(meta,cfg)}`,[who,pf.role].filter(Boolean).join(' · ')+` · ${dateTxt}`].filter(Boolean);
      info.forEach((t,i)=>T(t,M,6.75-(info.length-i)*0.32,7.6,0.32,{size:14,bold:i===0&&!!cfg.client,color:i===0&&cfg.client?'FFFFFF':'C9CBD2'}));
      bars(); continue;
    }
    if (s.kind==='end'){
      bg('0F0F0F'); plate();
      T('Obrigado',M,2.0,7.6,1.4,{size:54,bold:true,color:'FFFFFF',valign:'bottom'});
      T('Dúvidas e próximos passos: vamos conversar.',M,3.5,7.6,0.6,{size:20,color:'C9CBD2'});
      const info=[who,pf.role,pf.company].filter(Boolean);
      info.forEach((t,i)=>T(t,M,6.6-(info.length-i)*0.32,7.6,0.32,{size:14,bold:i===0,color:i===0?'FFFFFF':'C9CBD2'}));
      bars(); continue;
    }
    n++; bg(P.bg);
    // cabeçalho
    fill(P.accent); doc.circle(M+0.25,0.87,0.25,'F');
    T(String(n).padStart(2,'0'),M,0.62,0.5,0.5,{size:13,bold:true,color:P.onAccent,align:'center',valign:'middle'});
    T(s.title,M+0.75,0.5,W-2*M-0.75,0.75,{size:titleSize(s.title),bold:true,valign:'middle'});
    if (s.sub) T(s.sub,M+0.75,1.22,W-2*M-0.75,0.4,{size:14,color:P.t3});
    // rodapé
    T(footer,M,H-0.5,8,0.3,{size:10,color:P.t3});
    T(String(page),W-M-0.8,H-0.5,0.8,0.3,{size:10,color:P.t3,align:'right'});
    if (s.kind==='kpis'){
      const k=s.kp, cols=k.length<=3?k.length:3, rowsN=Math.ceil(k.length/cols), gap=0.3;
      const cw=(W-2*M-gap*(cols-1))/cols, top=2.0, avail=H-0.9-top, ch=Math.min(2.3,(avail-gap*(rowsN-1))/rowsN), cs=PIE_COLORS[mode];
      k.forEach((x,i)=>{
        const cx=M+(i%cols)*(cw+gap), cy=top+Math.floor(i/cols)*(ch+gap);
        card(cx,cy,cw,ch); fill(cs[i%cs.length]); doc.circle(cx+0.43,cy+0.46,0.08,'F');
        T(x.lb,cx+0.62,cy+0.25,cw-0.95,0.42,{size:14,color:P.t2,valign:'middle'});
        T(x.vl,cx+0.35,cy+0.75,cw-0.7,0.85,{size:String(x.vl).length>18?20:x.small||String(x.vl).length>12?26:36,bold:true,valign:'middle'});
        if (x.sm) T(x.sm,cx+0.35,cy+ch-0.6,cw-0.7,0.4,{size:12,color:P.t3});
      });
      continue;
    }
    const res=s.res, spec=s.spec, cx=M, cy=1.85, cw=8.4, chH=H-0.95-cy, px=cx+cw+0.35, pw=W-M-px;
    if (!res||!res.labels.length){ card(cx,cy,cw,chH); T('Sem dados para este gráfico no período escolhido.',cx,cy,cw,chH,{size:16,color:P.t3,align:'center',valign:'middle'}); }
    else {
      const img=chartImage(spec,res,'',{w:Math.round(cw*84),h:Math.round(chH*84),mode,bg:'#'+P.bg,grid:'#'+P.line,t2:'#'+P.t2,border:'#'+P.line,val:'#'+P.t2,font:14});
      doc.addImage(img,'JPEG',cx,cy,cw,chH);
    }
    card(px,cy,pw,chH);
    T('O que os dados mostram',px+0.3,cy+0.28,pw-0.6,0.4,{size:14,bold:true,color:P.hl});
    const hl=chartHighlight(spec,res); let ty=cy+0.8;
    if (hl){
      T(hl.lb.toUpperCase(),px+0.3,ty,pw-0.6,0.3,{size:10,bold:true,color:P.t3});
      T(hl.name.length>24?hl.name.slice(0,23)+'…':hl.name,px+0.3,ty+0.3,pw-0.6,0.45,{size:18,bold:true});
      T(hl.vl,px+0.3,ty+0.8,pw-0.6,0.4,{size:14,color:P.t2});
      ty+=1.45;
    }
    T(s.short,px+0.3,ty,pw-0.6,cy+chH-ty-0.25,{size:14,color:P.t2});
  }
  return {doc,fileName:`${(cfg.title||meta.name).replace(/[\\/:*?"<>|]/g,'_')} - apresentacao.pdf`};
}
function saveDeckCfg(meta,cfg){
  if (S.readOnly) return;
  const m=structuredClone(meta); m.deck=structuredClone(cfg);
  if (JSON.stringify(m.deck)===JSON.stringify(meta.deck)) return;
  m.columns=m.columns.filter(c=>!c.virtual); const i=S.bases.findIndex(b=>b.id===m.id); if(i>=0) S.bases[i]=structuredClone(m);
  saveMeta(m).catch(handleWriteError);
}
async function downloadDeckPdf(meta,cfg,btn){
  if (!pdfReady()) return;
  if (btn){ btn.disabled=true; btn.dataset.t=btn.textContent; btn.textContent='Gerando PDF…'; }
  await new Promise(r=>setTimeout(r,30));
  try{ const {doc,fileName}=buildDeckPdf(meta,cfg); await savePdf(doc,fileName); saveDeckCfg(meta,cfg); }
  catch(e){ console.error(e); toast('Não foi possível gerar o PDF.',true); }
  finally{ if(btn){ btn.disabled=false; btn.textContent=''; btn.append(icon('pdf'),btn.dataset.t); } }
}
function miniChart(s,mode){
  const box=el('div',{class:'mini-chart'}), res=s.res;
  if (!res||!res.labels.length){ box.append(el('span',{class:'mini-empty',text:'sem dados'})); return box; }
  const cols=colorsFor(res.labels,mode);
  if (s.spec.type==='pie'){
    const pos=res.values.map(v=>Math.max(0,v)), tot=pos.reduce((a,b)=>a+b,0)||1; let acc=0;
    const stops=pos.map((v,i)=>{ const a=acc/tot*360; acc+=v; return `${cols[i]} ${a}deg ${acc/tot*360}deg`; });
    box.append(el('div',{class:'mini-pie',style:`background:conic-gradient(${stops.join(',')})`}));
  } else if (s.spec.type==='line'){
    const v=res.values, mn=Math.min(...v), mx=Math.max(...v), rg=mx-mn||1;
    const pts=v.map((y,i)=>`${(i/(v.length-1||1)*100).toFixed(2)},${(36-(y-mn)/rg*32).toFixed(2)}`).join(' ');
    box.innerHTML=`<svg viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${ACCENT[mode]}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  } else {
    const v=res.values.slice(0,14), mx=Math.max(...v.map(Math.abs))||1, h=s.spec.type==='hbar';
    box.append(el('div',{class:'mini-bars'+(h?' h':'')},v.map((x,i)=>el('i',{style:`${h?'width':'height'}:${Math.max(5,Math.abs(x)/mx*100)}%;background:${cols[i]}`}))));
  }
  return box;
}
function renderDeck(view,meta){
  const cfg=deckCfg(meta), charts=meta.charts||[];
  view.append(helpBar('apresentacao')); autoTour('apresentacao');
  const prevBox=el('div',{class:'deck-slides'}), countEl=el('span',{class:'deck-count'});
  function drawPreview(){
    const {plan,rows}=deckPlan(meta,cfg), dark=cfg.theme!=='light', mode=dark?'dark':'light';
    countEl.textContent=`${plan.length} slides · ${nf.format(rows.length)} registros`;
    prevBox.innerHTML=''; let n=0;
    plan.forEach((s,i)=>{
      let inner;
      if (s.kind==='cover') inner=[el('div',{class:'ms-kick',text:(S.profile?.company||'Apresentação de resultados')}),el('div',{class:'ms-cover-t',text:s.title}),cfg.client?el('div',{class:'ms-small',text:`Preparado para ${cfg.client}`}):null,el('div',{class:'ms-deco'},PIE_COLORS.dark.slice(0,5).map((c,j)=>el('i',{style:`background:${c};height:${[30,50,38,64,82][j]}%`})))];
      else if (s.kind==='end') inner=[el('div',{class:'ms-cover-t',text:'Obrigado'}),el('div',{class:'ms-small',text:profileName()}),el('div',{class:'ms-deco'},PIE_COLORS.dark.slice(0,5).map((c,j)=>el('i',{style:`background:${c};height:${[30,50,38,64,82][j]}%`})))];
      else {
        n++;
        const hd=el('div',{class:'ms-head'},el('span',{class:'ms-num',text:String(n).padStart(2,'0')}),el('span',{class:'ms-t',text:s.title}));
        if (s.kind==='kpis') inner=[hd,el('div',{class:'ms-kpis'},s.kp.map(k=>el('div',{class:'ms-kpi'},el('small',{text:k.lb}),el('b',{text:k.vl}))))];
        else inner=[hd,el('div',{class:'ms-body'},miniChart(s,mode),el('div',{class:'ms-side'},el('i'),el('i'),el('i',{style:'width:60%'})))];
      }
      prevBox.append(el('figure',{class:'ms-wrap'},el('div',{class:`ms ${s.kind==='cover'||s.kind==='end'?'ms-dark':(dark?'ms-dark':'ms-light')}`},inner),el('figcaption',{text:`${i+1}. ${{cover:'Capa',kpis:'Visão geral',chart:s.title,end:'Encerramento'}[s.kind]}`})));
    });
  }
  const upd=fn=>e=>{ fn(e); drawPreview(); };
  // campos
  const title=el('input',{value:cfg.title,maxlength:90}); title.oninput=upd(()=>cfg.title=title.value);
  const sub=el('input',{value:cfg.subtitle,maxlength:120,placeholder:'Ex.: Resultados do 3º trimestre'}); sub.oninput=upd(()=>cfg.subtitle=sub.value);
  const client=el('input',{value:cfg.client,maxlength:80,placeholder:'Nome do cliente (opcional)'}); client.oninput=upd(()=>cfg.client=client.value);
  const dcol=meta.columns.find(c=>c.type==='date');
  const per=el('select',{disabled:!dcol},PERIODS.map(([v,t])=>el('option',{value:v,text:t}))); per.value=dcol?cfg.period:'all'; per.onchange=upd(()=>cfg.period=per.value);
  const cats=meta.columns.map((c,j)=>({c,j})).filter(({c,j})=>c.type==='text'&&distinctCount(S.rows,j,200)<=200);
  const fCol=el('select',{},el('option',{value:'',text:'Nenhum'}),cats.map(({c})=>el('option',{value:c.name,text:c.name})));
  const fVal=el('select',{});
  const fillVals=()=>{ fVal.innerHTML=''; fVal.disabled=!fCol.value; if(!fCol.value) return; const j=meta.columns.findIndex(c=>c.name===fCol.value);
    [...new Set(S.rows.map(x=>String(x[j]??'(vazio)')))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).forEach(v=>fVal.append(el('option',{value:v,text:v}))); };
  fCol.value=cfg.filter?.col||''; fillVals(); if(cfg.filter) fVal.value=cfg.filter.val;
  const setF=()=>{ cfg.filter=fCol.value?{col:fCol.value,val:fVal.value}:null; };
  fCol.onchange=upd(()=>{ fillVals(); setF(); }); fVal.onchange=upd(setF);
  const kCk=el('input',{type:'checkbox'}); kCk.checked=cfg.kpis; kCk.onchange=upd(()=>cfg.kpis=kCk.checked);
  const cks=charts.map(c=>{ const L=chartLabels(c,null), ck=el('input',{type:'checkbox'}); ck.checked=cfg.charts.includes(c.id);
    ck.onchange=upd(()=>{ cfg.charts=charts.filter(x=>x.id===c.id?ck.checked:cfg.charts.includes(x.id)).map(x=>x.id); });
    return el('label',{class:'ck-row'},ck,el('span',{},el('b',{text:L.title}),el('small',{text:L.sub}))); });
  const seg=el('div',{class:'seg',role:'radiogroup','aria-label':'Tema'});
  const drawSeg=()=>{ seg.innerHTML=''; [['dark','Escuro'],['light','Claro']].forEach(([v,t])=>seg.append(el('button',{type:'button',class:cfg.theme===v?'on':'',role:'radio','aria-checked':cfg.theme===v?'true':'false',onclick:upd(()=>{ cfg.theme=v; drawSeg(); })},t))); };
  drawSeg();
  const notes=el('input',{type:'checkbox'}); notes.checked=cfg.notes; notes.onchange=upd(()=>cfg.notes=notes.checked);
  const okSel=()=>{ if(!cfg.kpis&&!cfg.charts.length){ toast('Escolha os indicadores ou pelo menos um gráfico.',true); return false; } return true; };
  const pptBtn=el('button',{class:'btn primary',onclick:()=>{ if(okSel()) downloadDeck(meta,cfg,pptBtn); }},icon('slides'),'PowerPoint (.pptx)');
  const pdfBtn=el('button',{class:'btn',onclick:()=>{ if(okSel()) downloadDeckPdf(meta,cfg,pdfBtn); }},icon('pdf'),'PDF');
  const genBtn=el('div',{class:'deck-go'},el('div',{class:'rd-title',text:'Baixar apresentação'}),el('div',{class:'deck-btns'},pptBtn,pdfBtn));
  const form=el('div',{class:'deck-form'},
    el('h2',{class:'rep-h',text:'Apresentação para clientes'}),
    el('p',{class:'rep-lead',text:'Monte os slides com os dados desta base e baixe em PowerPoint (gráficos editáveis) ou em PDF.'}),
    el('label',{class:'field'},'Título',title),
    el('label',{class:'field'},'Subtítulo',sub),
    el('label',{class:'field'},'Preparado para',client),
    el('div',{class:'rd-side'},el('div',{class:'rd-title',text:'Dados considerados'}),
      el('label',{class:'field'},dcol?`Período (${dcol.name})`:'Período (a base não tem coluna de data)',per),
      el('div',{class:'rd-row',style:'margin-top:8px'},el('label',{class:'field'},'Filtrar por',fCol),el('label',{class:'field'},'Valor',fVal))),
    el('div',{class:'rd-side'},el('div',{class:'rd-title',text:'Slides'}),
      el('label',{class:'ck-row'},kCk,el('span',{},el('b',{text:'Visão geral'}),el('small',{text:'Indicadores principais em destaque'}))),
      charts.length?el('div',{class:'deck-cks'},cks):el('p',{class:'send-note',text:'Esta base ainda não tem gráficos. Crie na aba Gráficos.'})),
    el('div',{class:'rd-side'},el('div',{class:'rd-title',text:'Aparência'}),seg,
      el('label',{class:'rd-check'},notes,'Incluir a explicação completa nas anotações do apresentador')),
    genBtn);
  view.append(el('div',{class:'deck-wrap'},form,el('section',{class:'deck-prev','aria-label':'Prévia dos slides'},el('div',{class:'deck-prev-h'},el('b',{text:'Prévia dos slides'}),countEl),prevBox)));
  drawPreview();
}

export { buildDeck, buildDeckPdf, chartHighlight, deckCfg, deckPalette, deckPlan, downloadDeck, downloadDeckPdf, getPptx, miniChart, pptxLib, renderDeck, saveDeckCfg };
