import { downloads, leaveProfile, openBase } from '../app/init.js';
import { confirmBox } from '../app/modals.js';
import { icon, render } from '../app/render.js';
import { MEAS_RX, autoCharts } from '../charts/auto-charts.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase } from '../core/storage.js';
import { $, el, nf, toast, uid8 } from '../core/utils.ts';
import { CODE_RX } from '../core/values.ts';
import { fld, fold, formModal } from './extras.js';
import { loadScript } from '../import/pdf-image.js';
import { getRows } from '../views/data-model.js';

/* ----- Consulta SQL sobre todas as bases -----
   SQLite de verdade rodando no navegador (sql.js / WebAssembly). Cada base vira uma tabela num banco em
   memória: as consultas trabalham numa cópia e nunca alteram as bases. O banco é recriado sozinho quando
   alguma base muda. Consultas salvas ficam na conta (data/users/{uid}/app → queries). */
let sqlLib=null;
const SQLJS='https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
function getSqlJs(){ return sqlLib||(sqlLib=loadScript(SQLJS+'sql-wasm.js').then(()=>window.initSqlJs({locateFile:f=>SQLJS+f})).catch(e=>{ sqlLib=null; throw e; })); }
const sqlSlug=s=>fold(s).replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').replace(/^(\d)/,'t_$1')||'tabela';
const sqlQ=s=>'"'+String(s).replace(/"/g,'""')+'"';
const SQ=()=>S.sql||(S.sql={db:null,sig:'',tables:[],text:'',res:null,err:'',busy:false,status:''});
async function ensureSqlDb(progress){
  const st=SQ(), sig=S.bases.map(b=>b.id+':'+b.updatedAt).join('|');
  if (st.db&&st.sig===sig) return st.db;
  progress&&progress('Carregando o motor SQL…');
  const SQL=await getSqlJs();
  const db=new SQL.Database(), tables=[], used=new Set();
  for (const [i,b] of S.bases.entries()){
    progress&&progress(`Carregando “${b.name}” (${i+1} de ${S.bases.length})…`);
    const rows=await getRows(b.id); let name=sqlSlug(b.name); while(used.has(name)) name+='_2'; used.add(name);
    const cols=b.columns.map((c,j)=>({name:c.name,type:c.type,j})).filter(c=>!b.columns[c.j].virtual);
    if (!cols.length) continue;
    db.run(`CREATE TABLE ${sqlQ(name)} (${cols.map(c=>`${sqlQ(c.name)} ${c.type==='number'?'REAL':'TEXT'}`).join(', ')})`);
    const ins=db.prepare(`INSERT INTO ${sqlQ(name)} VALUES (${cols.map(()=>'?').join(',')})`);
    db.run('BEGIN'); for (const r of rows) ins.run(cols.map(c=>{ const v=r[c.j]; return v==null||v===''?null:typeof v==='number'?v:String(v); })); db.run('COMMIT'); ins.free();
    tables.push({name,baseId:b.id,baseName:b.name,cols,count:rows.length});
  }
  if (st.db){ try{ st.db.close(); }catch(e){} }
  Object.assign(st,{db,sig,tables}); return db;
}
function sqlExamples(){
  const st=SQ(), out=[], t=st.tables[0]; if(!t) return out;
  out.push({name:'Ver as primeiras linhas',sql:`SELECT *\nFROM ${t.name}\nLIMIT 100;`});
  const txt=t.cols.find(c=>c.type==='text'&&!CODE_RX.test(c.name)), num=t.cols.find(c=>c.type==='number'&&MEAS_RX.test(c.name))||t.cols.find(c=>c.type==='number'), dt=t.cols.find(c=>c.type==='date');
  if (txt) out.push({name:`Total por ${txt.name}`,sql:`SELECT ${sqlQ(txt.name)},\n       COUNT(*) AS registros${num?`,\n       ROUND(SUM(${sqlQ(num.name)}), 2) AS total,\n       ROUND(AVG(${sqlQ(num.name)}), 2) AS media`:''}\nFROM ${t.name}\nGROUP BY ${sqlQ(txt.name)}\nORDER BY ${num?'total':'registros'} DESC;`});
  if (dt) out.push({name:'Evolução por mês',sql:`SELECT strftime('%Y-%m', ${sqlQ(dt.name)}) AS mes,\n       COUNT(*) AS registros${num?`,\n       ROUND(SUM(${sqlQ(num.name)}), 2) AS total`:''}\nFROM ${t.name}\nGROUP BY mes\nORDER BY mes;`});
  if (num) out.push({name:`Maiores valores de ${num.name}`,sql:`SELECT *\nFROM ${t.name}\nWHERE ${sqlQ(num.name)} IS NOT NULL\nORDER BY ${sqlQ(num.name)} DESC\nLIMIT 20;`});
  // junção pelas relações do Modelo de dados
  for (const r of S.model.relationships||[]){
    const a=st.tables.find(x=>x.baseId===r.from?.base), b=st.tables.find(x=>x.baseId===r.to?.base);
    if (a&&b&&a!==b){ out.push({name:`Juntar ${a.baseName} com ${b.baseName}`,sql:`SELECT a.*, b.*\nFROM ${a.name} AS a\nLEFT JOIN ${b.name} AS b\n  ON a.${sqlQ(r.from.col)} = b.${sqlQ(r.to.col)}\nLIMIT 100;`}); break; }
  }
  if (st.tables.length>1&&!out.some(x=>/JOIN/.test(x.sql))){ const b=st.tables[1], common=t.cols.find(c=>b.cols.some(d=>fold(d.name)===fold(c.name)&&c.type!=='number'));
    if (common){ const bc=b.cols.find(d=>fold(d.name)===fold(common.name)); out.push({name:`Juntar ${t.baseName} com ${b.baseName}`,sql:`SELECT a.*, b.*\nFROM ${t.name} AS a\nJOIN ${b.name} AS b\n  ON a.${sqlQ(common.name)} = b.${sqlQ(bc.name)}\nLIMIT 100;`}); } }
  out.push({name:'Listar todas as tabelas',sql:`SELECT name AS tabela\nFROM sqlite_master\nWHERE type = 'table'\nORDER BY name;`});
  return out;
}
// mensagens do SQLite em português, com a dica mais provável
function sqlErrPt(msg){
  const m=String(msg||'');
  let x;
  if ((x=m.match(/no such table: (\S+)/))) return `A tabela ${x[1]} não existe. Veja os nomes das tabelas na lista à esquerda (clique para inserir).`;
  if ((x=m.match(/no such column: (.+)/))) return `A coluna ${x[1]} não existe. Nomes com espaço ou acento precisam de aspas duplas, por exemplo "Valor total".`;
  if (/syntax error/.test(m)) return `Erro de sintaxe: ${m.replace(/^.*?:/,'').trim()}. Confira vírgulas, aspas e parênteses.`;
  if (/ambiguous column/.test(m)) return 'Coluna ambígua: ela existe em mais de uma tabela da junção. Use apelido.coluna, por exemplo a."Cliente".';
  if (/incomplete input/.test(m)) return 'A consulta está incompleta. Falta fechar aspas, parênteses ou terminar o comando.';
  return m;
}
async function runSql(text){
  const st=SQ(); text=String(text||'').trim(); if(!text) return;
  st.busy=true; st.err=''; st.status='Executando…'; render();
  try{
    const db=await ensureSqlDb(s=>{ st.status=s; const e=document.querySelector('.sql-status'); if(e) e.textContent=s; });
    const t0=performance.now(), rs=db.exec(text), ms=Math.round(performance.now()-t0);
    const last=rs[rs.length-1];
    st.res=last?{columns:last.columns,values:last.values,ms,sql:text}:{columns:[],values:[],ms,sql:text,none:true,changes:db.getRowsModified()};
  }catch(e){ console.warn(e); st.err=sqlErrPt(e&&e.message); st.res=null; }
  st.busy=false; st.status=''; if(S.view==='sql') render();
}
function sqlResultRows(){ const r=SQ().res; return r?r.values:[]; }
function sqlToBase(){
  const r=SQ().res; if(!r||!r.columns.length) return;
  const name=el('input',{value:'Resultado da consulta',maxlength:80}), err=el('div',{class:'form-err'});
  formModal('Salvar como nova base',`Cria uma base com as ${nf.format(r.values.length)} linhas do resultado. Ela ganha tabela, gráficos automáticos e todos os recursos de uma base normal.`,el('div',{class:'goal-form'},fld('Nome da base',name),err),'Criar base',async()=>{
    if (S.readOnly){ err.textContent='Acesso somente leitura.'; return false; }
    const used=new Set(), cols=r.columns.map((c,j)=>{ let n=String(c||`Coluna ${j+1}`); while(used.has(fold(n))) n+=' (2)'; used.add(fold(n));
      const vals=r.values.map(v=>v[j]).filter(v=>v!=null); const type=vals.length&&vals.every(v=>typeof v==='number')?'number':vals.length&&vals.every(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v))?'date':'text'; return {name:n,type}; });
    const rows=r.values.map(v=>v.map((x,j)=>x==null?null:cols[j].type==='text'?String(x):x));
    const meta={id:uid8(),name:name.value.trim()||'Resultado da consulta',fileName:'Consulta SQL',columns:cols,createdAt:Date.now(),charts:autoCharts(cols,rows),sqlSource:r.sql};
    try{ await saveBase(meta,rows); if(!S.bases.find(b=>b.id===meta.id)) S.bases.unshift(structuredClone(meta)); toast('Base criada a partir da consulta.'); S.tab='graficos'; openBase(meta.id); }
    catch(e){ handleWriteError(e); return false; }
  },'goal-modal');
}
async function sqlExport(kind){
  const r=SQ().res; if(!r||!r.columns.length) return;
  if (kind==='xlsx'){ const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([r.columns,...r.values]),'Consulta');
    const out=XLSX.write(wb,{bookType:'xlsx',type:'array'}); try{ await downloads.save({filename:'consulta.xlsx',data:new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}); }catch(e){ toast('Download não concluído.',true); } return; }
  const esc=v=>{ if(v==null) return ''; const s=typeof v==='number'?String(v).replace('.',','):String(v); return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const csv=[r.columns.map(esc).join(';'),...r.values.map(v=>v.map(esc).join(';'))].join('\n');
  if (kind==='copy'){ try{ await navigator.clipboard.writeText(csv); toast('Resultado copiado. Cole no Excel ou no Google Planilhas.'); }catch(e){ toast('O navegador bloqueou a cópia.',true); } return; }
  try{ await downloads.save({filename:'consulta.csv',data:new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'})}); }catch(e){ toast('Download não concluído.',true); }
}
// consultas salvas: na conta (ou só nesta aba, sem login)
async function saveQueries(list){
  S.queries=list;
  if (S.mode==='cloud'){ try{ await S.db.doc(`data/users/${S.uid}/app`).set({queries:list},{merge:true}); }catch(e){ handleWriteError(e); } }
}
function saveQueryDialog(text){
  const name=el('input',{placeholder:'Ex.: Vendas por vendedor no mês',maxlength:80}), err=el('div',{class:'form-err'});
  formModal('Salvar consulta','Fica guardada na sua conta para rodar de novo quando quiser.',el('div',{class:'goal-form'},fld('Nome',name),err),'Salvar',()=>{
    if (!name.value.trim()){ err.textContent='Dê um nome para a consulta.'; name.focus(); return false; }
    saveQueries([{id:uid8(),name:name.value.trim(),sql:text,at:Date.now()},...(S.queries||[])].slice(0,50)); toast('Consulta salva.'); if(S.view==='sql') render();
  },'goal-modal');
  setTimeout(()=>name.focus(),50);
}
function openSql(){ leaveProfile().then(ok=>{ if(!ok) return; S.view='sql'; $('#aside').classList.remove('open'); render(); }); }
function sqlView(){
  const st=SQ();
  const v=el('div',{class:'view sql-page'});
  v.append(el('div',{class:'sql-head'},el('div',{},el('h1',{text:'Consulta SQL'}),el('p',{text:'Escreva consultas em SQL (SQLite) sobre todas as suas bases ao mesmo tempo, inclusive juntando bases. As consultas usam uma cópia dos dados: nada do que você rodar aqui altera as bases.'}))));
  if (!S.bases.length){ v.append(el('div',{class:'cq-card'},el('b',{text:'Você ainda não tem bases.'}),el('p',{text:'Envie uma planilha para começar a consultar.'}))); return v; }
  // carrega o banco na primeira visita (ou quando alguma base mudou)
  const sig=S.bases.map(b=>b.id+':'+b.updatedAt).join('|');
  if ((!st.db||st.sig!==sig)&&!st.busy&&!st.loadErr){ st.busy=true; st.status='Preparando as tabelas…';
    ensureSqlDb(s=>{ st.status=s; const e=document.querySelector('.sql-status'); if(e) e.textContent=s; })
      .then(()=>{ st.busy=false; st.status=''; if(!st.text){ const ex=sqlExamples()[1]||sqlExamples()[0]; st.text=ex?ex.sql:''; } if(S.view==='sql') render(); })
      .catch(e=>{ console.error(e); st.busy=false; st.loadErr=true; st.status=''; toast('Não foi possível carregar o motor SQL. Verifique sua conexão e recarregue a página.',true,7000); if(S.view==='sql') render(); }); }
  const ta=el('textarea',{class:'sql-editor',spellcheck:'false',placeholder:'SELECT * FROM nome_da_tabela LIMIT 100;','aria-label':'Consulta SQL'}); ta.value=st.text||'';
  ta.addEventListener('input',()=>{ st.text=ta.value; });
  const run=()=>{ const sel=ta.value.slice(ta.selectionStart,ta.selectionEnd).trim(); runSql(sel||ta.value); };
  ta.addEventListener('keydown',e=>{
    if ((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); run(); }
    else if (e.key==='Tab'){ e.preventDefault(); const s=ta.selectionStart; ta.setRangeText('  ',s,ta.selectionEnd,'end'); st.text=ta.value; }
  });
  const insert=t=>{ const s=ta.selectionStart??ta.value.length; ta.setRangeText(t,s,ta.selectionEnd??s,'end'); st.text=ta.value; ta.focus(); };
  // lista de tabelas e colunas (clique para inserir no editor)
  const tlist=el('div',{class:'sql-tables'},el('div',{class:'rd-title',text:`Tabelas (${st.tables.length})`}),
    st.tables.length?st.tables.map(t=>el('details',{class:'sql-t',open:st.tables.length<=3},
      el('summary',{},el('code',{text:t.name,title:'Clique duas vezes para inserir',ondblclick:e=>{ e.preventDefault(); insert(t.name); }}),el('span',{class:'muted',text:`${nf.format(t.count)} linhas`})),
      el('div',{class:'sql-base muted',text:`Base “${t.baseName}”`}),
      el('div',{class:'sql-cols'},t.cols.map(c=>el('button',{class:'sql-col',title:'Inserir no editor',onclick:()=>insert(/^[a-z_][a-z0-9_]*$/.test(c.name)?c.name:sqlQ(c.name))},el('span',{text:c.name}),el('em',{text:{number:'número',date:'data',text:'texto'}[c.type]})))),
      el('button',{class:'btn sm',style:'margin-top:6px',onclick:()=>{ ta.value=`SELECT *\nFROM ${t.name}\nLIMIT 100;`; st.text=ta.value; runSql(ta.value); }},'Ver dados'))):el('div',{class:'muted',style:'font-size:12.5px',text:st.busy?'Carregando…':'—'}),
    el('div',{class:'sql-help'},el('div',{class:'rd-title',text:'Dicas'}),el('ul',{},
      el('li',{},'Nomes com espaço ou acento vão entre aspas duplas: ',el('code',{text:'"Valor total"'})),
      el('li',{},'Datas estão como texto AAAA-MM-DD: ',el('code',{text:"strftime('%Y-%m', \"Data\")"})),
      el('li',{},'Rode só um trecho: selecione e aperte ',el('b',{text:'Ctrl+Enter'})),
      el('li',{text:'Junte bases com JOIN usando colunas em comum (ex.: código do cliente).'}))));
  // exemplos e consultas salvas
  const exs=st.tables.length?sqlExamples():[];
  const exSel=el('select',{class:'sql-ex'},el('option',{value:'',text:'Exemplos prontos…'}),exs.map((x,i)=>el('option',{value:String(i),text:x.name})));
  exSel.onchange=()=>{ const x=exs[+exSel.value]; if(!x) return; ta.value=x.sql; st.text=x.sql; exSel.value=''; runSql(x.sql); };
  const qs=S.queries||[];
  const runBtn=el('button',{class:'btn primary',onclick:run,disabled:st.busy||!st.db},st.busy?'Aguarde…':'▶ Executar');
  const editor=el('div',{class:'sql-main'},
    el('div',{class:'sql-bar'},runBtn,el('span',{class:'muted sql-kbd',text:'Ctrl+Enter'}),el('span',{class:'spacer'}),exSel,
      el('button',{class:'btn sm',onclick:()=>{ if(!ta.value.trim()){ toast('Escreva uma consulta antes de salvar.',true); return; } saveQueryDialog(ta.value.trim()); }},'Salvar consulta')),
    ta,
    qs.length?el('div',{class:'sql-saved'},el('span',{class:'muted',text:'Salvas:'}),qs.map(q=>el('span',{class:'sql-chip'},
      el('button',{class:'chip',title:q.sql,onclick:()=>{ ta.value=q.sql; st.text=q.sql; runSql(q.sql); }},q.name),
      el('button',{class:'icon-btn',title:'Excluir consulta salva',onclick:async()=>{ if(!await confirmBox('Excluir consulta salva?',`“${q.name}” será removida.`,'Excluir')) return; await saveQueries(qs.filter(x=>x.id!==q.id)); render(); }},icon('trash'))))):null,
    el('div',{class:'sql-status muted',text:st.status||''}));
  // resultado
  const out=el('div',{class:'sql-out'});
  if (st.err) out.append(el('div',{class:'sql-err'},el('b',{text:'Não foi possível executar. '}),st.err));
  else if (st.res){
    const r=st.res;
    if (r.none) out.append(el('div',{class:'cq-card'},el('b',{text:'Comando executado.'}),el('p',{text:`${r.changes?`${nf.format(r.changes)} linhas afetadas na cópia de trabalho. `:''}Comandos que alteram dados (UPDATE, DELETE, CREATE…) valem só nesta sessão e não mudam suas bases.`})));
    else {
      const show=r.values.slice(0,500), isNum=r.columns.map((_,j)=>show.some(v=>typeof v[j]==='number'));
      out.append(el('div',{class:'sql-res-bar'},el('b',{text:`${nf.format(r.values.length)} ${r.values.length===1?'linha':'linhas'}`}),el('span',{class:'muted',text:` · ${r.columns.length} colunas · ${r.ms} ms${r.values.length>500?' · mostrando as 500 primeiras':''}`}),el('span',{class:'spacer'}),
        el('button',{class:'btn sm',onclick:()=>sqlExport('copy')},'Copiar'),el('button',{class:'btn sm',onclick:()=>sqlExport('csv')},'CSV'),el('button',{class:'btn sm',onclick:()=>sqlExport('xlsx')},'Excel'),
        S.readOnly?null:el('button',{class:'btn sm primary',onclick:sqlToBase,disabled:!r.values.length},'Salvar como nova base')),
        el('div',{class:'table-card'},el('div',{class:'table-scroll sql-scroll'},el('table',{class:'data'},
          el('thead',{},el('tr',{},r.columns.map((c,j)=>el('th',{class:isNum[j]?'num':'',text:c})))),
          el('tbody',{},show.length?show.map(v=>el('tr',{},v.map((x,j)=>el('td',{class:isNum[j]?'num':''},x==null?el('span',{class:'null',text:'NULL'}):typeof x==='number'?nf.format(x):String(x))))):el('tr',{},el('td',{colspan:r.columns.length||1,class:'muted',style:'text-align:center;padding:24px',text:'Nenhuma linha retornada.'})))))));
    }
  } else out.append(el('div',{class:'muted',style:'font-size:13px;padding:8px 2px',text:st.busy?'':'Escolha um exemplo pronto ou escreva sua consulta e clique em Executar.'}));
  v.append(el('div',{class:'sql-grid'},tlist,el('div',{style:'min-width:0'},editor,out)));
  return v;
}

export { SQ, SQLJS, ensureSqlDb, getSqlJs, openSql, runSql, saveQueries, saveQueryDialog, sqlErrPt, sqlExamples, sqlExport, sqlLib, sqlQ, sqlResultRows, sqlSlug, sqlToBase, sqlView };
