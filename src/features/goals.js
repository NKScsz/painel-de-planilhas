import { currentMeta } from '../app/init.js';
import { icon } from '../app/render.js';
import { MEAS_RX, distinctCount } from '../charts/auto-charts.js';
import { pct1, persistCharts } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { el, fmtNum, nf, toast, uid8 } from '../core/utils.ts';
import { parseNum } from '../core/values.ts';
import { undoToast } from '../easy/simple-mode.js';
import { byCat } from './compare.js';
import { fld, formModal, inRange, pDate, rangeTxt } from './extras.js';
import { isoDay, periodRange } from '../views/reports-tab.js';

/* ----- Metas e alertas ----- */
const GOAL_PER=[['month','Este mês'],['week','Esta semana'],['year','Este ano'],['all','Todo o período']];
function goalRange(p,now=new Date()){
  if (p==='week'){ const a=new Date(now); a.setDate(a.getDate()-((a.getDay()+6)%7)); const b=new Date(a); b.setDate(b.getDate()+6); return {from:isoDay(a),to:isoDay(b)}; }
  return p==='month'||p==='year'?periodRange(p,now):null;
}
function goalStatus(meta,g,rows=S.rows){
  const dj=meta.columns.findIndex(c=>c.type==='date'), rg=dj>=0?goalRange(g.period):null;
  const yj=g.col?meta.columns.findIndex(c=>c.name===g.col):-1; if(g.col&&yj<0) return null;
  let rs=byCat(meta,rows,g.filter); if(rg) rs=inRange(rs,dj,rg);
  let v=0; if(yj<0) v=rs.length; else for(const r of rs){ const x=r[yj]; if(typeof x==='number') v+=g.abs?Math.abs(x):x; }
  const t=+g.target||0, pct=t>0?v/t*100:0;
  let frac=1; if(rg){ const a=pDate(rg.from), b=pDate(rg.to), n=pDate(isoDay(new Date())); frac=Math.min(1,Math.max(0,((n-a)/864e5+1)/((b-a)/864e5+1))); }
  const live=rg&&frac<1, proj=live&&frac>0?v/frac:v;
  let st,txt;
  if (g.kind==='max'){
    if (v>t){ st='bad'; txt=`Limite ultrapassado em ${fmtNum(v-t)}`; }
    else if (live&&proj>t){ st='warn'; txt=`No ritmo atual deve fechar em ${fmtNum(proj)}, acima do limite`; }
    else { st='ok'; txt=`Dentro do limite: ainda cabem ${fmtNum(t-v)}`; }
  } else {
    if (v>=t){ st='ok'; txt='Meta atingida'; }
    else if (!rg){ st='track'; txt=`Faltam ${fmtNum(t-v)}`; }
    else if (live&&proj<t*0.95){ st='warn'; txt=`Abaixo do ritmo: no passo atual deve fechar em ${fmtNum(proj)}`; }
    else if (live){ st='track'; txt=`No ritmo para bater a meta: faltam ${fmtNum(t-v)}`; }
    else { st='bad'; txt=`Meta não atingida: faltaram ${fmtNum(t-v)}`; }
  }
  return {v,t,pct,st,txt,rg,frac,live};
}
function goalsSection(meta){
  const gs=meta.goals||[]; if(!gs.length&&S.readOnly) return null;
  const box=el('section',{class:'goals'}), summary=el('span',{class:'g-sum'});
  box.append(el('div',{class:'goals-h'},el('h3',{text:'Metas'}),summary,el('span',{class:'spacer'}),
    S.readOnly?null:el('button',{class:'btn sm',onclick:()=>goalDialog(meta)},icon('plus'),'Nova meta')));
  if (!gs.length){ box.append(el('div',{class:'teach'},el('b',{text:'Você ainda não tem metas'}),el('p',{text:'Uma meta é um número que você quer alcançar (ex.: vender 50 mil no mês) ou um limite que não quer passar (ex.: gastar até 5 mil com fornecedores). O painel mostra o progresso e avisa quando algo sai do ritmo.'}),S.readOnly?null:el('div',{class:'teach-btns'},el('button',{class:'btn primary',onclick:()=>goalDialog(meta)},'Criar a primeira meta')))); return box; }
  const grid=el('div',{class:'goal-grid'}); let alerts=0;
  for (const g of gs){
    const s=goalStatus(meta,g); if(!s) continue;
    if (s.st==='warn'||s.st==='bad') alerts++;
    const per=(GOAL_PER.find(p=>p[0]===g.period)||GOAL_PER[3])[1];
    grid.append(el('div',{class:'goal '+s.st},
      el('div',{class:'g-top'},el('b',{text:g.name,title:g.name}),S.readOnly?null:el('span',{class:'g-act'},
        el('button',{class:'icon-btn',title:'Editar meta','aria-label':'Editar meta',onclick:()=>goalDialog(meta,g)},icon('edit')),
        el('button',{class:'icon-btn',title:'Excluir meta','aria-label':'Excluir meta',onclick:()=>{ const before=structuredClone(meta.goals||[]), m=structuredClone(meta); m.goals=(m.goals||[]).filter(x=>x.id!==g.id); persistCharts(m); undoToast(`Meta “${g.name}” excluída.`,()=>{ const cur=structuredClone(currentMeta()); cur.goals=before; persistCharts(cur); }); }},icon('trash')))),
      el('div',{class:'g-sub',text:[g.kind==='max'?'Limite':'Meta',s.rg?`${per} (${rangeTxt(s.rg)})`:'Todo o período',g.col?`soma de ${g.col}`:'quantidade de registros',g.filter?`só ${g.filter.col}: ${g.filter.val}`:null].filter(Boolean).join(' · ')}),
      el('div',{class:'g-val'},el('span',{class:'v',text:fmtNum(s.v)}),el('span',{class:'t',text:` de ${fmtNum(s.t)}`}),el('span',{class:'p',text:pct1(s.pct)})),
      el('div',{class:'g-bar'},el('i',{style:`width:${Math.min(100,Math.max(0,s.pct))}%`}),s.live?el('em',{style:`left:${(s.frac*100).toFixed(1)}%`,title:'Onde o valor deveria estar hoje, no ritmo do período'}):null),
      el('div',{class:'g-st'},el('span',{class:'g-ic','aria-hidden':'true',text:{ok:'✓',warn:'!',bad:'!',track:'→'}[s.st]}),s.txt)));
  }
  summary.textContent=alerts?`${alerts} ${alerts===1?'meta precisa':'metas precisam'} de atenção`:'Tudo dentro do esperado';
  summary.classList.toggle('alert',alerts>0);
  box.append(grid); return box;
}
function goalDialog(meta,g){
  const nums=meta.columns.filter(c=>c.type==='number'), dcol=meta.columns.find(c=>c.type==='date');
  const cats=meta.columns.map((c,j)=>({c,j})).filter(({c,j})=>c.type==='text'&&distinctCount(S.rows,j,200)<=200).map(o=>o.c);
  const st=g?structuredClone(g):{id:uid8(),name:'',col:(nums.find(c=>MEAS_RX.test(c.name))||nums[0])?.name||'',kind:'min',target:'',period:dcol?'month':'all',filter:null,abs:false};
  const name=el('input',{value:st.name,placeholder:'Ex.: Faturamento do mês',maxlength:60});
  const col=el('select',{},el('option',{value:'',text:'Quantidade de registros'}),nums.map(c=>el('option',{value:c.name,text:`Soma de ${c.name}`}))); col.value=st.col;
  const kind=el('select',{},el('option',{value:'min',text:'Atingir pelo menos (meta)'}),el('option',{value:'max',text:'Não passar de (limite)'})); kind.value=st.kind;
  const target=el('input',{inputmode:'decimal',value:st.target===''?'':nf.format(st.target),placeholder:'Ex.: 50.000'});
  const per=el('select',{disabled:!dcol},GOAL_PER.filter(([k])=>dcol||k==='all').map(([k,t])=>el('option',{value:k,text:t}))); per.value=dcol?st.period:'all';
  const fCol=el('select',{},el('option',{value:'',text:'Todos os registros'}),cats.map(c=>el('option',{value:c.name,text:c.name})));
  const fVal=el('select',{});
  const fillVals=()=>{ fVal.innerHTML=''; fVal.disabled=!fCol.value; if(!fCol.value) return; const j=meta.columns.findIndex(c=>c.name===fCol.value);
    [...new Set(S.rows.map(r=>String(r[j]??'(vazio)')))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).forEach(v=>fVal.append(el('option',{value:v,text:v}))); };
  fCol.value=st.filter?.col||''; fillVals(); if(st.filter) fVal.value=st.filter.val; fCol.onchange=fillVals;
  const abs=el('input',{type:'checkbox'}); abs.checked=!!st.abs;
  const err=el('div',{class:'form-err'});
  const content=el('div',{class:'goal-form'},fld('Nome da meta',name),
    el('div',{class:'form-row'},fld('O que medir',col),fld('Tipo',kind)),
    el('div',{class:'form-row'},fld('Valor da meta',target),fld('Período',per)),
    el('div',{class:'form-row'},fld('Considerar só',fCol),fld('Valor',fVal)),
    el('label',{class:'ck-row'},abs,el('span',{},el('b',{text:'Contar valores negativos como positivos'}),el('small',{text:'Útil para limite de gastos em extratos, onde as saídas aparecem com sinal de menos.'}))),
    dcol?null:el('p',{class:'muted',style:'font-size:12.5px',text:'Esta base não tem coluna de data, então a meta considera todos os registros.'}),err);
  formModal(g?'Editar meta':'Nova meta','O progresso é calculado com os dados desta base e aparece na aba Gráficos.',content,g?'Salvar meta':'Criar meta',()=>{
    const t=parseNum(target.value);
    if (!name.value.trim()){ err.textContent='Dê um nome para a meta.'; name.focus(); return false; }
    if (!(t>0)){ err.textContent='Informe um valor maior que zero.'; target.focus(); return false; }
    const ng={id:st.id,name:name.value.trim(),col:col.value,kind:kind.value,target:t,period:per.value,abs:abs.checked,filter:fCol.value?{col:fCol.value,val:fVal.value}:null};
    const m=structuredClone(meta); m.goals=m.goals||[]; const i=m.goals.findIndex(x=>x.id===ng.id); if(i>=0) m.goals[i]=ng; else m.goals.push(ng);
    persistCharts(m); toast(g?'Meta atualizada.':'Meta criada.');
  },'goal-modal');
}

export { GOAL_PER, goalDialog, goalRange, goalStatus, goalsSection };
