import { icon } from '../app/render.js';
import { AVG_RX, autoCharts, chartKey, distinctCount, isTimeCol } from '../charts/auto-charts.js';
import { AGG, aggregate, chartLabels, describeChart, makeChart, persistCharts } from '../charts/draw-and-pdf.js';
import { HTML_TYPES, htmlChart, isUfCol } from '../charts/extra-types.js';
import { S, charts } from '../core/state.js';
import { el, fmtDate, fmtNum, nf, toast, uid8 } from '../core/utils.ts';
import { CODE_RX } from '../core/values.ts';
import { deltaOf } from '../features/compare.js';
import { vizData } from './data-model.js';

/* ----- Novo gráfico: escolha guiada pelos dados ----- */
const CHART_TYPES=[
  {v:'bar',t:'Colunas',d:'Compara valores entre grupos ou períodos'},
  {v:'hbar',t:'Barras',d:'Ideal para rankings e nomes longos'},
  {v:'line',t:'Linha',d:'Mostra a evolução ao longo do tempo'},
  {v:'pie',t:'Rosca',d:'Mostra a fatia de cada parte no total'},
  {v:'stacked',t:'Empilhadas',d:'Cada barra dividida por outra coluna'},
  {v:'funnel',t:'Funil',d:'Etapas de um processo, da maior para a menor'},
  {v:'map',t:'Mapa do Brasil',d:'Valores por estado (UF)'},
  {v:'pivot',t:'Tabela resumo',d:'Linhas × colunas com totais (tabela dinâmica)'}];
const TYPE_LB={text:'texto',number:'número',date:'data'};
// coluna padrão para "dividir por" (empilhadas e tabela dinâmica): texto com poucas categorias, diferente do eixo
function defaultSeries(meta,x,rows){ const c=meta.columns.map((c,j)=>({c,j})).find(({c,j})=>c.name!==x&&c.type==='text'&&!CODE_RX.test(c.name)&&distinctCount(rows||S.rows||[],j,20)>=2&&distinctCount(rows||S.rows||[],j,20)<=12); return c?c.c.name:''; }
const colType=(meta,name)=>meta.columns.find(c=>c.name===name)?.type;
function typeOk(meta,type,x,rows){
  const t=colType(meta,x), j=meta.columns.findIndex(c=>c.name===x), time=t==='text'&&j>=0&&isTimeCol(rows||S.rows||[],j);
  if (type==='line') return t==='date'||t==='number'||time;
  if (type==='pie') return t==='text'&&!time;
  if (type==='map') return t==='text'&&j>=0&&isUfCol(rows||S.rows||[],j);
  if (type==='funnel'||type==='stacked'||type==='pivot') return (t==='text'&&!time)||((type==='pivot'||type==='stacked')&&t==='date');
  return true;
}
// sugestões = mesma lógica dos gráficos automáticos, sem repetir os que já estão no painel
function suggestCharts(meta){
  const have=new Set((meta.charts||[]).map(chartKey));
  return autoCharts(meta.columns,S.rows||[],14).filter(s=>!have.has(chartKey(s))).slice(0,6).map(s=>({...s,desc:s.why}));
}
const specFields=s=>{ const o={type:s.type,x:s.x,y:s.y||'',agg:s.agg}; for(const k of ['title','why','filter','abs','series','skipEmpty','wide','forecast']) if(s[k]!=null) o[k]=structuredClone(s[k]); return o; };
function bigIcon(n){ const s=icon(n); s.setAttribute('width','24'); s.setAttribute('height','24'); return s; }
function chartDialog(meta){
  const sugs=suggestCharts(meta);
  const vd=vizData(meta); meta=vd.vmeta; // permite agrupar/medir por colunas de bases conectadas
  const rows=vd.rows, cols=meta.columns, nums=cols.filter(c=>c.type==='number');
  const first=cols.find(c=>c.type==='text')||cols[0];
  const st=sugs[0]?specFields(sugs[0]):{type:colType(meta,first.name)==='date'?'line':'bar',x:first.name,y:nums[0]?.name||'',agg:nums[0]?'sum':'count'};
  let pv=null;
  const bg=el('div',{class:'modal-bg'});
  const onKey=e=>{ if(e.key==='Escape') close(); };
  const close=()=>{ if(pv){ try{pv.destroy();}catch(e){} pv=null; } bg.remove(); document.removeEventListener('keydown',onKey); };
  bg.addEventListener('click',e=>{ if(e.target===bg) close(); });
  document.addEventListener('keydown',onKey);

  const sugBtns=sugs.map(s=>{ const b=el('button',{class:'sug',type:'button',onclick:()=>{ for(const k of Object.keys(st)) delete st[k]; Object.assign(st,specFields(s)); sync(); }},
    el('div',{class:'si'},icon(s.type)),el('div',{},el('b',{text:s.title}),el('small',{text:s.desc}))); b._s=s; return b; });
  const typeBtns=CHART_TYPES.map(t=>{ const b=el('button',{class:'type-opt',type:'button',onclick:()=>{ st.type=t.v; if(t.v==='pie'&&st.y) st.agg='sum'; if(t.v==='stacked'&&!st.series) st.series=defaultSeries(meta,st.x,rows); sync(); }},bigIcon(t.v),t.t,el('small',{text:t.d})); b._t=t.v; return b; });
  const typeNote=el('div',{class:'type-note'});
  const xSel=el('select',{},cols.map(c=>el('option',{value:c.name,text:`${c.name} (${TYPE_LB[c.type]})`})));
  const ySel=el('select',{},el('option',{value:'',text:'Contar registros'}),nums.map(c=>el('option',{value:c.name,text:c.name})));
  const aSel=el('select',{});
  const sSel=el('select',{}), sFld=el('label',{class:'field'},'Dividir por',sSel);
  sSel.onchange=()=>{ st.series=sSel.value; sync(); };
  // escolher manualmente o que agrupar/medir desfaz o título, filtro e explicação da sugestão
  const manual=()=>{ for(const k of ['title','why','filter','abs']) delete st[k]; };
  xSel.onchange=()=>{ manual(); st.x=xSel.value; if(!typeOk(meta,st.type,st.x)) st.type=colType(meta,st.x)==='date'?'line':'bar'; sync(); };
  ySel.onchange=()=>{ manual(); st.y=ySel.value; st.agg=!st.y?'count':(st.agg==='count'?'sum':st.agg); sync(); };
  aSel.onchange=()=>{ manual(); st.agg=aSel.value; sync(); };
  const pvTitle=el('div',{class:'chart-title'}), pvSub=el('div',{class:'chart-sub'}), pvBody=el('div'), pvDesc=el('div',{class:'preview-desc'});
  const createBtn=el('button',{class:'btn primary',onclick:()=>{ const m=structuredClone(meta); (m.charts=m.charts||[]).push({id:uid8(),...specFields(st)}); close(); persistCharts(m); toast('Gráfico adicionado.'); }},'Criar gráfico');

  function sync(){
    const xt=colType(meta,st.x);
    const needS=st.type==='stacked'||st.type==='pivot'; sFld.hidden=!needS; if(st.series===st.x) st.series='';
    sSel.innerHTML=''; sSel.append(el('option',{value:'',text:st.type==='pivot'?'Nenhuma (só totais)':'Nada'}),...cols.filter(c=>c.type==='text'&&c.name!==st.x).map(c=>el('option',{value:c.name,selected:st.series===c.name,text:c.name})));
    sugBtns.forEach(b=>{ b.classList.toggle('sel',chartKey(b._s)===chartKey(st)); });
    typeBtns.forEach(b=>{ const ok=typeOk(meta,b._t,st.x); b.disabled=!ok; b.classList.toggle('sel',b._t===st.type); });
    const off=[]; if(!typeOk(meta,'line',st.x)) off.push(cols.some(c=>c.type==='date')?'Linha: agrupe por uma coluna de data ou número.':'Linha: esta base não tem coluna de data.'); if(!typeOk(meta,'pie',st.x)) off.push('Rosca, funil e empilhadas: agrupe por uma coluna de texto (categorias).'); if(!typeOk(meta,'map',st.x,rows)) off.push('Mapa: agrupe por uma coluna com estados (UF ou nome do estado).');
    typeNote.textContent=off.join(' · ');
    xSel.value=st.x; ySel.value=st.y;
    const aggs=!st.y?['count']:(st.type==='pie'?['sum']:['stacked','pivot','funnel','map'].includes(st.type)?['sum','avg']:['sum','avg','max','min']);
    if (!aggs.includes(st.agg)) st.agg=aggs[0];
    aSel.innerHTML=''; aggs.forEach(a=>aSel.append(el('option',{value:a,selected:st.agg===a,text:AGG[a]}))); aSel.disabled=aggs.length<2;
    // pré-visualização
    if (pv){ try{pv.destroy();}catch(e){} pv=null; }
    pvBody.innerHTML='';
    const res=aggregate(meta,st,rows);
    const L=chartLabels(st,res), yLabel=L.yLabel;
    pvTitle.textContent=L.title; pvSub.textContent=L.sub+(st.filter?` · só ${st.filter.col}: ${st.filter.val}`:'');
    pvDesc.textContent=describeChart(meta,st,res);
    createBtn.disabled=!typeOk(meta,st.type,st.x);
    if (!res||!res.labels.length){ pvBody.append(el('div',{class:'muted',style:'height:120px;display:grid;place-items:center',text:'Sem dados para esta combinação com os filtros atuais.'})); return; }
    if (HTML_TYPES.has(st.type)){ pvBody.append(htmlChart(st,res,meta)); return; }
    const box=el('div',{class:'chart-box'}), cv=el('canvas',{'aria-label':`${yLabel} por ${st.x}`,role:'img'}); box.append(cv); pvBody.append(box);
    requestAnimationFrame(()=>{ const ch=makeChart(cv,st,res,yLabel); if(!ch) return; const i=charts.indexOf(ch); if(i>=0) charts.splice(i,1); pv=ch; });
  }

  const m=el('div',{class:'modal wide',role:'dialog','aria-modal':'true'},
    el('h3',{text:'Novo gráfico'}),
    el('p',{text:`Escolha uma sugestão montada a partir das colunas de “${meta.name}” ou monte o seu. A prévia usa os filtros atuais.`}),
    sugs.length?el('div',{class:'sec-lb',text:'Sugestões para esta base'}):null,
    sugs.length?el('div',{class:'sug-grid'},sugBtns):null,
    el('div',{class:'sec-lb',text:'Tipo de gráfico'}),
    el('div',{class:'type-grid'},typeBtns), typeNote,
    el('div',{class:'sec-lb',text:'Dados'}),
    el('div',{class:'form-row'},el('label',{class:'field'},'Mostrar por',xSel),el('label',{class:'field'},'O que somar',ySel),el('label',{class:'field'},'Cálculo',aSel),sFld),
    el('div',{class:'sec-lb',text:'Prévia'}),
    el('div',{class:'preview'},el('div',{class:'chart-head'},el('div',{style:'flex:1;min-width:0'},pvTitle,pvSub)),pvBody,pvDesc),
    el('div',{class:'actions'},el('button',{class:'btn',onclick:close},'Cancelar'),createBtn));
  bg.append(m); document.body.append(bg);
  sync();
}
// prev (opcional): {rows, range} do período anterior; cada indicador ganha d (variação) e cmp (texto)
function computeKpis(meta,rows,prev){
  const P=prev&&prev.rows;
  const out=[{lb:'Registros',vl:nf.format(rows.length),sm:rows.length===S.rows.length?'total da base':`de ${nf.format(S.rows.length)} no total`,d:P?deltaOf(rows.length,P.length,'registros'):null}];
  meta.columns.forEach((c,j)=>{ if(c.type!=='number'||out.length>=5) return;
    if (CODE_RX.test(c.name)||/(pedido|n[uú]mero|c[oó]d|^n[ºo°.]|nota|matr[ií]cula|^ano$)/i.test(c.name)) return; // somar códigos não faz sentido
    let s=0,n=0,mn=Infinity,mx=-Infinity; for(const r of rows){ const v=r[j]; if(typeof v==='number'){s+=v;n++; if(v<mn)mn=v; if(v>mx)mx=v;} }
    const avg=AVG_RX.test(c.name); // preço unitário, %, taxa, idade…: a soma não diz nada, a média sim
    let d=null; if(P){ let ps=0,pn=0; for(const r of P){ const v=r[j]; if(typeof v==='number'){ ps+=v; pn++; } } if(pn) d=deltaOf(avg?s/(n||1):s,avg?ps/pn:ps,c.name); }
    out.push(avg?{lb:`${c.name} · média`,title:c.name,vl:n?fmtNum(s/n):'—',sm:n?`mín ${fmtNum(mn)} · máx ${fmtNum(mx)}`:'sem valores',d}
      :{lb:`${c.name} · soma`,title:c.name,vl:fmtNum(s),sm:n?`média ${fmtNum(s/n)} · mín ${fmtNum(mn)} · máx ${fmtNum(mx)}`:'sem valores',d});
  });
  const dcol=meta.columns.find(c=>c.type==='date');
  if (dcol){ const j=meta.columns.indexOf(dcol); const ds=rows.map(r=>r[j]).filter(v=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)).sort(); if(ds.length&&out.length<6) out.push({lb:`Período (${dcol.name})`,vl:`${fmtDate(ds[0])} – ${fmtDate(ds[ds.length-1])}`,small:true}); }
  for (const x of out) if (x.d) x.cmp=`${x.d.txt} vs período anterior`;
  return out;
}

export { CHART_TYPES, TYPE_LB, bigIcon, chartDialog, colType, computeKpis, defaultSeries, specFields, suggestCharts, typeOk };
