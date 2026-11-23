import { render } from '../app/render.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase } from '../core/storage.js';
import { el, nf, toast } from '../core/utils.ts';
import { convert, detectType } from '../core/values.ts';
import { fold, formModal } from './extras.js';

/* ----- Limpeza de dados ----- */
const blankCell=v=>v==null||(typeof v==='string'&&v.trim()==='');
const tidy=s=>s.trim().replace(/\s+/g,' ');
function cleanScan(meta,rows){
  const out={empty:0,trim:0,dup:0,variants:[],types:[]};
  for (const r of rows){ if(r.every(blankCell)) out.empty++; for(const v of r) if(typeof v==='string'&&v!==tidy(v)) out.trim++; }
  const seen=new Set(); for (const r of rows){ if(r.every(blankCell)) continue; const k=JSON.stringify(r.map(v=>typeof v==='string'?tidy(v):v)); if(seen.has(k)) out.dup++; else seen.add(k); }
  meta.columns.forEach((c,j)=>{
    if (c.type!=='text'||c.virtual||c.calc) return;
    const groups=new Map();
    for (const r of rows){ const v=r[j]; if(typeof v!=='string'||!v.trim()) continue; const s=tidy(v), k=fold(s); let g=groups.get(k); if(!g){ g=new Map(); groups.set(k,g); } g.set(s,(g.get(s)||0)+1); if(groups.size>3000) return; }
    for (const g of groups.values()) if (g.size>1){
      const best=[...g.entries()].sort((a,b)=>b[1]-a[1]||(/^[A-ZÀ-Ý]/.test(b[0])-/^[A-ZÀ-Ý]/.test(a[0])))[0][0];
      let n=0; for (const [s,k] of g) if(s!==best) n+=k;
      out.variants.push({j,col:c.name,best,others:[...g.keys()].filter(s=>s!==best),n});
    }
    if (!/(pedido|n[uú]mero|c[oó]d|sku|^ref|nota|matr[ií]cula|^id\b)/i.test(c.name)){ const t=detectType(c.name,rows.map(r=>r[j])); if(t!=='text') out.types.push({j,col:c.name,type:t}); }
  });
  return out;
}
function cleanDialog(meta){
  const sc=cleanScan(meta,S.rows), cks={};
  const item=(key,n,title,desc,extra)=>{ const ck=el('input',{type:'checkbox',disabled:!n}); ck.checked=n>0; cks[key]=ck;
    return el('label',{class:'ck-row clean-row'+(n?'':' off')},ck,el('span',{},el('b',{text:title}),el('small',{text:n?desc:'Nada encontrado.'}),n&&extra?extra:null),el('span',{class:'clean-n',text:n?nf.format(n):'0'})); };
  const vEx=sc.variants.slice(0,4).map(v=>el('div',{class:'clean-ex',text:`${v.col}: ${v.others.slice(0,2).map(s=>`“${s}”`).join(', ')} → “${v.best}”`}));
  const typeCks=sc.types.map(t=>{ const ck=el('input',{type:'checkbox'}); ck.checked=true; t.ck=ck; return el('label',{class:'ck-row sub'},ck,`${t.col}: texto → ${{number:'número',date:'data'}[t.type]}`); });
  const vCells=sc.variants.reduce((s,v)=>s+v.n,0);
  const found=sc.empty+sc.trim+sc.dup+vCells+sc.types.length;
  const content=el('div',{class:'clean-list'},
    item('trim',sc.trim,'Espaços sobrando','Remove espaços no começo e no fim dos textos e espaços duplos no meio (células afetadas).'),
    item('variants',vCells,'Mesmo valor escrito de jeitos diferentes',`Une ${nf.format(sc.variants.length)} ${sc.variants.length===1?'grupo':'grupos'} de grafias (maiúsculas, acentos) na forma mais usada. Isso corrige gráficos que mostram o mesmo item separado.`,el('div',{},vEx)),
    item('types',sc.types.length,'Colunas com tipo errado','Números ou datas guardados como texto não entram em somas e gráficos de tempo.',el('div',{},typeCks)),
    item('empty',sc.empty,'Linhas vazias','Remove linhas sem nenhum valor preenchido.'),
    item('dup',sc.dup,'Linhas repetidas','Remove cópias idênticas de uma mesma linha e mantém a primeira.'));
  formModal('Limpar dados',found?'Encontramos estes pontos na base. Escolha o que corrigir; você pode conferir tudo na tabela antes de compartilhar.':'Nenhum problema encontrado: a base já está limpa.',content,found?'Corrigir selecionados':null,async()=>{
    const m=structuredClone(meta); let rows=S.rows.map(r=>r.slice()); const done=[];
    if (cks.trim.checked){ rows=rows.map(r=>r.map(v=>typeof v==='string'?tidy(v):v)); done.push('espaços'); }
    if (cks.variants.checked){ const map=new Map(); for(const v of sc.variants) for(const o of v.others) map.set(v.j+'|'+o,v.best);
      rows=rows.map(r=>r.map((v,j)=>typeof v==='string'&&map.has(j+'|'+tidy(v))?map.get(j+'|'+tidy(v)):v)); done.push('grafias'); }
    if (cks.types.checked){ for(const t of sc.types) if(t.ck.checked){ m.columns[t.j].type=t.type; rows=rows.map(r=>{ r[t.j]=convert(r[t.j],t.type); return r; }); } done.push('tipos'); }
    const before=rows.length;
    if (cks.empty.checked) rows=rows.filter(r=>!r.every(blankCell));
    if (cks.dup.checked){ const seen=new Set(); rows=rows.filter(r=>{ if(r.every(blankCell)) return true; const k=JSON.stringify(r.map(v=>typeof v==='string'?tidy(v):v)); if(seen.has(k)) return false; seen.add(k); return true; }); }
    const t=toast('Salvando…',false,60000);
    try{ await saveBase(m,rows,'Antes da limpeza de dados'); S.rows=rows; S.dirty=false; t.remove(); toast(`Base limpa${before>rows.length?`: ${nf.format(before-rows.length)} ${before-rows.length===1?'linha removida':'linhas removidas'}`:''}.`); render(); }
    catch(e){ t.remove(); handleWriteError(e); return false; }
  },'clean-modal');
}

export { blankCell, cleanDialog, cleanScan, tidy };
