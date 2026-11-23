import { confirmBox } from '../app/modals.js';
import { render } from '../app/render.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase } from '../core/storage.js';
import { el, toast } from '../core/utils.ts';
import { display, parseNum } from '../core/values.ts';
import { tidy } from './clean.js';
import { fld, fold, formModal, pDate } from './extras.js';
import { isoDay } from '../views/reports-tab.js';

/* ----- Colunas calculadas -----
   Fórmulas no estilo Excel em português: [Receita] - [Custo], SE([Valor]>100; "Alto"; "Baixo"), ARRED([x]/[y]*100; 1).
   A fórmula vira uma função JS montada só com peças conhecidas (números, textos, colunas, operadores e funções
   da lista), então não dá para executar código arbitrário. Os valores são gravados na base, e são recalculados
   sempre que a base é salva (edição, nova planilha, sincronização, limpeza). */
const numv=x=>typeof x==='number'?x:x==null||x===''?null:(isNaN(parseNum(x))?null:parseNum(x));
const dstr=x=>{ const s=x==null?'':String(x); return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null; };
const FX={
  SE:(c,a,b=null)=>c?a:b, IF:(c,a,b=null)=>c?a:b, E:(...a)=>a.every(Boolean), AND:(...a)=>a.every(Boolean), OU:(...a)=>a.some(Boolean), OR:(...a)=>a.some(Boolean), NAO:x=>!x, NOT:x=>!x,
  SEERRO:(x,alt)=>x==null||(typeof x==='number'&&!isFinite(x))?alt:x, IFERROR:(x,alt)=>x==null||(typeof x==='number'&&!isFinite(x))?alt:x,
  VAZIO:x=>x==null||x==='', ISBLANK:x=>x==null||x==='',
  ARRED:(x,n=0)=>{ x=numv(x); if(x==null) return null; const p=10**(numv(n)||0); return Math.round(x*p)/p; }, ROUND:(x,n=0)=>FX.ARRED(x,n),
  ABS:x=>{ x=numv(x); return x==null?null:Math.abs(x); }, MAXIMO:(...a)=>{ const v=a.map(numv).filter(x=>x!=null); return v.length?Math.max(...v):null; }, MINIMO:(...a)=>{ const v=a.map(numv).filter(x=>x!=null); return v.length?Math.min(...v):null; },
  MAX:(...a)=>FX.MAXIMO(...a), MIN:(...a)=>FX.MINIMO(...a), SOMA:(...a)=>a.map(numv).filter(x=>x!=null).reduce((s,x)=>s+x,0), SUM:(...a)=>FX.SOMA(...a),
  MEDIA:(...a)=>{ const v=a.map(numv).filter(x=>x!=null); return v.length?v.reduce((s,x)=>s+x,0)/v.length:null; },
  ANO:d=>{ d=dstr(d); return d?+d.slice(0,4):null; }, MES:d=>{ d=dstr(d); return d?+d.slice(5,7):null; }, DIA:d=>{ d=dstr(d); return d?+d.slice(8,10):null; },
  ANOMES:d=>{ d=dstr(d); return d?d.slice(0,7):null; }, TRIMESTRE:d=>{ d=dstr(d); return d?`${d.slice(0,4)}-T${Math.ceil(+d.slice(5,7)/3)}`:null; },
  DIASEMANA:d=>{ d=dstr(d); return d?['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][pDate(d).getDay()]:null; },
  HOJE:()=>isoDay(new Date()), DIAS:(fim,ini)=>{ fim=dstr(fim); ini=dstr(ini); return fim&&ini?Math.round((pDate(fim)-pDate(ini))/864e5):null; },
  SOMARDIAS:(d,n)=>{ d=dstr(d); n=numv(n); if(!d||n==null) return null; const x=pDate(d); x.setDate(x.getDate()+n); return isoDay(x); },
  TEXTO:x=>x==null?'':String(x), MAIUSCULA:x=>x==null?null:String(x).toUpperCase(), MINUSCULA:x=>x==null?null:String(x).toLowerCase(),
  ESQUERDA:(s,n=1)=>s==null?null:String(s).slice(0,numv(n)||0), DIREITA:(s,n=1)=>s==null?null:String(s).slice(-(numv(n)||0)), ARRUMAR:s=>s==null?null:tidy(String(s)),
  CONTEM:(s,t)=>s!=null&&fold(s).includes(fold(t)), CONCAT:(...a)=>a.map(x=>x==null?'':String(x)).join(''), VALOR:x=>numv(x), NUM:x=>numv(x)};
const FX_HELP=[['SE(condição; se sim; se não)','SE([Valor]>1000; "Grande"; "Pequeno")'],['ARRED(número; casas)','ARRED([Lucro]/[Receita]*100; 1)'],['SEERRO(valor; alternativa)','SEERRO([A]/[B]; 0)'],
  ['ANO, MES, DIA, ANOMES, TRIMESTRE, DIASEMANA (data)','ANOMES([Data])'],['DIAS(fim; início)','DIAS(HOJE(); [Data de abertura])'],['SOMARDIAS(data; n)','SOMARDIAS([Data]; 30)'],
  ['E, OU, NAO, VAZIO, CONTEM','SE(CONTEM([Descrição]; "pix"); "Pix"; "Outro")'],['MAIUSCULA, MINUSCULA, ESQUERDA, DIREITA, ARRUMAR','ESQUERDA([CEP]; 5)'],['Juntar textos com &','[Cidade] & "/" & [UF]']];
function compileFormula(src,columns,selfName){
  const toks=[], re=/\s+|(\d+(?:[.,]\d+)?)|("(?:[^"]|"")*"|'(?:[^']|'')*')|\[([^\]]+)\]|([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*)|(<=|>=|<>|!=|==|[=<>+\-*/^&(),;%])/gy;
  let m, pos=0, js='', depth=0;
  re.lastIndex=0;
  while (pos<src.length){
    re.lastIndex=pos; m=re.exec(src); if(!m||m.index!==pos) throw new Error(`Não entendi o trecho “${src.slice(pos,pos+12)}”`);
    pos=re.lastIndex;
    if (m[1]) js+=m[1].replace(',','.');
    else if (m[2]) js+=JSON.stringify(m[2].slice(1,-1).replace(m[2][0]==='"'?/""/g:/''/g,m[2][0]));
    else if (m[3]){ const name=m[3].trim(); if(selfName&&fold(name)===fold(selfName)) throw new Error('A fórmula não pode usar a própria coluna.');
      const j=columns.findIndex(c=>fold(c.name)===fold(name)); if(j<0) throw new Error(`A coluna [${name}] não existe nesta base.`); js+=`v[${j}]`; }
    else if (m[4]){ const id=fold(m[4]).toUpperCase().replace(/[^A-Z0-9_]/g,'');
      if (id==='VERDADEIRO'||id==='TRUE') js+='true'; else if(id==='FALSO'||id==='FALSE') js+='false';
      else if (FX[id]) js+=`F.${id}`; else throw new Error(`Função ${m[4]} não existe. Veja a lista de funções.`); }
    else if (m[5]){ const o=m[5];
      js+=o==='='||o==='=='?'==':o==='<>'||o==='!='?'!=':o==='^'?'**':o===';'||o===','?',':o==='&'?'+""+':o==='%'?'/100':o;
      if (o==='(') depth++; if (o===')'){ depth--; if(depth<0) throw new Error('Há um parêntese fechando a mais.'); } }
  }
  if (depth>0) throw new Error('Falta fechar um parêntese.');
  if (!js.trim()) throw new Error('Escreva uma fórmula.');
  let fn; try{ fn=new Function('v','F',`"use strict"; return (${js});`); }catch(e){ throw new Error('A fórmula está incompleta ou com operador sobrando.'); }
  return v=>{ try{ let x=fn(v,FX); if(typeof x==='boolean') x=x?'Sim':'Não'; if(typeof x==='number'&&!isFinite(x)) return null; return x===undefined?null:x; }catch(e){ return null; } };
}
const inferCalcType=vals=>{ const v=vals.filter(x=>x!=null&&x!==''); if(!v.length) return 'number'; if(v.every(x=>typeof x==='number')) return 'number'; if(v.every(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x))) return 'date'; return 'text'; };
// recalcula as colunas calculadas (na ordem, então uma pode usar a outra)
function applyCalcs(meta,rows){
  const cs=meta.columns.map((c,j)=>({c,j})).filter(o=>o.c.calc); if(!cs.length) return rows;
  const W=meta.columns.length;
  for (const r of rows) while(r.length<W) r.push(null);
  for (const {c,j} of cs){ let f; try{ f=compileFormula(c.calc,meta.columns.slice(0,W),c.name); }catch(e){ console.warn(c.name,e.message); continue; }
    for (const r of rows){ let x=f(r); if(c.type==='text'&&x!=null) x=String(x); r[j]=x===''?null:x; } }
  return rows;
}
// ao trocar os dados (nova planilha, sincronização), as colunas calculadas continuam
function keepCalcs(oldCols,newCols){ const names=new Set(newCols.map(c=>fold(c.name))); return [...newCols,...oldCols.filter(c=>c.calc&&!names.has(fold(c.name))).map(c=>({...c}))]; }
function calcDialog(meta,editIdx){
  const ed=editIdx!=null?meta.columns[editIdx]:null;
  const name=el('input',{value:ed?ed.name:'',placeholder:'Ex.: Lucro',maxlength:60});
  const ta=el('textarea',{class:'sql-editor calc-f',rows:3,spellcheck:'false',placeholder:'Ex.: [Valor total] - [Custo]'}); ta.value=ed?ed.calc:'';
  const err=el('div',{class:'form-err'}), prev=el('div',{class:'calc-prev'}), typeInfo=el('span',{class:'muted'});
  const cols=meta.columns.filter((c,j)=>!c.virtual&&j!==editIdx);
  const insert=t=>{ const s=ta.selectionStart??ta.value.length; ta.setRangeText(t,s,ta.selectionEnd??s,'end'); ta.focus(); draw(); };
  let compiled=null, outType='number';
  const draw=()=>{
    prev.innerHTML=''; err.textContent=''; compiled=null;
    const src=ta.value.trim(); if(!src){ typeInfo.textContent=''; return; }
    const base=meta.columns.filter((c,j)=>j!==editIdx);
    try{ compiled=compileFormula(src,base,name.value.trim()); }catch(e){ err.textContent=e.message; typeInfo.textContent=''; return; }
    const map=base.map(c=>meta.columns.indexOf(c));
    const vals=S.rows.slice(0,400).map(r=>compiled(map.map(j=>r[j])));
    outType=inferCalcType(vals); typeInfo.textContent=`Resultado: ${{number:'número',date:'data',text:'texto'}[outType]}`;
    const refs=[...src.matchAll(/\[([^\]]+)\]/g)].map(x=>base.findIndex(c=>fold(c.name)===fold(x[1].trim()))).filter((x,i,a)=>x>=0&&a.indexOf(x)===i).slice(0,4);
    prev.append(el('table',{class:'data mini'},el('thead',{},el('tr',{},refs.map(i=>el('th',{text:base[i].name})),el('th',{class:'calc-res',text:name.value.trim()||'Resultado'}))),
      el('tbody',{},S.rows.slice(0,6).map((r,k)=>el('tr',{},refs.map(i=>el('td',{text:display(r[map[i]],base[i].type)})),el('td',{class:'calc-res',text:vals[k]==null?'—':display(vals[k],outType)}))))));
  };
  ta.addEventListener('input',draw); name.addEventListener('input',draw);
  const chips=el('div',{class:'calc-chips'},cols.map(c=>el('button',{class:'chip',type:'button',onclick:()=>insert(`[${c.name}]`)},c.name)));
  const help=el('details',{class:'cq-more'},el('summary',{text:'Funções disponíveis'}),el('table',{class:'data mini'},el('tbody',{},
    [['Operadores','+  -  *  /  ^  %   e comparações  =  <>  >  <  >=  <='],...FX_HELP].map(([a,b])=>el('tr',{},el('td',{text:a}),el('td',{},el('code',{text:b})))))));
  const content=el('div',{class:'goal-form calc-form'},fld('Nome da coluna',name),
    el('div',{class:'field'},'Fórmula',ta),el('div',{class:'calc-cols'},el('span',{class:'muted',text:'Clique para inserir uma coluna:'}),chips),
    help,el('div',{class:'calc-ph'},el('b',{text:'Prévia'}),typeInfo),prev,err);
  const dlg=formModal(ed?'Editar coluna calculada':'Nova coluna calculada','Crie uma coluna a partir de outras, como lucro, margem, mês da venda ou faixa de valor. Ela é recalculada sozinha sempre que os dados mudam e funciona em gráficos, metas, TV e SQL.',content,ed?'Salvar coluna':'Criar coluna',async()=>{
    const nm=name.value.trim(); draw();
    if (!nm){ err.textContent='Dê um nome para a coluna.'; name.focus(); return false; }
    if (meta.columns.some((c,j)=>j!==editIdx&&fold(c.name)===fold(nm))){ err.textContent='Já existe uma coluna com esse nome.'; return false; }
    if (!compiled) return false;
    const m=structuredClone(meta); m.columns=m.columns.filter(c=>!c.virtual);
    const col={name:nm,type:outType,calc:ta.value.trim()};
    let rows=S.rows.map(r=>r.slice());
    if (ed){ const old=m.columns[editIdx].name; m.columns[editIdx]=col; if(old!==nm) for(const c of m.charts||[]){ if(c.x===old) c.x=nm; if(c.y===old) c.y=nm; } }
    else { m.columns.push(col); rows.forEach(r=>{ while(r.length<m.columns.length) r.push(null); }); }
    const t=toast('Calculando…',false,60000);
    try{ await saveBase(m,rows); S.rows=rows; S.dirty=false; t.remove(); toast(ed?'Coluna calculada atualizada.':`Coluna “${nm}” criada.`); render(); }
    catch(e){ t.remove(); handleWriteError(e); return false; }
  },'wide calc-modal');
  if (ed) dlg.m.querySelector('.actions').prepend(el('button',{class:'btn danger',style:'margin-right:auto',onclick:async()=>{
    if (!await confirmBox('Excluir coluna calculada?',`A coluna “${ed.name}” e os gráficos que usam ela serão removidos.`,'Excluir')) return;
    const m=structuredClone(meta); m.columns=m.columns.filter(c=>!c.virtual); m.columns.splice(editIdx,1); m.charts=(m.charts||[]).filter(c=>c.x!==ed.name&&c.y!==ed.name);
    const rows=S.rows.map(r=>{ const a=r.slice(); a.splice(editIdx,1); return a; });
    dlg.close(); try{ await saveBase(m,rows); S.rows=rows; toast('Coluna removida.'); render(); }catch(e){ handleWriteError(e); } }},'Excluir coluna'));
  draw(); setTimeout(()=>(ed?ta:name).focus(),50);
}

export { FX, FX_HELP, applyCalcs, calcDialog, compileFormula, dstr, inferCalcType, keepCalcs, numv };
