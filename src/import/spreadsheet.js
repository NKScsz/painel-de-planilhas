import { convert, detectType, pad, parseDate } from '../core/values.ts';
import { fold } from '../features/extras.js';

/* ============ Leitura da planilha ============ */
async function readWorkbook(file){
  const ext=file.name.split('.').pop().toLowerCase();
  let wb;
  if (['csv','tsv','txt'].includes(ext)){
    const buf=await file.arrayBuffer();
    let text=new TextDecoder('utf-8').decode(buf);
    if (text.includes(String.fromCharCode(0xFFFD))) text=new TextDecoder('windows-1252').decode(buf);
    wb=XLSX.read(text,{type:'string',raw:true});
  } else {
    wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  }
  const out=[];
  for (const sn of wb.SheetNames){
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:false});
    const t=tableFromAoa(aoa); if(!t) continue;
    const base=file.name.replace(/\.[^.]+$/,'');
    t.name = wb.SheetNames.length>1 ? `${base} — ${sn}` : base;
    t.fileName=file.name; t.sheet=sn;
    out.push(t);
  }
  return out;
}
/* Planilha com várias abas (ex.: uma por mês): junta numa base só, com uma coluna dizendo de qual aba veio
   cada linha ("Mês" quando as abas são meses; vira data se der para saber o ano). Só junta abas com as mesmas
   colunas; abas de resumo/total e abas com outro formato viram bases separadas, para não somar nada em dobro. */
const MES_FULL=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function sheetMonth(name){
  const s=fold(name).trim(); let m=-1, y=(s.match(/(20\d{2})/)||[])[1]||null;
  MES_FULL.forEach((n,i)=>{ if(m<0&&(s.includes(n)||new RegExp('(^|[^a-z])'+n.slice(0,3)+'([^a-z]|$)').test(s))) m=i; });
  if (m>=0&&!y){ const yy=s.match(/[^0-9](\d{2})$/); if(yy) y='20'+yy[1]; }
  if (m<0){ let n=s.match(/^(\d{1,2})\s*[\/\-. ]\s*(20\d{2}|\d{2})$/); if(n){ m=+n[1]-1; y=n[2].length===2?'20'+n[2]:n[2]; }
    else if((n=s.match(/^(20\d{2})\s*[\/\-. ]\s*(\d{1,2})$/))){ y=n[1]; m=+n[2]-1; } }
  return m>=0&&m<12?{m,y}:null;
}
const SUMMARY_RX=/total|resumo|consolid|geral|dashboard|gr[aá]fico|painel|instru[cç]|capa|[ií]ndice|par[aâ]metro|legenda|tabela din/i;
function mergeSheets(list,fileName){
  if (list.length<2) return {tables:list,merged:0};
  const key=s=>fold(s).replace(/\s+/g,' ').trim();
  const main=list.filter(t=>!SUMMARY_RX.test(t.sheet)).reduce((a,b)=>!a||b.rows.length>a.rows.length?b:a,null)||list[0];
  const mk=new Set(main.columns.map(c=>key(c.name)));
  const join=[], apart=[];
  for (const t of list){
    const k=t.columns.map(c=>key(c.name)), hit=k.filter(x=>mk.has(x)).length/Math.max(k.length,mk.size);
    if (t===main||(!SUMMARY_RX.test(t.sheet)&&hit>=0.6)) join.push(t); else apart.push(t);
  }
  if (join.length<2) return {tables:list,merged:0};
  // colunas: as da aba principal e depois as que só existem em outras abas
  const cols=[], idx=new Map();
  for (const t of join) for (const c of t.columns){ const k=key(c.name); if(!idx.has(k)){ idx.set(k,cols.length); cols.push({name:c.name,types:[]}); } cols[idx.get(k)].types.push(c.type); }
  for (const c of cols){ const n={}; c.types.forEach(t=>n[t]=(n[t]||0)+1); c.type=n.text&&Object.keys(n).length>1?'text':Object.entries(n).sort((a,b)=>b[1]-a[1])[0][0]; delete c.types; }
  // coluna de origem: "Mês" (data quando há ano) ou "Aba"
  const months=join.map(t=>sheetMonth(t.sheet)), isMonth=months.filter(Boolean).length>=Math.ceil(join.length*0.6);
  const fileYear=(String(fileName||'').match(/(20\d{2})/)||[])[1]||null;
  const asDate=isMonth&&months.every(x=>x&&(x.y||fileYear));
  let src=isMonth?'Mês':'Aba'; while(cols.some(c=>key(c.name)===key(src))) src+=' (aba)';
  cols.push({name:src,type:asDate?'date':'text'});
  const rows=[];
  join.forEach((t,ti)=>{
    const map=t.columns.map(c=>idx.get(key(c.name)));
    const tag=asDate?`${months[ti].y||fileYear}-${pad(months[ti].m+1)}-01`:t.sheet;
    for (const r of t.rows){ const a=new Array(cols.length).fill(null); r.forEach((v,j)=>{ const ci=map[j]; a[ci]=t.columns[j].type===cols[ci].type?v:convert(v,cols[ci].type); }); a[cols.length-1]=tag; rows.push(a); }
  });
  const base=String(fileName||'planilha').replace(/\.[^.]+$/,'');
  const merged={columns:cols,rows,name:base,fileName,sheet:join.map(t=>t.sheet).join(', '),mergedSheets:join.map(t=>t.sheet),srcCol:src};
  return {tables:[merged,...apart],merged:join.length,apart:apart.map(t=>t.sheet),srcCol:src};
}
function tableFromAoa(aoa){
  aoa=aoa.filter(r=>r && r.some(c=>c!=null && String(c).trim()!==''));
  if (!aoa.length) return null;
  // linha de cabeçalho: a com mais células preenchidas entre as 10 primeiras
  let hi=0,best=-1;
  for (let i=0;i<Math.min(10,aoa.length);i++){ const c=aoa[i].filter(x=>x!=null&&String(x).trim()!=='').length; if(c>best+0){ if(c>best){best=c;hi=i;} } }
  const width=Math.max(...aoa.map(r=>r.length));
  const hdr=aoa[hi]; const seen={};
  let names=[];
  for (let j=0;j<width;j++){
    let n=hdr[j]; n=(n==null||String(n).trim()==='')?`Coluna ${j+1}`:(n instanceof Date?parseDate(n):String(n).trim());
    if (seen[n]){ seen[n]++; n=`${n} (${seen[n]})`; } else seen[n]=1;
    names.push(n);
  }
  let body=aoa.slice(hi+1).map(r=>{ const a=new Array(width); for(let j=0;j<width;j++) a[j]=r[j]==null?null:r[j]; return a; });
  // remove colunas totalmente vazias e sem nome real
  const keep=names.map((n,j)=>!(n.startsWith('Coluna ') && body.every(r=>r[j]==null||r[j]==='')));
  names=names.filter((_,j)=>keep[j]); body=body.map(r=>r.filter((_,j)=>keep[j]));
  if (!names.length) return null;
  const columns=names.map((name,j)=>({name,type:detectType(name,body.map(r=>r[j]))}));
  const rows=body.map(r=>r.map((v,j)=>convert(v,columns[j].type)));
  return {columns,rows};
}

export { MES_FULL, SUMMARY_RX, mergeSheets, readWorkbook, sheetMonth, tableFromAoa };
