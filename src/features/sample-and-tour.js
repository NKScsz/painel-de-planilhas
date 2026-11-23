import { openBase, openBaseTab, renderUser, setStatus } from '../app/init.js';
import { autoCharts } from '../charts/auto-charts.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase } from '../core/storage.js';
import { el, toast, uid8 } from '../core/utils.ts';
import { pad } from '../core/values.ts';
import { isoDay } from '../views/reports-tab.js';

/* ----- Primeira visita: base de exemplo (dados fictícios), tour guiado e demonstração sem conta ----- */
function sampleBase(){
  let s=20260601; const rnd=()=>(s=(s*16807)%2147483647)/2147483647, pick=a=>a[Math.floor(rnd()*a.length)];
  const vend=['Vendedor A','Vendedor B','Vendedor C','Vendedor D'], prods=[['Produto 1','Categoria X',39.9],['Produto 2','Categoria X',59.9],['Produto 3','Categoria Y',24.5],['Produto 4','Categoria Y',89],['Produto 5','Categoria Z',149],['Produto 6','Categoria Z',12.9]];
  const ufs=['SP','SP','SP','RJ','RJ','MG','MG','PR','RS','SC','BA','PE','DF','GO','CE'], pays=['Pix','Pix','Cartão','Cartão','Boleto'], today=new Date(), rows=[];
  for (let i=0;i<640;i++){ const d=new Date(today); d.setDate(d.getDate()-Math.floor(rnd()*240)); const [p,c,pr]=pick(prods), q=1+Math.floor(rnd()*4);
    rows.push([isoDay(d),`P-${String(10000+i)}`,`Cliente ${1+Math.floor(rnd()*120)}`,pick(vend),p,c,pick(ufs),q,Math.round(q*pr*(0.9+rnd()*0.2)*100)/100,pick(pays)]); }
  rows.sort((a,b)=>a[0]<b[0]?1:-1);
  const columns=[['Data','date'],['Pedido','text'],['Cliente','text'],['Vendedor','text'],['Produto','text'],['Categoria','text'],['UF','text'],['Quantidade','number'],['Valor total','number'],['Forma de pagamento','text']].map(([name,type])=>({name,type}));
  const byM={}; rows.forEach(r=>{ const m=r[0].slice(0,7); byM[m]=(byM[m]||0)+r[8]; }); const ms=Object.keys(byM).sort().slice(-4,-1), avg=ms.reduce((a,m)=>a+byM[m],0)/(ms.length||1);
  const meta={id:uid8(),name:'Exemplo · Vendas (dados fictícios)',fileName:'exemplo.xlsx',columns,createdAt:Date.now(),charts:autoCharts(columns,rows),sample:true,
    goals:[{id:uid8(),name:'Faturamento do mês',col:'Valor total',kind:'min',target:Math.round(avg*1.1/100)*100||1000,period:'month',filter:null,abs:false}]};
  return {meta,rows};
}
async function createSample(tour=true){
  const {meta,rows}=sampleBase(), t=toast('Criando a base de exemplo…',false,30000);
  try{ await saveBase(meta,rows); if(!S.bases.find(b=>b.id===meta.id)) S.bases.unshift(structuredClone(meta)); t.remove();
    S.tab='graficos'; history.replaceState(null,'','#graficos'); await openBase(meta.id); if(tour) setTimeout(()=>startTour(),700); }
  catch(e){ t.remove(); handleWriteError(e); }
}
/* Primeira entrada sem nenhuma planilha: cria a planilha de exemplo na conta, uma única vez.
   A marca "sampleSeeded" fica no documento da conta; quem já tem planilhas também recebe a marca,
   para o exemplo não reaparecer depois que a pessoa apagar tudo. */
let seedChecking=null;
async function seedSampleOnce(){
  if (S.mode!=='cloud'||!S.uid||S.readOnly||seedChecking===S.uid) return;
  const uid=S.uid; seedChecking=uid;
  try{
    const ref=S.db.doc(`data/users/${uid}/app`);
    const d=await ref.get({source:'server'});
    if (d.exists&&d.data().sampleSeeded) return;
    await ref.set({sampleSeeded:true},{merge:true});
    if (S.uid!==uid||S.bases.length) return; // já tem planilhas (ou trocou de conta): só marca
    await createSample(!localStorage.getItem('tourDone'));
    if (S.uid===uid) toast('Deixamos uma planilha de exemplo, com dados fictícios, para você ver o que o painel faz. Quando quiser, envie a sua ou exclua o exemplo.',false,9000);
  }catch(e){ console.error('exemplo inicial',e); seedChecking=null; }
}
// demonstração: modo local (nada é salvo), com a base de exemplo e o tour
async function startDemo(){
  S.mode='local'; S.me={name:'Visitante'}; S.basesLoaded=true; S.view='base'; S.readOnly=false; setStatus('warn','Demonstração: nada é salvo'); renderUser();
  await createSample(true);
}
const TOUR=[
  {sel:'.tabs',t:'As abas de cada planilha',d:'Dados (a tabela), Gráficos (números e gráficos explicados), Relatórios (PDF e WhatsApp) e Apresentação (slides).'},
  {sel:'.easy-sum',t:'Resumo em poucas palavras',d:'O principal da planilha contado em 2 ou 3 frases: quanto foi, quem mais pesou e o que precisa de atenção.'},
  {sel:'.qper',t:'Escolha o período',d:'Com um período escolhido, os números mostram quanto subiram ou caíram em relação ao período anterior.'},
  {sel:'[data-tour="ask"]',t:'Pergunte aos seus dados',d:'Toque numa pergunta e o gráfico certo aparece, com a resposta explicada. Se gostar, fixe no painel.'},
  {sel:'.goals',t:'Metas e alertas',d:'Defina metas ou limites. A barra mostra o progresso e o traço vertical, onde você deveria estar hoje.'},
  {sel:'.chart-card',t:'Gráficos explicados',d:'Embaixo de cada gráfico há uma explicação. Tocar numa barra filtra o painel por ela. O lápis muda o gráfico e a lixeira remove (dá para desfazer).'},
  {sel:'[data-tour="pdf"]',t:'Relatório em PDF',d:'Baixe o relatório com os gráficos explicados, as metas e a sua marca.'},
  {sel:'[data-tour="more"]',t:'Mais opções',d:'Modo TV para a TV da empresa, atualizar com uma planilha nova, baixar em Excel e excluir ficam aqui.'}];
function startTour(steps=TOUR){
  const list=steps.filter(s=>document.querySelector(s.sel)); if(!list.length) return;
  let i=0; const ov=el('div',{class:'tour'}), spot=el('div',{class:'tour-spot'}), card=el('div',{class:'tour-card',role:'dialog','aria-live':'polite'});
  ov.append(spot,card); document.body.append(ov);
  if (steps===TOUR) try{ localStorage.setItem('tour_graficos','1'); }catch(e){}
  const end=()=>{ ov.remove(); document.removeEventListener('keydown',key); window.removeEventListener('resize',place); try{ localStorage.setItem('tourDone','1'); }catch(e){} };
  const key=e=>{ if(e.key==='Escape') end(); if(e.key==='ArrowRight') next(); if(e.key==='ArrowLeft'&&i>0){ i--; show(); } };
  const next=()=>{ if(i<list.length-1){ i++; show(); } else end(); };
  function place(){ const t=document.querySelector(list[i].sel); if(!t) return; const r=t.getBoundingClientRect(), pad=6;
    Object.assign(spot.style,{left:`${r.left-pad}px`,top:`${r.top-pad}px`,width:`${Math.min(r.width,innerWidth-20)+pad*2}px`,height:`${Math.min(r.height,innerHeight*0.6)+pad*2}px`});
    const cw=Math.min(360,innerWidth-24), below=r.top+Math.min(r.height,innerHeight*0.6)+pad+12, top=below+190<innerHeight?below:Math.max(12,r.top-pad-12-card.offsetHeight);
    Object.assign(card.style,{width:`${cw}px`,left:`${Math.min(Math.max(12,r.left),innerWidth-cw-12)}px`,top:`${top}px`}); }
  function show(){ const s=list[i], t=document.querySelector(s.sel); if(!t){ next(); return; }
    t.scrollIntoView({block:'center',behavior:'instant'});
    card.innerHTML=''; card.append(el('div',{class:'tour-n',text:`${i+1} de ${list.length}`}),el('b',{text:s.t}),el('p',{text:s.d}),
      el('div',{class:'tour-btns'},el('button',{class:'btn sm',onclick:end},'Pular'),el('span',{class:'spacer'}),i?el('button',{class:'btn sm',onclick:()=>{ i--; show(); }},'Voltar'):null,el('button',{class:'btn sm primary',onclick:next},i<list.length-1?'Próximo':'Concluir')));
    requestAnimationFrame(place); }
  document.addEventListener('keydown',key); window.addEventListener('resize',place); ov.addEventListener('click',e=>{ if(e.target===ov) next(); });
  show();
}
function tourFromHome(){
  const b=S.bases[0]; if(!b){ createSample(true); return; }
  S.tab='graficos'; openBaseTab(b.id,'graficos').then(()=>setTimeout(()=>startTour(),600));
}

export { TOUR, createSample, sampleBase, seedChecking, seedSampleOnce, startDemo, startTour, tourFromHome };
