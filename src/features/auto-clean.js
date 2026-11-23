import { S } from '../core/state.js';
import { handleWriteError, saveMeta } from '../core/storage.js';
import { el, nf } from '../core/utils.ts';
import { convert, detectType } from '../core/values.ts';
import { blankCell, cleanScan, tidy } from './clean.js';
import { cnpjOk, cpfOk, onlyDigits } from './cnpj-cep.js';
import { fold } from './extras.js';

/* ----- Higienização automática na importação -----
   Corrige o que atrapalha análises sem mudar o sentido dos dados: espaços, marcadores de vazio (“-”, “N/A”,
   “#REF!”), cabeçalhos repetidos no meio da tabela, linhas de total/subtotal (somariam em dobro), linhas e
   colunas vazias, números e datas guardados como texto e o mesmo valor escrito de jeitos diferentes.
   Linhas idênticas só são removidas quando há uma coluna de identificação (pedido, código, nota…);
   sem ela podem ser registros repetidos de verdade, então só avisamos. */
const PLACEHOLDER_RX=/^(-+|—|–|\.+|n\/?a|n\/?d|#n\/?[ad]|#ref!?|#value!?|#valor!?|#div\/0!?|#name\?|#nome\?|null|nulo|none|nan|undefined|sem informa[cç][aã]o|n[aã]o informado|\?+)$/i;
const TOTAL_ROW_RX=/^(sub-?total|total|total geral|totais|soma|somat[oó]rio|grand total)\s*:?$/i;
const ID_COL_RX=/(^id\b|^id[_\s]|pedido|c[oó]d|n[uú]mero|nota fiscal|^nf\b|protocolo|transa[cç][aã]o|^n[ºo°.]\s)/i;
function autoClean(t){
  let cols=t.columns.map(c=>({...c,name:String(c.name).replace(/\s+/g,' ').trim()||c.name})), rows=t.rows.map(r=>r.slice());
  const log=[], L=(n,one,many)=>{ if(n) log.push((n===1?one:many).replace('{n}',nf.format(n))); };
  // 1. espaços sobrando e marcadores de vazio
  let sp=0, ph=0;
  rows=rows.map(r=>r.map(v=>{ if(typeof v!=='string') return v; const s=tidy(v); if(s!==v) sp++; if(s==='') return null; if(PLACEHOLDER_RX.test(s)){ ph++; return null; } return s; }));
  L(sp,'1 célula com espaços sobrando foi ajustada','{n} células com espaços sobrando foram ajustadas');
  L(ph,'1 marcador de vazio (como “-” ou “N/A”) virou célula vazia','{n} marcadores de vazio (como “-”, “N/A” ou “#REF!”) viraram células vazias');
  // 2. cabeçalho repetido no meio dos dados (tabelas coladas uma embaixo da outra)
  const hk=cols.map(c=>fold(c.name)); let hdr=0;
  rows=rows.filter(r=>{ let m=0,n=0; r.forEach((v,j)=>{ if(v!=null){ n++; if(fold(String(v))===hk[j]) m++; } }); if(n&&m>=Math.max(2,n*0.6)){ hdr++; return false; } return true; });
  L(hdr,'1 linha de cabeçalho repetida no meio dos dados foi removida','{n} linhas de cabeçalho repetidas no meio dos dados foram removidas');
  // 3. linhas de total/subtotal: só texto “Total” (e no máximo mais um texto) junto de números
  let tot=0;
  rows=rows.filter(r=>{ const txt=r.filter(v=>typeof v==='string'); if(txt.length&&txt.length<=2&&txt.some(v=>TOTAL_ROW_RX.test(v))&&r.some(v=>typeof v==='number')){ tot++; return false; } return true; });
  L(tot,'1 linha de total/subtotal foi removida (ela somaria os valores em dobro)','{n} linhas de total/subtotal foram removidas (elas somariam os valores em dobro)');
  // 4. linhas e colunas vazias
  const before=rows.length; rows=rows.filter(r=>!r.every(blankCell));
  L(before-rows.length,'1 linha vazia foi removida','{n} linhas vazias foram removidas');
  const keep=cols.map((c,j)=>rows.some(r=>!blankCell(r[j]))), ec=keep.filter(k=>!k).length;
  if (ec&&ec<cols.length){ const gone=cols.filter((_,j)=>!keep[j]).map(c=>c.name); cols=cols.filter((_,j)=>keep[j]); rows=rows.map(r=>r.filter((_,j)=>keep[j]));
    log.push(`${ec===1?'A coluna vazia':'As colunas vazias'} ${gone.map(n=>`“${n}”`).join(', ')} ${ec===1?'foi removida':'foram removidas'}`); }
  // 5. números e datas guardados como texto
  const fixed=[];
  cols.forEach((c,j)=>{ if(c.type!=='text'||/(pedido|n[uú]mero|c[oó]d|sku|^ref|nota|matr[ií]cula|^id\b|cpf|cnpj|cep|telefone|celular)/i.test(c.name)) return;
    const nt=detectType(c.name,rows.map(r=>r[j])); if(nt==='text') return;
    c.type=nt; for(const r of rows) r[j]=convert(r[j],nt); fixed.push(`“${c.name}” (${nt==='number'?'número':'data'})`); });
  if (fixed.length) log.push(`${fixed.length===1?'Coluna lida como texto passou':'Colunas lidas como texto passaram'} a ser tratada${fixed.length===1?'':'s'} pelo tipo certo: ${fixed.join(', ')}`);
  // 6. mesmo valor escrito de jeitos diferentes (maiúsculas, acentos, espaços)
  const sc=cleanScan({columns:cols},rows);
  if (sc.variants.length){ const map=new Map(); for(const v of sc.variants) for(const o of v.others) map.set(v.j+'|'+o,v.best);
    let n=0; rows=rows.map(r=>r.map((v,j)=>{ if(typeof v==='string'&&map.has(j+'|'+v)){ n++; return map.get(j+'|'+v); } return v; }));
    const ex=sc.variants.slice(0,2).map(v=>`“${v.others[0]}” → “${v.best}”`).join(', ');
    L(n,`1 valor escrito de outro jeito foi padronizado (${ex})`,`{n} valores escritos de jeitos diferentes foram padronizados (ex.: ${ex})`); }
  // 6b. CPF/CNPJ com dígito verificador errado (só avisa; não altera)
  cols.forEach((c,j)=>{ const cn=/cnpj/i.test(c.name), cp=/\bcpf\b/i.test(c.name); if(!cn&&!cp) return;
    let bad=0; for(const r of rows){ const v=r[j]; if(v==null||v==='') continue; const d=onlyDigits(v);
      const ok=cn&&cp?(d.length<=11?cpfOk(d.padStart(11,'0')):cnpjOk(d.padStart(14,'0'))):cn?cnpjOk(d.padStart(14,'0')):cpfOk(d.padStart(11,'0')); if(!ok) bad++; }
    if (bad) log.push(`${nf.format(bad)} ${bad===1?'valor':'valores'} da coluna “${c.name}” ${bad===1?'tem':'têm'} número inválido (o dígito verificador não confere): vale conferir na tabela`); });
  // 7. linhas idênticas
  const seen=new Set(); let dup=0; const idj=cols.findIndex(c=>ID_COL_RX.test(c.name));
  const out=[]; for(const r of rows){ const k=JSON.stringify(r); if(seen.has(k)){ dup++; if(idj>=0) continue; } else seen.add(k); out.push(r); }
  let dupLeft=0;
  if (dup&&idj>=0){ rows=out; L(dup,`1 linha duplicada (mesmo “${cols[idj].name}” e mesmos valores) foi removida`,`{n} linhas duplicadas (mesmo “${cols[idj].name}” e mesmos valores) foram removidas`); }
  else dupLeft=dup;
  return {...t,columns:cols,rows,cleanLog:log,dupLeft};
}
const cleanInfo=t=>t.cleanLog&&(t.cleanLog.length||t.dupLeft)?{at:Date.now(),items:t.cleanLog,dup:t.dupLeft||0}:null;
function cleanNote(meta){
  const c=meta.cleanLog; if(!c) return null;
  const box=el('details',{class:'clean-note'},
    el('summary',{},el('span',{class:'cn-ic','aria-hidden':'true',text:'✓'}),el('b',{text:'Dados higienizados na importação'}),
      el('span',{class:'muted',text:` · ${c.items.length} ${c.items.length===1?'ajuste':'ajustes'}${c.dup?` · ${c.dup} ${c.dup===1?'linha repetida':'linhas repetidas'} para conferir`:''}`})),
    el('ul',{},c.items.map(s=>el('li',{text:s+'.'}))),
    c.dup?el('p',{class:'cn-dup',text:`Há ${nf.format(c.dup)} ${c.dup===1?'linha idêntica a outra':'linhas idênticas a outras'}. Mantivemos porque a base não tem coluna de identificação (como pedido ou código) e podem ser registros repetidos de verdade. Se forem cópias, use “Limpar dados”.`}):null,
    S.readOnly?null:el('button',{class:'btn sm',onclick:()=>{ const m=structuredClone(meta); delete m.cleanLog; m.columns=m.columns.filter(x=>!x.virtual); const i=S.bases.findIndex(b=>b.id===m.id); if(i>=0) S.bases[i]=structuredClone(m); saveMeta(m).catch(handleWriteError); box.remove(); }},'Entendi, ocultar'));
  return box;
}

export { ID_COL_RX, PLACEHOLDER_RX, TOTAL_ROW_RX, autoClean, cleanInfo, cleanNote };
