import { currentMeta } from '../app/init.js';
import { icon, render } from '../app/render.js';
import { MEAS_RX, PARTY_RX, distinctCount, isTimeCol } from '../charts/auto-charts.js';
import { aggregate, chartLabels, makeChart, pct1 } from '../charts/draw-and-pdf.js';
import { HTML_TYPES, htmlChart } from '../charts/extra-types.js';
import { S, charts } from '../core/state.js';
import { handleWriteError, loadRows, saveMeta } from '../core/storage.js';
import { el, fmtDate, fmtNum, nf, toast } from '../core/utils.ts';
import { CODE_RX } from '../core/values.ts';
import { brand, lum } from './brand.js';
import { compareRange } from './compare.js';
import { fld, formModal, inRange, rangeTxt } from './extras.js';
import { goalStatus } from './goals.js';
import { syncSheet } from './google-sheets.js';
import { enableShare, shareUrl } from './share.js';
import { colOf } from '../import/pdf-image.js';
import { vizData } from '../views/data-model.js';
import { computeKpis } from '../views/new-chart.js';
import { isoDay, periodRange } from '../views/reports-tab.js';

/* ----- Modo TV: painel em tela cheia que se atualiza sozinho -----
   Dentro do site (logado): acompanha a base pelo Firestore em tempo real.
   Pelo link (?v=TOKEN&tv=1): acompanha a cópia compartilhada em tempo real; se a base vem do
   Google Sheets, a própria TV relê a planilha a cada 2 minutos. Configuração em meta.tv. */
const TV_PER=[['today','Hoje'],['7d','Últimos 7 dias'],['30d','Últimos 30 dias'],['month','Este mês'],['year','Este ano'],['all','Todos os registros']];
const TV_EVERY=[[10,'10 segundos'],[20,'20 segundos'],[30,'30 segundos'],[60,'1 minuto']];
const tvCats=meta=>meta.columns.map((c,j)=>({c,j})).filter(({c,j})=>c.type==='text'&&!CODE_RX.test(c.name)&&!isTimeCol(S.rows||[],j)&&distinctCount(S.rows||[],j,300)>=2&&distinctCount(S.rows||[],j,300)<=300).map(o=>o.c);
const tvNums=meta=>meta.columns.filter(c=>c.type==='number'&&!CODE_RX.test(c.name)&&!/(pedido|n[uú]mero|c[oó]d|nota|matr[ií]cula|^ano$)/i.test(c.name));
function tvCfg(meta){
  const dcol=meta.columns.find(c=>c.type==='date'), cats=tvCats(meta), nums=tvNums(meta);
  const party=cats.find(c=>PARTY_RX.test(c.name))||cats[0], y=nums.find(c=>MEAS_RX.test(c.name))||nums[0];
  const cfg={period:dcol?'month':'all',row:party?.name||'',col:'',measure:y?.name||'',agg:'sum',charts:(meta.charts||[]).map(c=>c.id),every:20,...(meta.tv||{})};
  if (!dcol) cfg.period='all';
  return cfg;
}
function tvRange(p){ if(p==='today'){ const t=isoDay(new Date()); return {from:t,to:t}; } return periodRange(p); }
function tvRows(meta,rows,cfg){
  const dj=meta.columns.findIndex(c=>c.type==='date'), rg=dj>=0?tvRange(cfg.period):null;
  if (!rg) return {rows,prev:null,rg:null};
  const pr=compareRange(rg.from,rg.to);
  return {rows:inRange(rows,dj,rg),prev:pr?{rows:inRange(rows,dj,pr),range:pr}:null,rg};
}
// tabela dinâmica: linhas x colunas (opcional) com soma, média ou contagem; "Outros" junta o que passar do limite
function pivotData(meta,rows,cfg){
  const ix=n=>meta.columns.findIndex(c=>c.name===n);
  const rj=ix(cfg.row); if(rj<0) return null;
  const cj=cfg.col&&cfg.col!==cfg.row?ix(cfg.col):-1, yj=cfg.measure?ix(cfg.measure):-1, agg=yj<0?'count':(cfg.agg==='avg'?'avg':'sum');
  const lab=(v,j)=>v==null||v===''?'(vazio)':(meta.columns[j].type==='date'?fmtDate(v):String(v));
  const acc=()=>({s:0,n:0,c:0}), add=(a,v)=>{ a.c++; if(typeof v==='number'){ a.s+=v; a.n++; } }, mergeA=(a,b)=>{ a.s+=b.s; a.n+=b.n; a.c+=b.c; };
  const val=a=>!a?(agg==='avg'?null:0):agg==='count'?a.c:agg==='avg'?(a.n?a.s/a.n:null):a.s;
  let cols=[], colOf=()=>null;
  if (cj>=0){ const t=new Map(); for(const r of rows){ const k=lab(r[cj],cj); let a=t.get(k); if(!a){ a=acc(); t.set(k,a); } add(a,yj>=0?r[yj]:null); }
    const keys=[...t.entries()].sort((a,b)=>(val(b[1])??0)-(val(a[1])??0)).map(e=>e[0]);
    const shown=keys.length>6?keys.slice(0,5):keys; cols=keys.length>6?[...shown,'Outros']:shown; colOf=k=>shown.includes(k)?k:'Outros'; }
  const R=new Map(), tot={all:acc(),by:new Map()};
  for (const r of rows){
    const rk=lab(r[rj],rj); let o=R.get(rk); if(!o){ o={all:acc(),by:new Map()}; R.set(rk,o); }
    const v=yj>=0?r[yj]:null; add(o.all,v); add(tot.all,v);
    if (cj>=0){ const ck=colOf(lab(r[cj],cj)); for(const t of [o,tot]){ let a=t.by.get(ck); if(!a){ a=acc(); t.by.set(ck,a); } add(a,v); } }
  }
  let list=[...R.entries()].sort((a,b)=>(val(b[1].all)??0)-(val(a[1].all)??0));
  if (list.length>10){ const rest=list.slice(9), o={all:acc(),by:new Map()};
    for (const [,x] of rest){ mergeA(o.all,x.all); for(const [k,a] of x.by){ let b=o.by.get(k); if(!b){ b=acc(); o.by.set(k,b); } mergeA(b,a); } }
    list=[...list.slice(0,9),[`Outros (${rest.length})`,o]]; }
  const row=o=>({cells:cols.map(c=>val(o.by.get(c))),total:val(o.all)});
  return {agg,cols,rows:list.map(([k,o])=>({key:k,...row(o)})),total:row(tot),count:R.size,rowName:meta.columns[rj].name,colName:cj>=0?meta.columns[cj].name:'',measure:yj>=0?meta.columns[yj].name:''};
}
function pivotTable(p){
  if (!p) return el('div',{class:'tv-empty',text:'Escolha as colunas da tabela em “Modo TV” na base.'});
  if (!p.rows.length) return el('div',{class:'tv-empty',text:'Sem registros no período.'});
  const pctOk=p.agg!=='avg'&&p.total.total>0&&p.rows.every(r=>(r.total??0)>=0), max=Math.max(...p.rows.map(r=>Math.abs(r.total??0)),1);
  const f=v=>v==null?'—':fmtNum(v);
  return el('table',{class:'pivot'},
    el('thead',{},el('tr',{},el('th',{text:p.rowName}),p.cols.map(c=>el('th',{class:'num',text:c})),el('th',{class:'num',text:p.cols.length?'Total':(p.agg==='count'?'Registros':p.agg==='avg'?`Média de ${p.measure}`:p.measure)}),pctOk?el('th',{class:'num',text:'%'}):null)),
    el('tbody',{},p.rows.map((r,i)=>el('tr',{class:i===0&&!r.key.startsWith('Outros (')?'top':''},
      el('td',{class:'pk'},el('div',{class:'pkw'},el('span',{class:'rk',text:String(i+1)}),el('span',{text:r.key}))),
      r.cells.map(v=>el('td',{class:'num',text:f(v)})),
      el('td',{class:'num tot'},el('i',{class:'pbar',style:`width:${Math.round(Math.abs(r.total??0)/max*100)}%`}),el('b',{text:f(r.total)})),
      pctOk?el('td',{class:'num pc',text:pct1((r.total||0)/p.total.total*100)}):null))),
    el('tfoot',{},el('tr',{},el('td',{text:'Total'}),p.total.cells.map(v=>el('td',{class:'num',text:f(v)})),el('td',{class:'num',text:f(p.total.total)}),pctOk?el('td',{class:'num',text:'100%'}):null)));
}
 
function clearTvTimers(){ while(S.tvTimers.length) clearInterval(S.tvTimers.pop()); }
let wakeLock=null;
async function keepAwake(){ try{ if('wakeLock' in navigator&&document.visibilityState==='visible') wakeLock=await navigator.wakeLock.request('screen'); }catch(e){} }

function enterTv(meta){
  S.view='tv'; S.tvStamp=meta.updatedAt; S.tvAt=Date.now(); S.tvIdx=0;
  try{ if(!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{}); }catch(e){}
  keepAwake();
  while(S.tvLong.length) clearInterval(S.tvLong.pop());
  if (meta.source&&meta.source.type==='gsheet') S.tvLong.push(setInterval(()=>{ const m=currentMeta(); if(S.view==='tv'&&m) syncSheet(m,true); },120000));
  render();
}
function exitTv(){
  clearTvTimers(); while(S.tvLong.length) clearInterval(S.tvLong.pop());
  if (wakeLock){ wakeLock.release().catch(()=>{}); wakeLock=null; }
  if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  S.view='base'; render();
}
function tvView(){
  clearTvTimers();
  const share=S.mode==='share', meta=currentMeta();
  const v=el('div',{class:'tv'}), bc=brand();
  if (bc.custom&&lum(bc.color)<0.55) v.style.cssText=`--accent:${bc.color}`;
  if (!meta||!S.rows){ v.append(el('div',{class:'tv-empty'},el('span',{class:'spinner'}),'  Carregando…')); return v; }
  // dentro do site: quando a base muda (edição, upload, sincronização), recarrega as linhas
  if (!share&&meta.updatedAt!==S.tvStamp&&!S.tvLoading){ const stamp=meta.updatedAt; S.tvLoading=true;
    loadRows(meta).then(rows=>{ S.tvLoading=false; if(S.view!=='tv'||S.currentId!==meta.id) return; S.rows=rows; S.tvStamp=stamp; S.tvAt=Date.now(); render(); }).catch(e=>{ S.tvLoading=false; console.error(e); }); }
  const cfg=tvCfg(meta), br=brand(), {rows,prev,rg}=tvRows(meta,S.rows,cfg);
  const per=(TV_PER.find(p=>p[0]===cfg.period)||TV_PER[5])[1];
  // cabeçalho: marca, nome, período, "ao vivo" e relógio
  const clock=el('div',{class:'tv-clock'}), upd=el('span',{class:'tv-upd'});
  const tick=()=>{ clock.textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); const m=Math.floor((Date.now()-(S.tvAt||Date.now()))/60000); upd.textContent=m<1?'atualizado agora':m<60?`atualizado há ${m} min`:`atualizado às ${new Date(S.tvAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`; };
  tick(); S.tvTimers.push(setInterval(tick,15000));
  const fsBtn=el('button',{class:'tv-btn',title:'Tela cheia',onclick:()=>{ if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); else document.documentElement.requestFullscreen().catch(()=>{}); keepAwake(); }},icon('fullscreen'),'Tela cheia');
  v.append(el('div',{class:'tv-head'},
    br.logo?el('div',{class:'tv-logo'},el('img',{src:br.logo,alt:br.name||'Logo'})):null,
    el('div',{class:'tv-title'},el('h1',{text:meta.name}),el('div',{class:'tv-sub',text:[br.name,per+(rg&&cfg.period!=='today'?` (${rangeTxt(rg)})`:rg?` (${fmtDate(rg.from)})`:'')].filter(Boolean).join(' · ')})),
    el('div',{class:'tv-live'},el('span',{class:'tv-dot'}),el('b',{text:'Ao vivo'}),upd),
    clock,
    el('div',{class:'tv-ctrl'},fsBtn,share?null:el('button',{class:'tv-btn',onclick:exitTv},'Sair'))));
  // indicadores grandes
  const kp=computeKpis(meta,rows,prev).filter(x=>!x.small).slice(0,4);
  v.append(el('div',{class:'tv-kpis'},kp.map(x=>el('div',{class:'tv-kpi'},
    el('div',{class:'lb',text:x.lb.replace(' · soma','')}),el('div',{class:'vl',text:x.vl}),
    x.d?el('div',{class:'dl '+(x.d.good==null?'eq':x.d.good?'up':'down')},`${x.d.dir>0?'▲':x.d.dir<0?'▼':'■'} ${x.d.txt.replace(/^[+-]/,'')} vs período anterior`):el('div',{class:'dl eq',text:rg?'sem dados do período anterior':'todos os registros'})))));
  // tabela dinâmica + gráficos em rotação
  const p=pivotData(meta,rows,cfg);
  const pTitle=p?`${p.agg==='count'?'Registros':p.agg==='avg'?`Média de ${p.measure}`:p.measure} por ${p.rowName}${p.colName?` e ${p.colName}`:''}`:'Tabela dinâmica';
  const specs=(meta.charts||[]).filter(c=>(cfg.charts||[]).includes(c.id));
  const chartBox=el('div',{class:'tv-chart'}), cTitle=el('div',{class:'tv-card-t'}), cSub=el('div',{class:'tv-card-s'}), dots=el('div',{class:'tv-dots'});
  let live=null;
  const vd=vizData(meta,rows);
  const drawChart=()=>{
    if (live){ try{ live.destroy(); }catch(e){} const i=charts.indexOf(live); if(i>=0) charts.splice(i,1); live=null; }
    chartBox.innerHTML=''; dots.innerHTML='';
    if (!specs.length){ cTitle.textContent='Gráficos'; cSub.textContent=''; chartBox.append(el('div',{class:'tv-empty',text:'Nenhum gráfico escolhido para a TV.'})); return; }
    const k=(S.tvIdx||0)%specs.length, spec=specs[k], res=aggregate(vd.vmeta,spec,vd.rows), L=chartLabels(spec,res);
    cTitle.textContent=L.title; cSub.textContent=L.sub;
    specs.forEach((_,i)=>dots.append(el('i',{class:i===k?'on':''})));
    if (!res||!res.labels.length){ chartBox.append(el('div',{class:'tv-empty',text:'Sem dados para este gráfico no período.'})); return; }
    if (HTML_TYPES.has(spec.type)){ const h=htmlChart(spec,res,vd.vmeta); h.classList.add('tv-html'); chartBox.append(h); return; }
    const cv=el('canvas',{role:'img','aria-label':L.title}); chartBox.append(cv);
    // letras maiores para ler de longe
    requestAnimationFrame(()=>{ const fs=Chart.defaults.font.size; Chart.defaults.font.size=Math.round(Math.min(22,Math.max(13,innerWidth/110)));
      try{ live=makeChart(cv,spec,res,L.yLabel)||null; } finally{ Chart.defaults.font.size=fs; } });
  };
  v.append(el('div',{class:'tv-main'},
    el('div',{class:'tv-card'},el('div',{class:'tv-card-t',text:pTitle}),el('div',{class:'tv-card-s',text:p?`${nf.format(rows.length)} registros · ${p.count} ${p.count===1?'item':'itens'} em ${p.rowName}`:''}),el('div',{class:'tv-pivot'},pivotTable(p))),
    el('div',{class:'tv-card'},el('div',{class:'tv-card-h'},el('div',{},cTitle,cSub),dots),chartBox)));
  requestAnimationFrame(drawChart);
  if (specs.length>1) S.tvTimers.push(setInterval(()=>{ S.tvIdx=(S.tvIdx||0)+1; drawChart(); },Math.max(10,+cfg.every||20)*1000));
  // metas
  const gs=(meta.goals||[]).map(g=>({g,s:goalStatus(meta,g)})).filter(x=>x.s);
  if (gs.length) v.append(el('div',{class:'tv-goals'},gs.slice(0,4).map(({g,s})=>el('div',{class:'tv-goal '+s.st},
    el('div',{class:'tg-top'},el('b',{text:g.name}),el('span',{text:pct1(s.pct)})),
    el('div',{class:'g-bar'},el('i',{style:`width:${Math.min(100,Math.max(0,s.pct))}%`}),s.live?el('em',{style:`left:${(s.frac*100).toFixed(1)}%`}):null),
    el('div',{class:'tg-st',text:`${fmtNum(s.v)} de ${fmtNum(s.t)} · ${s.txt}`})))));
  return v;
}
// dentro do site: configurar e abrir o modo TV, ou gerar o link para a TV
function tvDialog(meta){
  const cfg=structuredClone(tvCfg(meta)), dcol=meta.columns.find(c=>c.type==='date'), cats=tvCats(meta), nums=tvNums(meta);
  const per=el('select',{disabled:!dcol},TV_PER.filter(([k])=>dcol||k==='all').map(([k,t])=>el('option',{value:k,text:t}))); per.value=cfg.period;
  const rowS=el('select',{},cats.map(c=>el('option',{value:c.name,text:c.name}))); rowS.value=cfg.row;
  const colS=el('select',{},el('option',{value:'',text:'Nenhuma'}),cats.filter(c=>distinctCount(S.rows,meta.columns.indexOf(c),40)<=30).map(c=>el('option',{value:c.name,text:c.name}))); colS.value=cfg.col||'';
  const meaS=el('select',{},el('option',{value:'',text:'Quantidade de registros'}),nums.map(c=>el('option',{value:c.name,text:c.name}))); meaS.value=cfg.measure;
  const aggS=el('select',{},el('option',{value:'sum',text:'Soma'}),el('option',{value:'avg',text:'Média'})); aggS.value=cfg.agg;
  const syncAgg=()=>{ aggS.disabled=!meaS.value; }; meaS.onchange=syncAgg; syncAgg();
  const every=el('select',{},TV_EVERY.map(([k,t])=>el('option',{value:String(k),text:t}))); every.value=String(cfg.every);
  const cks=(meta.charts||[]).map(c=>{ const ck=el('input',{type:'checkbox'}); ck.checked=cfg.charts.includes(c.id); return {c,ck,row:el('label',{class:'ck-row'},ck,el('span',{},el('b',{text:chartLabels(c,null).title})))}; });
  const prevBox=el('div',{class:'tv-prevtbl'});
  const read=()=>({period:per.value,row:rowS.value,col:colS.value===rowS.value?'':colS.value,measure:meaS.value,agg:aggS.value,every:+every.value,charts:cks.filter(x=>x.ck.checked).map(x=>x.c.id)});
  const drawPrev=()=>{ const c=read(); const {rows}=tvRows(meta,S.rows,c); prevBox.innerHTML=''; prevBox.append(pivotTable(pivotData(meta,rows,c))); };
  [per,rowS,colS,meaS,aggS].forEach(s=>s.addEventListener('change',drawPrev)); drawPrev();
  const save=()=>{ const c=read(); const m=structuredClone(currentMeta()); if(JSON.stringify(m.tv||null)===JSON.stringify(c)) return m;
    m.tv=c; m.columns=m.columns.filter(x=>!x.virtual); const i=S.bases.findIndex(b=>b.id===m.id); if(i>=0) S.bases[i]=structuredClone(m);
    if (!S.readOnly) saveMeta(m).catch(handleWriteError); return m; };
  const linkBox=el('div',{class:'tv-link'});
  const drawLink=()=>{ const m=currentMeta(); linkBox.innerHTML='';
    if (S.mode!=='cloud'){ linkBox.append(el('p',{class:'muted',text:'Entre com sua conta Google para gerar o link da TV.'})); return; }
    if (m.share&&m.share.token){ const url=shareUrl(m.share.token)+'&tv=1', inp=el('input',{value:url,readonly:true,onclick:e=>e.target.select()});
      linkBox.append(el('div',{class:'share-url'},inp,el('button',{class:'btn',onclick:async()=>{ save(); try{ await navigator.clipboard.writeText(url); toast('Link da TV copiado.'); }catch(e){ inp.select(); } }},'Copiar')),
        el('p',{class:'muted',style:'font-size:12px;margin:6px 0 0',text:'Usa o mesmo link de compartilhamento desta base: quem tiver o link vê os dados. Para cortar o acesso, desative em “Compartilhar”.'})); }
    else linkBox.append(el('button',{class:'btn',onclick:async e=>{ const b=e.currentTarget; b.disabled=true; b.textContent='Criando link…'; save();
      try{ await enableShare(); drawLink(); toast('Link da TV criado.'); }catch(err){ b.disabled=false; b.textContent='Criar link para a TV'; handleWriteError(err); } }},'Criar link para a TV'),
      el('p',{class:'muted',style:'font-size:12px;margin:6px 0 0',text:'Cria um link público somente leitura (o mesmo de “Compartilhar”). Quem tiver o link vê os dados desta base.'}));
  };
  drawLink();
  const content=el('div',{class:'tv-form'},
    el('div',{class:'tv-form-grid'},
      el('div',{},
        el('div',{class:'rd-title',text:'Dados mostrados'}),fld('Período',per),
        el('div',{class:'rd-title',style:'margin-top:14px',text:'Tabela dinâmica'}),
        el('div',{class:'form-row'},fld('Linhas',rowS),fld('Colunas (opcional)',colS)),
        el('div',{class:'form-row'},fld('Valor',meaS),fld('Cálculo',aggS)),
        el('div',{class:'rd-title',style:'margin-top:14px',text:'Gráficos em rotação'}),
        cks.length?el('div',{class:'deck-cks'},cks.map(x=>x.row)):el('p',{class:'muted',text:'Esta base ainda não tem gráficos.'}),
        fld('Trocar de gráfico a cada',every)),
      el('div',{},el('div',{class:'rd-title',text:'Prévia da tabela'}),prevBox,
        el('div',{class:'rd-title',style:'margin-top:16px',text:'Mostrar na TV da empresa'}),
        el('p',{class:'muted',style:'font-size:12.5px;margin:0 0 8px',text:'Abra este link no navegador da TV (ou num computador ligado a ela). Não precisa de login, fica em tela cheia e se atualiza sozinho quando os dados mudam.'}),linkBox)));
  const dlg=formModal('Modo TV','Um painel em tela cheia com os resultados gerais para a equipe acompanhar. Atualiza na hora quando os dados da base mudam.',content,'Abrir nesta tela',()=>{ save(); dlg.close(); enterTv(currentMeta()); return false; },'xwide tv-modal');
}

export { TV_EVERY, TV_PER, clearTvTimers, enterTv, exitTv, keepAwake, pivotData, pivotTable, tvCats, tvCfg, tvDialog, tvNums, tvRange, tvRows, tvView, wakeLock };
