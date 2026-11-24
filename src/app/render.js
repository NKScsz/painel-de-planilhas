import { baseAbbr, currentMeta, openBase, signIn } from './init.js';
import { boardView } from '../views/board.js';
import { driveView } from '../features/google-drive.js';
import { destroyCharts } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { $, el, nf } from '../core/utils.ts';
import { consultasView } from '../features/cnpj-cep.js';
import { startDemo } from '../features/sample-and-tour.js';
import { shareView } from '../features/share.js';
import { sqlView } from '../features/sql.js';
import { clearTvTimers, tvView } from '../features/tv-mode.js';
import { resetScroll } from '../import/upload.js';
import { renderViz } from '../views/charts-tab.js';
import { modelView } from '../views/data-model.js';
import { renderData } from '../views/data-tab.js';
import { renderDeck } from '../views/deck-tab.js';
import { homeView } from '../views/home.js';
import { emptyState, pageHead, profileView } from '../views/profile.js';
import { renderReports } from '../views/reports-tab.js';

/* ============ Render ============ */
// a animação de entrada só roda quando a tela muda (troca de página, base ou aba),
// não a cada atualização de gráfico ou filtro
let lastViewKey='';
function render(){
  renderMain();
  const key=`${S.mode}|${S.view}|${S.currentId}|${S.tab}|${S.loadingRows?1:0}`;
  const v=$('#main').firstElementChild&&$('#main').querySelector(':scope > .view, :scope > .login-wrap, :scope > .empty');
  if (v&&key!==lastViewKey) v.classList.add('enter');
  lastViewKey=key;
  if (typeof resetScroll==='function') resetScroll();
}
function renderMain(){
  renderSidebar();
  // não apaga o formulário do perfil enquanto a pessoa está digitando
  if (S.mode==='cloud'&&S.view==='perfil'&&(S.profileDirty||S.brandDirty)&&$('#main .profile-page')) return;
  const main=$('#main'); main.innerHTML='';
  destroyCharts();
  document.querySelector('.app').classList.toggle('no-aside',S.mode!=='cloud'&&S.mode!=='local');
  document.body.classList.toggle('tv-on',S.view==='tv');
  if (S.view!=='tv') clearTvTimers();
  if (S.mode==='share'){ main.append(S.view==='tv'&&!S.share.error&&!S.share.loading?tvView():shareView()); return; }
  if (S.mode==='login'){ main.append(loginScreen()); return; }
  if (S.mode==='setup'){ main.append(setupScreen()); return; }
  if (S.mode==='local') main.append(el('div',{class:'banner warn demo-banner'},el('span',{text:'Você não está conectado com sua conta, então os dados ficam só nesta aba e somem ao fechar. Entre com sua conta Google para salvar e acessar de qualquer lugar.'}),
    S.auth?el('button',{class:'btn sm primary',onclick:e=>signIn(e.currentTarget)},'Entrar com Google'):null));
  if (S.readOnly && S.mode==='cloud') main.append(el('div',{class:'banner'},'Seu acesso a esta página é somente leitura, então não é possível salvar bases. Peça ao dono da página para te convidar como Editor.'));
  if (S.mode==='loading' || (S.mode==='cloud' && !S.basesLoaded)){ main.append(el('div',{class:'empty'},el('div',{class:'empty-box'},el('span',{class:'spinner'}),el('p',{style:'margin-top:12px',text:'Carregando suas bases…'})))); return; }
  if (S.view==='perfil'){ main.append(profileView()); return; }
  if (S.view==='home'){ main.append(homeView()); return; }
  if (S.view==='modelo'){ main.append(modelView()); return; }
  if (S.view==='tv'){ main.append(tvView()); return; }
  if (S.view==='consultas'){ main.append(consultasView()); return; }
  if (S.view==='painel'){ main.append(boardView()); return; }
  if (S.view==='drive'){ main.append(driveView()); return; }
  if (S.view==='sql'){ main.append(sqlView()); return; }
  const meta=currentMeta();
  if (!meta){ main.append(emptyState()); return; }
  main.append(pageHead(meta));
  const tabs=el('div',{class:'tabs'},
    el('button',{class:'tab'+(S.tab==='dados'?' active':''),onclick:()=>{S.tab='dados';history.replaceState(null,'','#dados');render();}},icon('table'),'Dados'),
    el('button',{class:'tab'+(S.tab==='graficos'?' active':''),onclick:()=>{S.tab='graficos';history.replaceState(null,'','#graficos');render();}},icon('chart'),'Gráficos'),
    el('button',{class:'tab'+(S.tab==='relatorios'?' active':''),onclick:()=>{S.tab='relatorios';history.replaceState(null,'','#relatorios');render();}},icon('send'),'Relatórios'),
    el('button',{class:'tab'+(S.tab==='apresentacao'?' active':''),onclick:()=>{S.tab='apresentacao';history.replaceState(null,'','#apresentacao');render();}},icon('slides'),'Apresentação'));
  main.append(tabs);
  const view=el('div',{class:'view'}); main.append(view);
  if (S.loadingRows || !S.rows){ view.append(el('div',{class:'muted'},el('span',{class:'spinner'}),'  Carregando dados…')); return; }
  if (S.tab==='dados') renderData(view,meta); else if (S.tab==='relatorios') renderReports(view,meta); else if (S.tab==='apresentacao') renderDeck(view,meta); else renderViz(view,meta);
}
/* Ícones de linha fina (traço 1.25, cantos arredondados), no estilo de painéis de dados */
const ICONS={
  pin:'<path d="M9.6 2.2 13.8 6.4l-1.6.6-2.5 2.5.2 3-1.4 1.4-2.6-2.6L3 14M5.9 7.4 3.8 9.5l2.7 2.7"/><path d="m5.9 7.4 3.1-2.6.6-2.6"/>',
  image:'<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><circle cx="5.8" cy="6.2" r="1.2"/><path d="m2.5 12 3.6-3.6 2.4 2.4 2-2 3 3"/>',
  board:'<rect x="2" y="2" width="5.2" height="6.4" rx="1"/><rect x="8.8" y="2" width="5.2" height="3.6" rx="1"/><rect x="8.8" y="7.2" width="5.2" height="6.8" rx="1"/><rect x="2" y="10" width="5.2" height="4" rx="1"/>',
  sun:'<circle cx="8" cy="8" r="2.8"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>',
  moon:'<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>',
  monitor:'<rect x="1.8" y="2.5" width="12.4" height="8.6" rx="1.4"/><path d="M5.6 13.6h4.8M8 11.1v2.5"/>',
  table:'<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.2h12M2 9.8h12M6 6.2v7.3"/>',
  sheet:'<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5M6 8h4.5M6 10.8h4.5M8.2 8v5"/>',
  chart:'<path d="M2.5 13.5h11M4.5 11V8.2M8 11V4.2M11.5 11V6.5"/>',
  bar:'<path d="M2.5 13.5h11M4.5 11V8.2M8 11V4.2M11.5 11V6.5"/>',
  hbar:'<path d="M2.5 2.5v11M2.5 4.5h6.5M2.5 8h10M2.5 11.5h4.5"/>',
  line:'<path d="M2.5 13.5h11M2.5 10.5 6 7l2.5 2.2L13.5 4"/>',
  pie:'<path d="M7 3.1A5 5 0 1 0 12.9 9H7z"/><path d="M9.2 1.8v5h5a5 5 0 0 0-5-5z"/>',
  stacked:'<path d="M2.5 13.5h11"/><rect x="3.3" y="7" width="2.6" height="4.5" rx=".5"/><rect x="6.7" y="3" width="2.6" height="8.5" rx=".5"/><rect x="10.1" y="5.5" width="2.6" height="6" rx=".5"/><path d="M3.3 9.2h2.6M6.7 7h2.6M10.1 8.5h2.6"/>',
  funnel:'<path d="M2 3h12M3.8 6.5h8.4M5.6 10h4.8M7 13.5h2"/>',
  map:'<path d="M2 4 6 2.5l4 1.5 4-1.5v9.5l-4 1.5-4-1.5L2 13.5z"/><path d="M6 2.5V12M10 4v9.5"/>',
  pivot:'<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12M5.8 2.5v11M2 9.7h12M9.9 6v7.5"/>',
  tv:'<rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5"/><path d="M5.5 13.5h5M8 11v2.5"/>',
  slides:'<rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5"/><path d="M8 11v2.5M5.5 13.5h5M5 8.5V7M8 8.5V5.5M11 8.5V6.5"/>',
  send:'<path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5z"/>',
  share:'<circle cx="4.2" cy="8" r="1.8"/><circle cx="11.8" cy="3.8" r="1.8"/><circle cx="11.8" cy="12.2" r="1.8"/><path d="m5.8 7.1 4.4-2.4M5.8 8.9l4.4 2.4"/>',
  mail:'<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="m2.5 4.5 5.5 4.5 5.5-4.5"/>',
  chat:'<path d="M2.5 13.5 3.4 11A5.5 5.5 0 1 1 5.6 12.8z"/>',
  clock:'<circle cx="8" cy="8" r="5.8"/><path d="M8 5v3.2l2.1 1.3"/>',
  history:'<path d="M2.5 2.8v3h3"/><path d="M2.9 5.8A5.6 5.6 0 1 1 2.5 9"/><path d="M8 5v3.2l2.1 1.3"/>',
  model:'<rect x="1.5" y="2" width="5" height="4" rx="1"/><rect x="9.5" y="10" width="5" height="4" rx="1"/><rect x="9.5" y="2" width="5" height="4" rx="1"/><path d="M6.5 4h3M12 6v4"/>',
  database:'<ellipse cx="8" cy="3.5" rx="5.5" ry="2"/><path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/>',
  upload:'<path d="M8 10.5V2.5M4.8 5.7 8 2.5l3.2 3.2M2.5 10.5v2c0 .6.4 1 1 1h9c.6 0 1-.4 1-1v-2"/>',
  pdf:'<path d="M8 2.5v8M4.8 7.3 8 10.5l3.2-3.2M2.5 10.5v2c0 .6.4 1 1 1h9c.6 0 1-.4 1-1v-2"/>',
  download:'<path d="M8 2.5v8M4.8 7.3 8 10.5l3.2-3.2M2.5 10.5v2c0 .6.4 1 1 1h9c.6 0 1-.4 1-1v-2"/>',
  user:'<circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 14c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3"/>',
  file:'<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5"/>',
  search:'<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4 13.8 13.8"/>',
  filter:'<path d="M2 3h12l-4.6 5.4v4.4l-2.8 1.4V8.4z"/>',
  plus:'<path d="M8 3v10M3 8h10"/>',
  more:'<circle cx="3.5" cy="8" r=".75"/><circle cx="8" cy="8" r=".75"/><circle cx="12.5" cy="8" r=".75"/>',
  refresh:'<path d="M13.2 2.8v3.2H10"/><path d="M12.9 6A5.4 5.4 0 1 0 13.4 9"/>',
  copy:'<rect x="5.5" y="5.5" width="8" height="8" rx="1.3"/><path d="M10.5 5.5V3.8c0-.7-.6-1.3-1.3-1.3H3.8c-.7 0-1.3.6-1.3 1.3v5.4c0 .7.6 1.3 1.3 1.3h1.7"/>',
  trash:'<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5"/>',
  edit:'<path d="M10.5 2.6 13.4 5.5 5.7 13.2l-3.2.3.3-3.2z"/><path d="M9.2 3.9l2.9 2.9"/>',
  close:'<path d="M4 4l8 8M12 4l-8 8"/>',
  expand:'<path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/>',
  shrink:'<path d="M13.5 6.5h-4v-4M9.5 6.5l4-4M2.5 9.5h4v4M6.5 9.5l-4 4"/>',
  swap:'<path d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13"/>',
  target:'<circle cx="8" cy="8" r="5.8"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r=".6"/>',
  help:'<circle cx="8" cy="8" r="5.8"/><path d="M6.3 6.3a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3v.3"/><path d="M8 11.3v.1"/>',
  info:'<circle cx="8" cy="8" r="5.8"/><path d="M8 7.3v3.7M8 5v.1"/>',
  clean:'<path d="M2.5 13.5 9.8 6.2M8.6 5 11 7.4"/><path d="M12.2 1.8v2.6M10.9 3.1h2.6M13.6 7.6v1.8M12.7 8.5h1.8M5.4 2.3v1.8M4.5 3.2h1.8"/>',
  columns:'<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M6 2.5v11M10 2.5v11"/>',
  formula:'<path d="M7.6 2.9c-1.2-.4-2.2.1-2.4 1.4l-1.3 7.6c-.2 1.2-1 1.7-2.2 1.4M2.8 6.6h4M9.2 7.2l4.3 5.3M13.5 7.2l-4.3 5.3"/>',
  tag:'<path d="M2.5 2.5h5.2l5.8 5.8-5.2 5.2-5.8-5.8z"/><circle cx="5.4" cy="5.4" r=".9"/>',
  building:'<rect x="2.5" y="2" width="7" height="12" rx="1"/><path d="M9.5 6h3c.6 0 1 .4 1 1v7h-4M4.8 5h2.4M4.8 8h2.4M4.8 11h2.4"/>',
  home:'<path d="M2.5 7.2 8 2.5l5.5 4.7M4 6v7.5h8V6"/>',
  folder:'<path d="M1.8 4.2c0-.6.5-1.1 1.1-1.1h3.2l1.5 1.6h5.5c.6 0 1.1.5 1.1 1.1v6.5c0 .6-.5 1.1-1.1 1.1H2.9c-.6 0-1.1-.5-1.1-1.1z"/>',
  drive:'<path d="M5.8 2.5h4.4l4.3 7.4-2.2 3.6H3.7L1.5 9.9z"/><path d="M5.8 2.5l4.4 7.4h4.3M10.2 2.5 5.9 9.9l-2.2 3.6M1.5 9.9h8.7"/>',
  sliders:'<path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7"/><circle cx="11" cy="4.5" r="1.6"/><circle cx="5" cy="11.5" r="1.6"/>',
  sparkle:'<path d="M8 2.2c.5 3 1.8 4.3 4.8 4.8-3 .5-4.3 1.8-4.8 4.8-.5-3-1.8-4.3-4.8-4.8 3-.5 4.3-1.8 4.8-4.8zM12.8 11v2.6M11.5 12.3h2.6"/>',
  calendar:'<rect x="2" y="3" width="12" height="10.8" rx="1.5"/><path d="M2 6.6h12M5.2 1.8v2.4M10.8 1.8v2.4"/>',
  fullscreen:'<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  layout:'<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M7 6.5v7"/>',
  'ty-text':'<path d="M1.8 12.2 4.6 4.2l2.8 8M2.8 9.6h3.6"/><path d="M9.6 4.2v8M9.6 9.7c0-1.5.9-2.4 2-2.4s2 .9 2 2.4-.9 2.5-2 2.5-2-1-2-2.5z"/>',
  'ty-number':'<path d="M6.3 2.5 5.2 13.5M10.8 2.5l-1.1 11M2.8 6h10.7M2.5 10h10.7"/>',
  'ty-date':'<rect x="2" y="3" width="12" height="10.8" rx="1.5"/><path d="M2 6.6h12M5.2 1.8v2.4M10.8 1.8v2.4"/>'
};
function icon(n,size=16){
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for (const [k,v] of [['viewBox','0 0 16 16'],['width',size],['height',size],['fill','none'],['stroke','currentColor'],['stroke-width','1.25'],['stroke-linecap','round'],['stroke-linejoin','round'],['aria-hidden','true'],['class','ico']]) s.setAttribute(k,String(v));
  s.innerHTML=ICONS[n]||''; return s;
}
// ícone do tipo da coluna no cabeçalho da tabela (Ab = texto, # = número, calendário = data)
function tyIcon(t){ const k=t==='number'||t==='date'?t:'text', s=icon('ty-'+k,14); s.setAttribute('class','ico ty-ic');
  const w=el('span',{class:'ty',title:{number:'Número',date:'Data',text:'Texto'}[k]}); w.append(s); return w; }
function renderSidebar(){
  $('#delAllBtn').disabled=S.readOnly||!S.bases.length;
  $('#profileNav').classList.toggle('active',S.view==='perfil'); $('#homeNav').classList.toggle('active',S.view==='home'); $('#driveNav').classList.toggle('active',S.view==='drive');
  $('#modelNav').classList.toggle('active',S.view==='modelo'); $('#boardNav').classList.toggle('active',S.view==='painel');
  $('#cqNav').classList.toggle('active',S.view==='consultas');
  $('#sqlNav').classList.toggle('active',S.view==='sql');
  const box=$('#bases'); box.innerHTML='';
  if (!S.bases.length){ box.append(el('div',{class:'muted',style:'padding:8px 10px;font-size:13px',text:S.basesLoaded?'Nenhuma planilha ainda. Toque em ＋ para enviar a primeira.':'Carregando…'})); return; }
  for (const b of S.bases){
    box.append(el('button',{class:'base-item'+(b.id===S.currentId&&S.view==='base'?' active':''),onclick:()=>openBase(b.id),title:b.name},
      el('div',{class:'ic'},icon('sheet'),el('span',{class:'ab',text:baseAbbr(b.name)})),
      el('div',{class:'txt'},el('div',{class:'nm',text:b.name,title:b.name}),el('div',{class:'sub',text:`${nf.format(b.rowCount||0)} linhas · ${b.columns?.length||0} colunas`}))));
  }
}
function googleLogo(){
  const s=document.createElementNS('http://www.w3.org/2000/svg','svg'); s.setAttribute('viewBox','0 0 48 48'); s.setAttribute('width','18'); s.setAttribute('height','18');
  s.innerHTML='<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>';
  return s;
}
/* Prévia do painel na entrada: mostra o que o produto entrega (indicador, gráfico explicado e meta com
   o traço de ritmo). Dados fictícios, avisados no próprio cartão. */
function loginPreview(){
  const vals=[14200,15100,13800,15900,16700,18420], meses=['mai','jun','jul','ago','set','out'];
  const W=480,H=150,L=8,R=8,T=12,B=26,lo=12000,hi=20000;
  const x=i=>L+i*(W-L-R)/(vals.length-1), y=v=>T+(1-(v-lo)/(hi-lo))*(H-T-B);
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const grid=[14000,16000,18000].map(g=>`<line x1="${L}" x2="${W-R}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}" style="stroke:var(--grid)" stroke-width="1"/>`).join('');
  const lbls=meses.map((m,i)=>`<text x="${x(i).toFixed(1)}" y="${H-6}" text-anchor="${i===0?'start':i===meses.length-1?'end':'middle'}">${m}</text>`).join('');
  const last=vals.length-1;
  const svg=`<svg class="pc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturamento de maio a outubro, subindo nos últimos três meses">${grid}`+
    `<polygon points="${x(0)},${H-B} ${pts} ${x(last)},${H-B}" style="fill:var(--accent)" fill-opacity=".08"/>`+
    `<polyline points="${pts}" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`+
    `<circle cx="${x(last)}" cy="${y(vals[last])}" r="4" style="fill:var(--accent);stroke:var(--surface)" stroke-width="2"/>${lbls}</svg>`;
  const chart=el('div'); chart.innerHTML=svg;
  const fill=el('i',{style:'width:92%'}), tick=el('u',{style:'left:73%',title:'Onde você deveria estar hoje'});
  return el('div',{class:'lp-prev','aria-label':'Exemplo do painel com dados fictícios'},
    el('div',{class:'ph'},el('b',{text:'Exemplo · Vendas'}),el('span',{text:'dados fictícios'})),
    el('div',{class:'pk'},el('div',{},el('small',{text:'Faturamento de outubro'}),el('div',{class:'v',text:'18.420,50'})),el('span',{class:'d',text:'+10,3% vs setembro'})),
    chart.firstChild,
    el('div',{class:'pn'},el('b',{text:'Sobre este gráfico'}),'O faturamento subiu três meses seguidos e outubro foi o maior mês do período.'),
    el('div',{class:'pg'},el('div',{class:'gt'},el('span',{},'Meta de outubro · ',el('b',{text:'20.000'})),el('span',{text:'92%'})),
      el('div',{class:'gb'},fill,tick),
      el('span',{class:'gs',text:'Acima do ritmo: faltam 1.579,50 para a meta'})));
}
function loginScreen(){
  const btn=el('button',{class:'google-btn',onclick:()=>signIn(btn)},googleLogo(),'Entrar com Google');
  const step=(n,t,d)=>el('li',{},el('span',{class:'n',text:n}),el('div',{},el('b',{text:t}),el('span',{text:d})));
  // dividido 7/5: chamada à esquerda, processo à direita (sem ícones soltos, sem números inventados)
  // página pública: apresenta só recursos que o produto tem de verdade (sem preços, números ou depoimentos inventados)
  const feat=(ic,t,d)=>{ const s=icon(ic); s.setAttribute('width','20'); s.setAttribute('height','20'); return el('div',{class:'lp-f'},el('span',{class:'lp-ic'},s),el('b',{text:t}),el('p',{text:d})); };
  const btn2=el('button',{class:'google-btn',onclick:()=>signIn(btn2)},googleLogo(),'Entrar com Google');
  const landing=el('div',{class:'landing'},
    el('section',{class:'lp-sec'},el('div',{class:'kicker',text:'Recursos'}),el('h2',{text:'Tudo o que você precisa para entender seus dados'}),
      el('div',{class:'lp-grid'},
        feat('upload','Qualquer arquivo','Excel, CSV, Google Sheets, extratos em PDF ou OFX, XML de notas fiscais e fotos de tabelas. Abas de meses viram uma base só.'),
        feat('table','Limpeza automática','Remove linhas de total, cabeçalhos repetidos e vazios, corrige tipos e padroniza nomes escritos de jeitos diferentes.'),
        feat('chart','Gráficos que fazem sentido','Reconhece vendas, financeiro, estoque, RH e marketing e monta os gráficos certos, cada um com explicação.'),
        feat('map','Mapa, funil e tabela dinâmica','Mapa do Brasil por estado, funil de etapas, barras empilhadas, linha com tendência e tabela dinâmica.'),
        feat('clock','Metas e alertas','Acompanhe metas e limites no ritmo do mês e receba alertas automáticos quando algo foge do padrão.'),
        feat('pdf','Relatórios e apresentações','PDF explicado, PowerPoint editável e envio pelo WhatsApp, com seu logo e sua cor.'),
        feat('tv','Modo TV ao vivo','Painel em tela cheia para a TV da empresa, que se atualiza sozinho quando os dados mudam.'),
        feat('send','Link para clientes','Compartilhe um painel somente leitura por link, sem o cliente precisar de conta.'),
        feat('pivot','Consulta SQL e fórmulas','Cruze todas as suas bases com SQL e crie colunas calculadas como lucro e margem.'),
        feat('model','CNPJ e CEP','Complete a base com dados públicos da Receita Federal e endereços, um por vez ou todos de uma vez.'))),
    el('section',{class:'lp-sec lp-cta'},el('h2',{text:'Comece com uma planilha que você já tem'}),el('p',{text:'Entre com sua conta Google e envie o primeiro arquivo. Se preferir, veja antes uma demonstração com dados fictícios, sem criar conta.'}),
      el('div',{class:'lp-btns'},btn2,el('button',{class:'btn lp-demo',onclick:startDemo},'Ver demonstração'))));
  return el('div',{class:'landing-wrap'},el('div',{class:'login-wrap'},
    el('section',{class:'login-main stagger'},
      el('div',{class:'kicker',text:'Painel de Planilhas'}),
      el('h1',{text:'Planilhas viram decisões'}),
      el('p',{class:'lead',text:'Envie planilhas, extratos e faturas em PDF. O painel limpa os dados, monta gráficos explicados, acompanha metas e gera relatórios e apresentações prontos para enviar.'}),
      el('div',{class:'lp-btns'},btn,el('button',{class:'btn lp-demo',onclick:startDemo},'Ver demonstração sem conta')),
      el('p',{class:'login-note',text:'Cada conta vê apenas as próprias bases. Usamos só seu nome, e-mail e foto do Google para identificar você.'})),
    el('section',{class:'login-side','aria-label':'Como funciona'},
      loginPreview(),
      el('div',{class:'kicker',text:'Como funciona'}),
      el('ol',{class:'steps stagger'},
        step('01','Envie um arquivo','Excel, CSV, extrato em PDF ou OFX, XML de nota fiscal ou a foto de uma tabela'),
        step('02','Veja os gráficos','Escolhidos de acordo com os seus dados, cada um com uma explicação curta'),
        step('03','Conecte e exporte','Cruze bases entre si e baixe o relatório em PDF com sua empresa')))),landing);
}
function setupScreen(){
  const code=t=>el('code',{text:t});
  return el('div',{class:'empty'},el('div',{class:'empty-box setup'},
    el('h1',{text:window.firebase?'Falta configurar o Firebase':'Não foi possível carregar o Firebase'}),
    el('p',{text:window.firebase?'O login com Google precisa de um projeto Firebase. Siga os passos e recarregue a página:':'Verifique sua conexão com a internet e recarregue a página.'}),
    window.firebase?el('ol',{},
      el('li',{},'Crie um projeto em ',el('b',{text:'console.firebase.google.com'}),'.'),
      el('li',{},'Em ',el('b',{text:'Authentication > Sign-in method'}),', ative o provedor ',el('b',{text:'Google'}),'.'),
      el('li',{},'Em ',el('b',{text:'Firestore Database'}),', crie o banco e publique as regras do arquivo ',code('firestore.rules'),'.'),
      el('li',{},'Em ',el('b',{text:'Configurações do projeto > Seus apps'}),', adicione um app Web e copie o objeto de configuração para ',code('FIREBASE_CONFIG'),' no início do script desta página.'),
      el('li',{},'Publique com ',code('firebase deploy'),' (ou teste com ',code('firebase serve'),' em localhost).')):null));
}

export { ICONS, googleLogo, icon, lastViewKey, loginPreview, loginScreen, render, renderMain, renderSidebar, setupScreen, tyIcon };
