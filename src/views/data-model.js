import { leaveProfile } from '../app/init.js';
import { confirmBox, modal } from '../app/modals.js';
import { icon, render } from '../app/render.js';
import { isTimeCol } from '../charts/auto-charts.js';
import { pct1 } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { handleWriteError, loadRows } from '../core/storage.js';
import { $, el, nf, toast, uid8 } from '../core/utils.ts';
import { CODE_RX, display } from '../core/values.ts';
import { vizRows } from './charts-tab.js';

/* ============ Modelo de dados (relações entre bases) ============
   Uma relação liga a coluna de uma base à coluna de outra (ex.: Vendas.CodProduto -> Produtos.Código).
   "from" é o lado "muitos" e "to" o lado "um" (valores únicos). Com relações *:1 ou 1:1, os gráficos
   da base "from" ganham as colunas da base "to" (ex.: "Produtos › Categoria"). */
let modelDragging=false;
const baseById=id=>S.bases.find(b=>b.id===id);
const normKey=v=>v==null||v===''?null:(typeof v==='number'?String(+v):String(v).trim().toLowerCase());
const CARD_TXT={'*:1':'Muitos para um (*:1)','1:1':'Um para um (1:1)','*:*':'Muitos para muitos (*:*)'};
async function getRows(id){
  if (id===S.currentId&&S.rows) return S.rows;
  const meta=baseById(id); if(!meta) return [];
  const c=S.rowCache[id]; if(c&&c.updatedAt===meta.updatedAt) return c.rows;
  const rows=await loadRows(meta); S.rowCache[id]={updatedAt:meta.updatedAt,rows}; return rows;
}
function colStats(rows,j){ const set=new Set(); let n=0; for(const r of rows){ const k=normKey(r[j]); if(k==null) continue; n++; set.add(k); } return {set,n,unique:n>0&&set.size===n}; }
async function analyzeRel(a,b){
  const ma=baseById(a.base), mb=baseById(b.base);
  const ja=ma.columns.findIndex(c=>c.name===a.col), jb=mb.columns.findIndex(c=>c.name===b.col);
  const [ra,rb]=await Promise.all([getRows(a.base),getRows(b.base)]);
  const sa=colStats(ra,ja), sb=colStats(rb,jb);
  let hit=0; for(const k of sa.set) if(sb.set.has(k)) hit++;
  let from=a,to=b,fs=sa,ts=sb;
  if (!sb.unique&&sa.unique){ from=b; to=a; fs=sb; ts=sa; } // o lado de valores únicos vira o "um"
  const card=fs.unique&&ts.unique?'1:1':ts.unique?'*:1':'*:*';
  return {from,to,card,hit,match:fs.set.size?hit/fs.set.size:0,fromDistinct:fs.set.size,toDistinct:ts.set.size,fromRows:fs.n};
}
const relValid=r=>{ const a=baseById(r.from.base), b=baseById(r.to.base); return !!(a&&b&&a.columns.some(c=>c.name===r.from.col)&&b.columns.some(c=>c.name===r.to.col)); };
// relações que deixam esta base "buscar" colunas da outra
function lookupRels(meta){
  const out=[];
  for (const r of S.model.relationships||[]){
    if (r.active===false||!relValid(r)) continue;
    let me,other;
    if (r.from.base===meta.id&&(r.card==='*:1'||r.card==='1:1')){ me=r.from; other=r.to; }
    else if (r.to.base===meta.id&&r.card==='1:1'){ me=r.to; other=r.from; }
    else continue;
    if (other.base===meta.id) continue;
    out.push({rel:r,me,other,om:baseById(other.base)});
  }
  return out;
}
async function ensureRelated(meta){ await Promise.all(lookupRels(meta).map(l=>getRows(l.other.base).catch(()=>[]))); }
// linhas da aba Gráficos + colunas "Base › Coluna" vindas das bases conectadas
function vizData(meta,baseRows){
  const rows=baseRows||vizRows(meta), ls=lookupRels(meta);
  if (!ls.length) return {vmeta:meta,rows};
  const cols=[...meta.columns], getters=[];
  for (const l of ls){
    const c=S.rowCache[l.other.base]; if(!c) continue;
    const kj=meta.columns.findIndex(x=>x.name===l.me.col), oj=l.om.columns.findIndex(x=>x.name===l.other.col);
    const map=new Map(); for (const r of c.rows){ const k=normKey(r[oj]); if(k!=null&&!map.has(k)) map.set(k,r); }
    l.om.columns.forEach((oc,ci)=>{
      if (ci===oj) return;
      const name=`${l.om.name} › ${oc.name}`; if(cols.some(x=>x.name===name)) return;
      cols.push({name,type:oc.type,virtual:true});
      getters.push(r=>{ const o=map.get(normKey(r[kj])); return o?(o[ci]??null):null; });
    });
  }
  if (!getters.length) return {vmeta:meta,rows};
  return {vmeta:{...meta,columns:cols},rows:rows.map(r=>[...r,...getters.map(g=>g(r))])};
}
async function saveModel(part){
  if (S.mode!=='cloud') return;
  try{ await S.db.doc(`data/users/${S.uid}/app`).set({model:part},{merge:true}); }catch(e){ handleWriteError(e); }
}
function openModel(){ if(S.view==='modelo') return; leaveProfile().then(ok=>{ if(!ok) return; S.view='modelo'; $('#aside').classList.remove('open'); render(); }); }
function relDescribe(res,ma,mb){
  const fromB=baseById(res.from.base), toB=baseById(res.to.base);
  const p=[];
  if (res.card==='*:1') p.push(`Cada linha de “${fromB.name}” encontra no máximo uma linha em “${toB.name}”. Nos gráficos de “${fromB.name}” você poderá usar as colunas de “${toB.name}” (ex.: “${toB.name} › ${toB.columns.find(c=>c.name!==res.to.col)?.name||'…'}”).`);
  else if (res.card==='1:1') p.push(`Cada valor aparece uma única vez nas duas bases. As duas poderão usar as colunas uma da outra nos gráficos.`);
  else p.push(`Os valores se repetem nas duas bases, então uma linha pode corresponder a várias. A relação fica registrada no modelo, mas não dá para trazer colunas de uma base para a outra nos gráficos.`);
  return p.join(' ');
}
// janela "Editar relação" (no estilo do Power BI): prévia das duas tabelas, escolha da coluna
// clicando no cabeçalho, cardinalidade, direção do filtro cruzado e relação ativa.
// Gravação normalizada: "from" é sempre o lado "muitos" e "to" o lado "um".
const CARD_OPTS=[['*:1','Muitos para um (*:1)'],['1:1','Um para um (1:1)'],['1:*','Um para muitos (1:*)'],['*:*','Muitos para muitos (*:*)']];
function relationDialog(a,b,existing){
  const bg=el('div',{class:'modal-bg'});
  const onKey=e=>{ if(e.key==='Escape') close(); };
  const close=()=>{ bg.remove(); document.removeEventListener('keydown',onKey); };
  bg.addEventListener('click',e=>{ if(e.target===bg) close(); });
  document.addEventListener('keydown',onKey);
  const st={A:{...a},B:{...b},card:existing?existing.card:null,cross:existing?(existing.cross||(existing.card==='1:1'?'both':'single')):null,
    active:existing?existing.active!==false:true,manualCard:!!existing,crossManual:!!existing};
  let an=null, seq=0;
  const box=el('div',{class:'an-box'});
  const okBtn=el('button',{class:'btn primary',disabled:true,onclick:()=>save()},'OK');
  function side(key,title){
    const bSel=el('select',{},S.bases.map(x=>el('option',{value:x.id,text:x.name})));
    const cSel=el('select',{});
    const prev=el('div',{class:'rd-prev'});
    const fillCols=()=>{ const m=baseById(st[key].base); cSel.innerHTML='';
      m.columns.forEach(c=>cSel.append(el('option',{value:c.name,text:c.name})));
      if (!m.columns.some(c=>c.name===st[key].col)) st[key].col=m.columns[0]?.name||'';
      cSel.value=st[key].col; };
    bSel.value=st[key].base;
    bSel.onchange=()=>{ st[key]={base:bSel.value,col:''}; fillCols(); st.manualCard=false; refresh(); };
    cSel.onchange=()=>{ st[key].col=cSel.value; st.manualCard=false; refresh(); };
    fillCols();
    async function drawPrev(){
      const m=baseById(st[key].base); let rows=[];
      try{ rows=(await getRows(m.id)).slice(0,5); }catch(e){}
      prev.innerHTML='';
      prev.append(el('table',{},
        el('thead',{},el('tr',{},m.columns.map(c=>el('th',{class:c.name===st[key].col?'sel':'',title:'Clique para usar esta coluna na relação',
          onclick:()=>{ st[key].col=c.name; cSel.value=c.name; st.manualCard=false; refresh(); }},c.name)))),
        el('tbody',{},rows.map(r=>el('tr',{},m.columns.map((c,j)=>el('td',{class:c.name===st[key].col?'sel':''},r[j]==null||r[j]===''?'—':display(r[j],c.type))))))));
      const th=prev.querySelector('th.sel'); if(th) prev.scrollLeft=Math.max(0,th.offsetLeft-prev.clientWidth/2+th.offsetWidth/2);
    }
    const wrap=el('div',{class:'rd-side'},el('div',{class:'rd-title',text:title}),
      el('div',{class:'rd-row'},el('label',{class:'field'},'Tabela',bSel),el('label',{class:'field'},'Coluna',cSel)),prev);
    return {wrap,drawPrev};
  }
  const SA=side('A','Tabela 1'), SB=side('B','Tabela 2');
  const cardSel=el('select',{},CARD_OPTS.map(([v,t])=>el('option',{value:v,text:t})));
  const crossSel=el('select',{},el('option',{value:'single',text:'Única'}),el('option',{value:'both',text:'Ambas'}));
  const activeCk=el('input',{type:'checkbox'}); activeCk.checked=st.active; activeCk.onchange=()=>{ st.active=activeCk.checked; };
  cardSel.onchange=()=>{ st.card=cardSel.value; st.manualCard=true; if(!st.crossManual){ st.cross=st.card==='1:1'?'both':'single'; crossSel.value=st.cross; } validate(); };
  crossSel.onchange=()=>{ st.cross=crossSel.value; st.crossManual=true; };
  async function analyze(){
    const ma=baseById(st.A.base), mb=baseById(st.B.base);
    const ja=ma.columns.findIndex(c=>c.name===st.A.col), jb=mb.columns.findIndex(c=>c.name===st.B.col);
    const [ra,rb]=await Promise.all([getRows(ma.id),getRows(mb.id)]);
    const sa=colStats(ra,ja), sb=colStats(rb,jb);
    let hit=0; for(const k of sa.set) if(sb.set.has(k)) hit++;
    return {sa,sb,hit,matchA:sa.set.size?hit/sa.set.size:0,matchB:sb.set.size?hit/sb.set.size:0};
  }
  const suggestCard=x=>x.sa.unique&&x.sb.unique?'1:1':x.sb.unique?'*:1':x.sa.unique?'1:*':'*:*';
  async function refresh(){
    SA.drawPrev(); SB.drawPrev();
    okBtn.disabled=true; an=null;
    if (st.A.base===st.B.base){ box.innerHTML=''; box.append(el('div',{class:'an-err',text:'Escolha duas tabelas diferentes.'})); return; }
    const my=++seq; box.innerHTML=''; box.append(el('span',{class:'spinner'}),' Analisando os dados…');
    let x; try{ x=await analyze(); }catch(e){ console.error(e); if(my===seq) box.textContent='Não foi possível carregar os dados destas tabelas.'; return; }
    if (my!==seq) return;
    an=x;
    if (!st.manualCard||!st.card) st.card=suggestCard(x);
    if (!st.crossManual) st.cross=st.card==='1:1'?'both':'single';
    cardSel.value=st.card; crossSel.value=st.cross;
    validate();
  }
  const cardExplain=(card,ma,mb)=>({
    '*:1':`Cada linha de “${ma.name}” corresponde a no máximo uma linha de “${mb.name}”. Os gráficos de “${ma.name}” poderão usar as colunas de “${mb.name}”.`,
    '1:*':`Cada linha de “${mb.name}” corresponde a no máximo uma linha de “${ma.name}”. Os gráficos de “${mb.name}” poderão usar as colunas de “${ma.name}”.`,
    '1:1':`Cada valor aparece uma única vez nas duas tabelas. As duas poderão usar as colunas uma da outra nos gráficos.`,
    '*:*':`Os valores se repetem dos dois lados: uma linha pode corresponder a várias. A relação fica registrada no modelo, mas não traz colunas de uma tabela para a outra.`})[card];
  function normalized(){
    let from=st.A,to=st.B,card=st.card,match=an?an.matchA:0;
    if (card==='1:*'){ from=st.B; to=st.A; card='*:1'; match=an?an.matchB:0; }
    return {from:{...from},to:{...to},card,match};
  }
  function validate(){
    if (!an) return;
    const ma=baseById(st.A.base), mb=baseById(st.B.base), errs=[];
    if ((st.card==='1:*'||st.card==='1:1')&&!an.sa.unique) errs.push(`A coluna “${st.A.col}” de “${ma.name}” tem valores repetidos, então não pode ficar no lado “1”.`);
    if ((st.card==='*:1'||st.card==='1:1')&&!an.sb.unique) errs.push(`A coluna “${st.B.col}” de “${mb.name}” tem valores repetidos, então não pode ficar no lado “1”.`);
    const n=normalized();
    const dup=(S.model.relationships||[]).some(r=>r.id!==existing?.id&&(
      (r.from.base===n.from.base&&r.from.col===n.from.col&&r.to.base===n.to.base&&r.to.col===n.to.col)||
      (r.from.base===n.to.base&&r.from.col===n.to.col&&r.to.base===n.from.base&&r.to.col===n.from.col)));
    box.innerHTML='';
    box.append(
      el('div',{class:'an-row'},el('span',{class:'an-t',text:'Correspondência: '}),`${nf.format(an.hit)} de ${nf.format(an.sa.set.size)} valores diferentes de “${st.A.col}” (${pct1(an.matchA*100)}) existem em “${mb.name}”.`),
      el('div',{class:'an-row'},el('span',{class:'an-t',text:'Valores únicos: '}),`“${st.A.col}”: ${an.sa.unique?'sim':'não'} · “${st.B.col}”: ${an.sb.unique?'sim':'não'}`),
      el('div',{class:'an-row',style:'margin-top:6px',text:cardExplain(st.card,ma,mb)}));
    errs.forEach(t=>box.append(el('div',{class:'an-err',text:t})));
    if (dup) box.append(el('div',{class:'an-err',text:'Já existe uma relação entre essas duas colunas.'}));
    if (!errs.length&&!dup){
      if (an.hit===0) box.append(el('div',{class:'an-err',text:'Nenhum valor em comum entre as duas colunas: confira se escolheu as colunas certas.'}));
      else if (an.matchA<.5) box.append(el('div',{class:'an-warn',text:'Menos da metade dos valores encontra par na outra tabela. A relação funciona, mas muitas linhas ficarão sem correspondência.'}));
    }
    okBtn.disabled=!!errs.length||dup||an.hit===0;
  }
  async function save(){
    if (!an||okBtn.disabled) return;
    const n=normalized();
    const rel={id:existing?.id||uid8(),from:n.from,to:n.to,card:n.card,cross:st.cross||'single',match:Math.round(n.match*1000)/1000,active:st.active,createdAt:existing?.createdAt||Date.now()};
    const rels=(S.model.relationships||[]).filter(r=>r.id!==rel.id).concat(rel);
    S.model={...S.model,relationships:rels}; S.modelSel=rel.id;
    close(); render(); toast(existing?'Relação atualizada.':'Relação criada.');
    await saveModel({relationships:rels});
  }
  const m=el('div',{class:'modal xwide',role:'dialog','aria-modal':'true'},
    el('h3',{text:existing?'Editar relação':'Nova relação'}),
    el('p',{text:'Selecione as tabelas e as colunas relacionadas (dá para clicar no cabeçalho da prévia).'}),
    SA.wrap,SB.wrap,
    el('div',{class:'rd-opts'},el('label',{class:'field'},'Cardinalidade',cardSel),el('label',{class:'field'},'Direção do filtro cruzado',crossSel)),
    el('label',{class:'rd-check'},activeCk,'Tornar esta relação ativa'),
    box,
    el('div',{class:'actions'},el('button',{class:'btn',onclick:close},'Cancelar'),okBtn));
  bg.append(m); document.body.append(bg);
  refresh();
}
async function deleteRelation(r){
  const ok=await confirmBox('Excluir relação?','Gráficos que usam colunas da outra base deixarão de mostrar esses dados.','Excluir');
  if (!ok) return;
  const rels=(S.model.relationships||[]).filter(x=>x.id!==r.id);
  S.model={...S.model,relationships:rels}; render(); await saveModel({relationships:rels});
}
async function toggleRelation(r,on){
  const rels=(S.model.relationships||[]).map(x=>x.id===r.id?{...x,active:on}:x);
  S.model={...S.model,relationships:rels}; render(); await saveModel({relationships:rels});
}
// procura colunas em comum entre as bases (mesmo nome/código e valores que batem)
async function suggestRelations(){
  if (S.bases.length<2){ toast('Você precisa de pelo menos 2 bases.',true); return; }
  const t=toast('Analisando suas bases…',false,120000);
  const KEY_RX=/(^id\b|\bid$|c[oó]d|cpf|cnpj|sku|ref|matr[ií]cula|chave|n[uú]mero|^n[ºo°.])/i;
  const sets=new Map();
  try{
    for (const b of S.bases){
      const rows=await getRows(b.id);
      b.columns.forEach((c,j)=>{
        if (c.type==='date') return;
        if (c.type==='number'&&!KEY_RX.test(c.name)&&!CODE_RX.test(c.name)) return; // valores (R$, qtd) não são chaves
        if (c.type==='text'&&isTimeCol(rows,j)) return;
        const st=colStats(rows,j); if(st.set.size<2||st.set.size>20000) return;
        sets.set(`${b.id}|${c.name}`,{b,c,st});
      });
    }
  }catch(e){ t.remove(); toast('Não foi possível analisar as bases agora.',true); return; }
  const nn=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
  const have=new Set((S.model.relationships||[]).flatMap(r=>[`${r.from.base}|${r.from.col}#${r.to.base}|${r.to.col}`,`${r.to.base}|${r.to.col}#${r.from.base}|${r.from.col}`]));
  const items=[...sets.values()], out=[];
  for (let i=0;i<items.length;i++) for (let j=i+1;j<items.length;j++){
    const x=items[i], y=items[j]; if (x.b.id===y.b.id) continue;
    if (have.has(`${x.b.id}|${x.c.name}#${y.b.id}|${y.c.name}`)) continue;
    if (!x.st.unique&&!y.st.unique) continue;
    const a=nn(x.c.name), b=nn(y.c.name);
    const nameScore=a===b?1:(a.length>2&&b.length>2&&(a.includes(b)||b.includes(a)))?0.6:(KEY_RX.test(x.c.name)&&KEY_RX.test(y.c.name))?0.3:0;
    const [small,big]=x.st.set.size<=y.st.set.size?[x.st.set,y.st.set]:[y.st.set,x.st.set];
    let hit=0; for(const k of small) if(big.has(k)) hit++;
    const overlap=hit/small.size;
    if (overlap<0.6) continue;
    if (!nameScore&&(overlap<0.8||small.size<5)) continue;
    out.push({a:{base:x.b.id,col:x.c.name},b:{base:y.b.id,col:y.c.name},an:x.b.name,bn:y.b.name,overlap,score:overlap+nameScore});
  }
  t.remove();
  out.sort((p,q)=>q.score-p.score);
  const list=out.slice(0,8);
  const close=modal('Relações sugeridas',list.length?'Encontramos colunas com valores em comum entre suas bases. Clique em “Conectar” para revisar e criar a relação.':'Não encontramos colunas em comum entre suas bases. Você ainda pode criar uma relação manualmente.',
    list.length?el('div',{class:'rel-list'},list.map(s=>el('div',{class:'rel-item'},
      el('div',{class:'rel-path'},el('b',{text:s.an}),` · ${s.a.col}`,el('span',{class:'rel-arrow',text:'⇄'}),el('b',{text:s.bn}),` · ${s.b.col}`),
      el('span',{class:'chip',text:`${pct1(s.overlap*100)} em comum`}),
      el('button',{class:'btn sm primary',onclick:()=>{ close(); relationDialog(s.a,s.b); }},'Conectar')))):null,
    [{label:'Fechar'}]);
}
function autoLayout(){
  const pos={}, colW=290, perRow=Math.max(1,Math.min(4,Math.floor(((($('#main')?.clientWidth)||1100)-60)/colW)));
  let y=24, rowH=0;
  S.bases.forEach((b,i)=>{
    const col=i%perRow; if(col===0&&i>0){ y+=rowH+40; rowH=0; }
    pos[b.id]={x:24+col*colW,y}; rowH=Math.max(rowH,46+27*(b.columns?.length||1)+8);
  });
  return pos;
}
function svgEl(tag,attrs){ const e=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); return e; }
// atalhos de teclado do diagrama (registrados uma vez): Delete exclui a relação selecionada, Esc limpa a seleção

function modelView(){
  const wrap=el('div',{class:'view'}), page=el('div',{class:'model-page'}); wrap.append(page);
  const rels=(S.model.relationships||[]), valid=rels.filter(relValid);
  const many=S.bases.length>=2, canEdit=many&&!S.readOnly;
  if (S.modelSel&&!rels.some(r=>r.id===S.modelSel)) S.modelSel=null;
  page.append(el('div',{class:'model-head'},
    el('div',{style:'flex:1;min-width:240px'},
      el('h1',{text:'Ligar planilhas'}),
      el('p',{text:'Conecte suas tabelas por uma coluna em comum (código do produto, CPF, nome do cliente…) para usar as informações de uma nos gráficos da outra. Conectar é opcional.'})),
    el('div',{class:'head-actions'},
      el('button',{class:'btn',onclick:suggestRelations,disabled:!canEdit},'Sugerir relações'),
      el('button',{class:'btn',title:'Reorganiza as tabelas no diagrama',onclick:()=>{ const p=autoLayout(); S.model={...S.model,positions:p}; render(); saveModel({positions:p}); },disabled:!S.bases.length},'Organizar'),
      el('button',{class:'btn primary',disabled:!canEdit,onclick:()=>{ const a=S.bases[0], b=S.bases[1]; relationDialog({base:a.id,col:a.columns[0]?.name},{base:b.id,col:b.columns[0]?.name}); }},'+ Nova relação'))));
  if (!S.bases.length){ page.append(el('div',{class:'p-card',style:'text-align:center'},el('p',{class:'desc',style:'margin:0',text:'Envie pelo menos duas bases para montar o modelo de dados.'}))); return wrap; }

  const baseHint=canEdit?'Arraste uma coluna até a coluna correspondente de outra tabela para criar a relação. Clique numa linha para selecionar, dois cliques para editar, Delete para excluir.':'Envie mais uma base para poder conectá-las.';
  const hint=el('div',{class:'model-hint',text:baseHint});
  // zoom (botões, "ajustar à tela" e Ctrl + rolagem)
  let z=S.modelZoom||1, W=0, H=0;
  const zl=el('span',{class:'mz-val'});
  const zoomBar=el('div',{class:'mz'},
    el('button',{class:'icon-btn',title:'Diminuir zoom','aria-label':'Diminuir zoom',onclick:()=>setZoom(z-.1)},'−'),zl,
    el('button',{class:'icon-btn',title:'Aumentar zoom','aria-label':'Aumentar zoom',onclick:()=>setZoom(z+.1)},'+'),
    el('button',{class:'btn sm',onclick:()=>fit()},'Ajustar à tela'));
  page.append(el('div',{class:'model-bar'},hint,zoomBar));
  const canvas=el('div',{class:'model-canvas'}), sizer=el('div',{class:'model-sizer'}), inner=el('div',{class:'model-inner'}), svg=svgEl('svg',{class:'model-svg'});
  inner.append(svg); sizer.append(inner); canvas.append(sizer); page.append(canvas);
  function applyZoom(){ inner.style.transform=`scale(${z})`; sizer.style.width=(W*z)+'px'; sizer.style.height=(H*z)+'px'; zl.textContent=Math.round(z*100)+'%'; }
  function setZoom(v){ z=Math.max(.4,Math.min(1.6,Math.round(v*100)/100)); S.modelZoom=z; layout(); }
  function fit(){ let w=0,h=0; for(const c of cards.values()){ w=Math.max(w,c.offsetLeft+c.offsetWidth); h=Math.max(h,c.offsetTop+c.offsetHeight); }
    if(!w) return; setZoom(Math.min(1.2,(canvas.clientWidth-30)/(w+30),(canvas.clientHeight-30)/(h+30))); canvas.scrollTo(0,0); }
  canvas.addEventListener('wheel',e=>{ if(!e.ctrlKey) return; e.preventDefault(); setZoom(z+(e.deltaY<0?.1:-.1)); },{passive:false});
  canvas.addEventListener('click',e=>{ if(e.target===canvas||e.target===sizer||e.target===inner||e.target===svg) select(null); });

  const defaults=autoLayout(), cards=new Map();
  const linked=new Map(); // "base|col" -> 'one' | 'many'
  for (const r of valid){ linked.set(`${r.from.base}|${r.from.col}`,r.card==='1:1'?'one':'many'); linked.set(`${r.to.base}|${r.to.col}`,r.card==='*:*'?'many':'one'); }
  let clickSel=null; // conexão por clique (coluna, depois coluna de outra tabela)
  const toInner=ev=>{ const ir=inner.getBoundingClientRect(); return {x:(ev.clientX-ir.left)/z,y:(ev.clientY-ir.top)/z}; };
  const anchor=key=>{ const row=inner.querySelector(`.mcol[data-key="${CSS.escape(key)}"]`); if(!row) return null; const card=row.closest('.mcard');
    return {l:card.offsetLeft,r:card.offsetLeft+card.offsetWidth,y:card.offsetTop+row.offsetTop+row.offsetHeight/2,row}; };

  for (const b of S.bases){
    const p={...(S.model.positions?.[b.id]||defaults[b.id])};
    const head=el('div',{class:'mhead',title:'Arraste para mover'},icon('file'),el('span',{class:'mname',text:b.name,title:b.name}),el('span',{class:'mcount',text:`${nf.format(b.rowCount||0)} linhas`}));
    const colsBox=el('div',{class:'mcols'});
    for (const c of b.columns){
      const key=`${b.id}|${c.name}`, lk=linked.get(key);
      const row=el('div',{class:'mcol'+(lk?' linked':''),'data-key':key,title:canEdit?`Arraste “${c.name}” até a coluna correspondente de outra tabela`:c.name},
        el('span',{class:'mty',text:{number:'123',date:'DATA',text:'ABC'}[c.type]}),el('span',{class:'mcn',text:c.name}),
        lk?el('span',{class:'mkey',title:lk==='one'?'Lado "1" da relação (valores únicos)':'Lado "muitos" da relação',text:lk==='one'?'1':'∗'}):null);
      if (canEdit) row.addEventListener('pointerdown',e=>{
        if (e.button!==0) return; e.preventDefault();
        const sx=e.clientX, sy=e.clientY; let dragging=false, temp=null, target=null;
        const src={base:b.id,col:c.name};
        try{ row.setPointerCapture(e.pointerId); }catch(_){}
        const move=ev=>{
          if (!dragging&&Math.hypot(ev.clientX-sx,ev.clientY-sy)<5) return;
          if (!dragging){ dragging=true; row.classList.add('sel'); canvas.classList.add('connecting'); hint.classList.add('active'); hint.textContent='Solte sobre a coluna correspondente de outra tabela.';
            temp=svgEl('path',{class:'drag-line'}); svg.append(temp); }
          const A=anchor(key), pt=toInner(ev), right=pt.x>=(A.l+A.r)/2, x1=right?A.r:A.l, d=right?60:-60;
          temp.setAttribute('d',`M${x1} ${A.y} C ${x1+d} ${A.y}, ${pt.x-d} ${pt.y}, ${pt.x} ${pt.y}`);
          const hitEl=document.elementFromPoint(ev.clientX,ev.clientY), tr=hitEl&&hitEl.closest?hitEl.closest('.mcol'):null;
          const ok=tr&&tr.closest('.mcard')!==row.closest('.mcard')?tr:null;
          if (target&&target!==ok) target.classList.remove('drop-ok');
          target=ok; if(target) target.classList.add('drop-ok');
          // rolagem automática perto das bordas
          const cr=canvas.getBoundingClientRect();
          if (ev.clientX>cr.right-30) canvas.scrollLeft+=14; else if (ev.clientX<cr.left+30) canvas.scrollLeft-=14;
          if (ev.clientY>cr.bottom-30) canvas.scrollTop+=14; else if (ev.clientY<cr.top+30) canvas.scrollTop-=14;
        };
        const up=()=>{
          row.removeEventListener('pointermove',move); row.removeEventListener('pointerup',up); row.removeEventListener('pointercancel',up);
          canvas.classList.remove('connecting'); hint.classList.remove('active'); hint.textContent=baseHint;
          if (temp) temp.remove();
          if (target){ target.classList.remove('drop-ok'); row.classList.remove('sel'); const k=target.dataset.key, i=k.indexOf('|'); relationDialog(src,{base:k.slice(0,i),col:k.slice(i+1)}); return; }
          if (dragging){ row.classList.remove('sel'); return; }
          // clique simples: conectar em dois cliques
          if (clickSel&&clickSel.base===b.id&&clickSel.col===c.name){ clickSel.el.classList.remove('sel'); clickSel=null; return; }
          if (clickSel&&clickSel.base!==b.id){ const a={base:clickSel.base,col:clickSel.col}; clickSel.el.classList.remove('sel'); clickSel=null; relationDialog(a,src); return; }
          if (clickSel) clickSel.el.classList.remove('sel');
          clickSel={...src,el:row}; row.classList.add('sel'); hint.classList.add('active');
          hint.textContent=`“${b.name} · ${c.name}” selecionada. Clique na coluna correspondente de outra tabela (ou arraste da próxima vez).`;
        };
        row.addEventListener('pointermove',move); row.addEventListener('pointerup',up); row.addEventListener('pointercancel',up);
      });
      colsBox.append(row);
    }
    const card=el('div',{class:'mcard',style:`left:${p.x}px;top:${p.y}px`},head,colsBox);
    cards.set(b.id,card); inner.append(card);
    // mover a tabela pelo título
    head.addEventListener('pointerdown',e=>{
      if (e.button!==0) return; e.preventDefault();
      const sx=e.clientX, sy=e.clientY, ox=p.x, oy=p.y; try{ head.setPointerCapture(e.pointerId); }catch(_){} card.classList.add('dragging'); modelDragging=true;
      const move=ev=>{ p.x=Math.max(0,Math.round(ox+(ev.clientX-sx)/z)); p.y=Math.max(0,Math.round(oy+(ev.clientY-sy)/z)); card.style.left=p.x+'px'; card.style.top=p.y+'px'; layout(); };
      const up=()=>{ head.removeEventListener('pointermove',move); head.removeEventListener('pointerup',up); head.removeEventListener('pointercancel',up); card.classList.remove('dragging'); modelDragging=false;
        if (p.x!==ox||p.y!==oy){ const all={...(S.model.positions||{}),[b.id]:{x:p.x,y:p.y}}; S.model={...S.model,positions:all}; saveModel({positions:all}); } };
      head.addEventListener('pointermove',move); head.addEventListener('pointerup',up); head.addEventListener('pointercancel',up);
    });
  }

  function geom(A,B){
    const ca=(A.l+A.r)/2, cb=(B.l+B.r)/2;
    let x1,x2,c1,c2;
    if (Math.abs(ca-cb)<200){ x1=A.r; x2=B.r; c1=x1+80; c2=x2+80; }     // uma sob a outra: liga pelo lado direito
    else if (ca<cb){ x1=A.r; x2=B.l; const d=Math.max(50,(x2-x1)/2); c1=x1+d; c2=x2-d; }
    else { x1=A.l; x2=B.r; const d=Math.max(50,(x1-x2)/2); c1=x1-d; c2=x2+d; }
    const P0={x:x1,y:A.y}, C1={x:c1,y:A.y}, C2={x:c2,y:B.y}, P3={x:x2,y:B.y};
    return {P0,C1,C2,P3,rightA:x1===A.r,rightB:x2===B.r,d:`M${x1} ${A.y} C ${c1} ${A.y}, ${c2} ${B.y}, ${x2} ${B.y}`};
  }
  const lbl=(g,P,t,toRight)=>{ const tx=svgEl('text',{x:toRight?P.x+9:P.x-9,y:P.y-7,class:'rel-lbl','text-anchor':toRight?'start':'end'}); tx.textContent=t; g.append(tx); };
  const arrow=(g,p,ang,off)=>g.append(svgEl('path',{d:'M-5.5,-4.5 L5.5,0 L-5.5,4.5 Z',class:'rel-arrow',transform:`translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) rotate(${ang.toFixed(1)}) translate(${off},0)`}));
  function drawLines(){
    svg.querySelectorAll('.rl').forEach(n=>n.remove());
    inner.querySelectorAll('.mcol.rel-col').forEach(n=>n.classList.remove('rel-col'));
    for (const r of valid){
      const A=anchor(`${r.from.base}|${r.from.col}`), B=anchor(`${r.to.base}|${r.to.col}`); if(!A||!B) continue;
      const g=geom(A,B), sel=r.id===S.modelSel;
      const grp=svgEl('g',{class:'rl'+(sel?' sel':'')+(r.active===false?' off':''),'data-id':r.id});
      grp.append(svgEl('path',{d:g.d,class:'rel-line'}));
      lbl(grp,g.P0,r.card==='1:1'?'1':'∗',g.rightA); lbl(grp,g.P3,r.card==='*:*'?'∗':'1',g.rightB);
      // setas no meio = direção do filtro (do lado "1" para o lado "muitos"; "Ambas" mostra duas)
      const mid={x:(g.P0.x+3*g.C1.x+3*g.C2.x+g.P3.x)/8,y:(g.P0.y+3*g.C1.y+3*g.C2.y+g.P3.y)/8};
      const ang=Math.atan2(-g.P0.y-g.C1.y+g.C2.y+g.P3.y,-g.P0.x-g.C1.x+g.C2.x+g.P3.x)*180/Math.PI;
      const cross=r.cross||(r.card==='1:1'?'both':'single');
      if (cross==='both'){ arrow(grp,mid,ang,8); arrow(grp,mid,ang+180,8); } else arrow(grp,mid,ang+180,0);
      const hit=svgEl('path',{d:g.d,class:'rel-hit'});
      hit.addEventListener('click',e=>{ e.stopPropagation(); select(r.id); });
      hit.addEventListener('dblclick',e=>{ e.stopPropagation(); if(!S.readOnly) relationDialog(r.from,r.to,r); });
      grp.append(hit); svg.append(grp);
      if (sel){ A.row.classList.add('rel-col'); B.row.classList.add('rel-col'); }
    }
    list.querySelectorAll('.rel-item').forEach(it=>it.classList.toggle('sel',it.dataset.id===S.modelSel));
  }
  function layout(){
    let w=0,h=0; for(const c of cards.values()){ w=Math.max(w,c.offsetLeft+c.offsetWidth); h=Math.max(h,c.offsetTop+c.offsetHeight); }
    W=Math.max(w+80,canvas.clientWidth/z); H=Math.max(h+80,canvas.clientHeight/z);
    inner.style.width=W+'px'; inner.style.height=H+'px'; svg.setAttribute('width',W); svg.setAttribute('height',H);
    applyZoom(); drawLines();
  }
  function select(id){
    S.modelSel=id; drawLines();
    const r=id&&rels.find(x=>x.id===id);
    if (r){ const fa=baseById(r.from.base), tb=baseById(r.to.base);
      hint.classList.add('active'); hint.textContent=`Selecionada: ${fa?.name} · ${r.from.col} → ${tb?.name} · ${r.to.col}. Dois cliques para editar, Delete para excluir.`; }
    else { hint.classList.remove('active'); hint.textContent=baseHint; }
  }

  // lista de relações (como "Gerenciar relações")
  page.append(el('div',{class:'sec-title',style:'align-items:flex-start;text-align:left;margin-top:22px'},el('h2',{text:`Relações (${rels.length})`}),
    el('span',{class:'muted',style:'font-size:13px',text:'Relações ativas *:1 e 1:1 trazem as colunas da outra tabela para os gráficos, como “Tabela › Coluna”.'})));
  const list=el('div',{class:'rel-list'});
  if (!rels.length) list.append(el('div',{class:'muted',style:'font-size:13px',text:'Nenhuma relação ainda. As tabelas funcionam normalmente sozinhas; conecte só se quiser cruzar informações.'}));
  for (const r of rels){
    const ok=relValid(r), fa=baseById(r.from.base), tb=baseById(r.to.base);
    const sw=el('input',{type:'checkbox',checked:r.active!==false,disabled:!ok||S.readOnly,title:'Ativar/desativar'}); sw.onchange=()=>toggleRelation(r,sw.checked);
    const cross=r.cross||(r.card==='1:1'?'both':'single');
    const item=el('div',{class:'rel-item','data-id':r.id},
      el('div',{class:'rel-path'},el('b',{text:fa?.name||'(base excluída)'}),` · ${r.from.col}`,el('span',{class:'rel-arrow',text:cross==='both'?'⇄':'→'}),el('b',{text:tb?.name||'(base excluída)'}),` · ${r.to.col}`),
      el('span',{class:'chip',text:CARD_TXT[r.card]||r.card}),
      el('span',{class:'chip',text:cross==='both'?'Filtro: ambas':'Filtro: única'}),
      ok?el('span',{class:'chip',text:`${pct1((r.match||0)*100)} correspondem`}):el('span',{class:'chip warn',text:'Coluna ou tabela não encontrada'}),
      el('label',{class:'rel-toggle'},sw,'Ativa'),
      ok&&!S.readOnly?el('button',{class:'btn sm',onclick:()=>relationDialog(r.from,r.to,r)},'Editar'):null,
      S.readOnly?null:el('button',{class:'btn sm danger',onclick:()=>deleteRelation(r)},'Excluir'));
    item.addEventListener('click',e=>{ if(e.target.closest('button,input,label')) return; select(r.id); });
    item.addEventListener('mouseenter',()=>svg.querySelector(`.rl[data-id="${r.id}"]`)?.classList.add('hover'));
    item.addEventListener('mouseleave',()=>svg.querySelector(`.rl[data-id="${r.id}"]`)?.classList.remove('hover'));
    list.append(item);
  }
  page.append(list);
  requestAnimationFrame(()=>{ layout(); if(!S.modelZoom){ let w=0; for(const c of cards.values()) w=Math.max(w,c.offsetLeft+c.offsetWidth); if(w>canvas.clientWidth) fit(); } if(S.modelSel) select(S.modelSel); });
  return wrap;
}

export { CARD_OPTS, CARD_TXT, analyzeRel, autoLayout, baseById, colStats, deleteRelation, ensureRelated, getRows, lookupRels, modelDragging, modelView, normKey, openModel, relDescribe, relValid, relationDialog, saveModel, suggestRelations, svgEl, toggleRelation, vizData };
