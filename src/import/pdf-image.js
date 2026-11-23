import { tyIcon } from '../app/render.js';
import { el, nf } from '../core/utils.ts';
import { display, findDate, parseDate, parseNum } from '../core/values.ts';
import { categorizeTable } from '../features/categorize.js';
import { tableFromAoa } from './spreadsheet.js';

/* ============ Leitura de PDF e imagens ============
   PDF com texto: PDF.js (posição de cada trecho na página).
   Imagem ou PDF escaneado: OCR com Tesseract.js (português).
   Em ambos os casos a tabela é remontada pela posição: o cabeçalho define as colunas
   e cada linha de dados é ancorada na coluna mais "regular" (hora, data ou valor). */
const DOC_EXT=['pdf','png','jpg','jpeg','webp','bmp','gif'];
const libCache={};
function loadScript(src){
  return libCache[src]||(libCache[src]=new Promise((ok,err)=>{
    const s=document.createElement('script'); s.src=src; s.onload=ok;
    s.onerror=()=>{ delete libCache[src]; s.remove(); err(Object.assign(new Error('lib'),{code:'lib-load'})); };
    document.head.append(s);
  }));
}
async function getPdfjs(){
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  return pdfjsLib;
}
let ocrWorkerP=null, ocrProgress=null;
async function getOcr(){
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
  if (!ocrWorkerP) ocrWorkerP=Tesseract.createWorker('por',1,{logger:m=>{ if(m.status==='recognizing text'&&ocrProgress) ocrProgress(m.progress||0); }}).catch(e=>{ ocrWorkerP=null; throw e; });
  return ocrWorkerP;
}
async function ocrItems(src,onProgress){
  const w=await getOcr(); ocrProgress=onProgress;
  try{
    const {data}=await w.recognize(src);
    return (data.words||[]).filter(x=>x.text&&x.text.trim()&&x.confidence>10)
      .map(x=>({str:x.text.trim(),x0:x.bbox.x0,x1:x.bbox.x1,y:x.bbox.y1,h:Math.max(1,x.bbox.y1-x.bbox.y0)}));
  } finally { ocrProgress=null; }
}
async function prepImage(file){
  try{
    const bmp=await createImageBitmap(file);
    const sc=bmp.width<1600?Math.min(3,1600/bmp.width):1; // amplia imagens pequenas para o OCR acertar mais
    const cv=document.createElement('canvas'); cv.width=Math.round(bmp.width*sc); cv.height=Math.round(bmp.height*sc);
    const ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height); ctx.drawImage(bmp,0,0,cv.width,cv.height);
    return cv;
  }catch(e){ return file; }
}
async function pdfPages(file,status){
  const lib=await getPdfjs();
  const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const pages=[]; let ocr=false;
  for (let p=1;p<=pdf.numPages;p++){
    status(`Lendo PDF: página ${p} de ${pdf.numPages}…`);
    const page=await pdf.getPage(p); const vp=page.getViewport({scale:1});
    const tc=await page.getTextContent();
    let items=tc.items.filter(it=>it.str&&it.str.trim()).map(it=>{ const t=it.transform; return {str:it.str,x0:t[4],x1:t[4]+(it.width||0),y:vp.height-t[5],h:Math.hypot(t[2],t[3])||it.height||10}; });
    if (items.map(i=>i.str).join('').replace(/\s/g,'').length<20){ // página sem texto: é imagem escaneada
      ocr=true;
      const vp2=page.getViewport({scale:2.5}); const cv=document.createElement('canvas'); cv.width=vp2.width; cv.height=vp2.height;
      const ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
      await page.render({canvasContext:ctx,viewport:vp2}).promise;
      items=await ocrItems(cv,pr=>status(`Reconhecendo texto (OCR): página ${p} de ${pdf.numPages} · ${Math.round(pr*100)}%`));
    }
    pages.push(items);
  }
  return {pages,ocr};
}
// agrupa trechos em linhas (mesma altura) e junta palavras próximas em "frases"
function toLines(items){
  const sorted=[...items].sort((a,b)=>a.y-b.y||a.x0-b.x0);
  const lines=[];
  for (const it of sorted){ const ln=lines[lines.length-1]; if(ln&&Math.abs(it.y-ln.y)<=Math.max(2,0.4*Math.min(it.h,ln.h))) ln.items.push(it); else lines.push({y:it.y,h:it.h,items:[it]}); }
  for (const ln of lines){
    ln.items.sort((a,b)=>a.x0-b.x0);
    const ph=[];
    for (const it of ln.items){
      const last=ph[ph.length-1], s=it.str.trim(); if(!s) continue;
      const gap=last?it.x0-last.x1:Infinity;
      if (last&&gap<Math.max(it.h,last.h)*0.8){ last.str+=(gap>Math.min(it.h,last.h)*0.12?' ':'')+s; last.x1=Math.max(last.x1,it.x1); }
      else ph.push({str:s,x0:it.x0,x1:it.x1,y:it.y,h:it.h});
    }
    ln.ph=ph; ln.text=ph.map(p=>p.str).join(' ');
  }
  return lines.filter(l=>l.ph.length);
}
const HEAD_RX=/^(data|dt\b|dia\b|hora|hor[aá]rio|tipo|descri|hist[oó]rico|lan[cç]amento|origem|destino|favorecido|benefici|documento|doc\b|n[ºo°.]|n[uú]mero|valor|vlr|saldo|d[eé]bito|cr[eé]dito|entrada|sa[ií]da|forma|categoria|estabelecimento|parcela|quantidade|qtd|pre[cç]o|total|produto|item|cliente|vencimento|status|situa|ag[eê]ncia|conta|opera[cç]|natureza|referente|identifica|movimenta|nome|cpf|cnpj|pagador|recebedor)/i;
function isHeaderLine(ln){
  if (ln.ph.length<3) return false;
  let k=0; for (const p of ln.ph){ if(/\d/.test(p.str)) return false; if(HEAD_RX.test(p.str)) k++; }
  return k>=2 && k>=ln.ph.length*0.5;
}
// tipo de valor "atômico" de uma célula: hora, data ou número (null = texto livre)
function atomKind(s){
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return 'time';
  if (/^\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?$/.test(s)||/^\d{4}-\d{2}-\d{2}$/.test(s)||(s.length<=24&&/^\d{1,2}\s*(de\s+)?[a-zç]{3,}\.?\s*(de\s+)?\d{4}$/i.test(s)&&parseDate(s))) return 'date';
  if (!isNaN(parseNum(s))) return 'num';
  return null;
}
const isAtom=s=>!!atomKind(s);
function colOf(cols,p){
  let best=-1,bo=0;
  cols.forEach((c,i)=>{ const o=Math.min(c.x1,p.x1)-Math.max(c.x0,p.x0); if(o>bo){bo=o;best=i;} });
  if (best>=0) return best;
  let bd=Infinity; const cx=(p.x0+p.x1)/2;
  cols.forEach((c,i)=>{ const d=cx<c.x0?c.x0-cx:cx>c.x1?cx-c.x1:0; if(d<bd){bd=d;best=i;} });
  return best;
}
function segmentRows(cols,body){
  const ph=[]; body.forEach(l=>l.ph.forEach(p=>ph.push({...p,c:colOf(cols,p)})));
  if (!ph.length) return [];
  const cnt=cols.map(()=>0); ph.forEach(p=>{ if(isAtom(p.str)) cnt[p.c]++; });
  let ac=0; cnt.forEach((n,i)=>{ if(n>cnt[ac]) ac=i; });
  if (!cnt[ac]) return [];
  // só vale como âncora o mesmo tipo dominante da coluna (ex.: só horas), para não pegar datas de rodapé
  const kinds={}; ph.forEach(p=>{ if(p.c===ac){ const k=atomKind(p.str); if(k) kinds[k]=(kinds[k]||0)+1; } });
  const kind=Object.keys(kinds).sort((a,b)=>kinds[b]-kinds[a])[0];
  const anchors=ph.filter(p=>p.c===ac&&atomKind(p.str)===kind).sort((a,b)=>a.y-b.y);
  const ys=[]; anchors.forEach(a=>{ if(!ys.length||a.y-ys[ys.length-1]>a.h*0.6) ys.push(a.y); });
  const gaps=ys.slice(1).map((y,i)=>y-ys[i]).sort((a,b)=>a-b);
  const sp=gaps.length?gaps[gaps.length>>1]:anchors[0].h*3;
  const rows=ys.map(()=>cols.map(()=>[]));
  for (const p of ph){
    let bi=-1,bd=Infinity; ys.forEach((y,i)=>{ const d=Math.abs(p.y-y); if(d<bd){bd=d;bi=i;} });
    if (bd>sp*0.6+0.5) continue; // longe de qualquer linha de dados: rodapé, títulos etc.
    rows[bi][p.c].push(p);
  }
  return rows.map(r=>r.map(ps=>ps.sort((a,b)=>a.y-b.y||a.x0-b.x0).map(p=>p.str).join(' ')||null));
}
function extractTables(pagesLines){
  const segs=[]; let lastCols=null, ctxDate=null;
  pagesLines.forEach(lines=>{
    const hIdx=lines.map((l,i)=>isHeaderLine(l)?i:-1).filter(i=>i>=0);
    const starts=hIdx.length?hIdx:(lastCols?[-1]:[]);
    starts.forEach((hi,k)=>{
      const cols=hi>=0?lines[hi].ph.map(p=>({name:p.str,x0:p.x0,x1:p.x1})):lastCols;
      for (let i=k>0?starts[k-1]+1:0;i<hi;i++){ const d=findDate(lines[i].text); if(d) ctxDate=d; } // data do grupo (ex.: "04 de novembro 2026")
      const end=k+1<starts.length?starts[k+1]:lines.length;
      const rows=segmentRows(cols,lines.slice(hi+1,end));
      if (rows.length) segs.push({cols,rows,date:ctxDate});
      lastCols=cols;
    });
  });
  const groups=new Map();
  for (const s of segs){
    const key=s.cols.map(c=>c.name.toLowerCase()).join('|');
    if (!groups.has(key)) groups.set(key,{cols:s.cols.map(c=>c.name),rows:[]});
    for (const r of s.rows) groups.get(key).rows.push({r,date:s.date});
  }
  return [...groups.values()].map(g=>{
    const addDate=!g.cols.some(n=>/^(data|dt\b|dia\b)/i.test(n)) && g.rows.some(x=>x.date);
    return [addDate?['Data',...g.cols]:g.cols, ...g.rows.map(x=>addDate?[x.date,...x.r]:x.r)];
  });
}
// sem cabeçalho reconhecível: tenta linhas "data  descrição  valor  [saldo]"; senão, uma linha por registro
function fallbackTable(lines,year){
  const money='((?:[+\\-]\\s?)?(?:R\\$\\s?)?[+\\-]?\\d{1,3}(?:\\.\\d{3})*,\\d{2}(?:\\s?[DC-])?)';
  const rx=new RegExp(`^(\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)\\s+(.+?)\\s+${money}(?:\\s+${money})?$`,'i');
  const rows=[];
  for (const l of lines){ const m=l.text.replace(/[−–]/g,'-').match(rx); if(m){ let d=m[1]; if(d.split('/').length===2&&year) d+='/'+year; rows.push([d,m[2],m[3],m[4]||null]); } }
  if (rows.length>=2){ const saldo=rows.some(r=>r[3]); return {aoa:[['Data','Descrição','Valor',...(saldo?['Saldo']:[])],...rows.map(r=>saldo?r:r.slice(0,3))],structured:true}; }
  return {aoa:[['Texto'],...lines.map(l=>[l.text])],structured:false};
}
// extratos: cria a coluna "Movimento" (Entrada/Saída) a partir do sinal do valor
function enrichStatement(t){
  const nums=t.columns.map((c,j)=>({c,j})).filter(o=>o.c.type==='number');
  const v=nums.find(o=>/valor|vlr|montante|quantia|amount/i.test(o.c.name))||(nums.length===1?nums[0]:null);
  if (!v||t.columns.some(c=>/^movimento$/i.test(c.name))) return;
  let pos=0,neg=0; for (const r of t.rows){ const x=r[v.j]; if(typeof x==='number'){ if(x>0)pos++; else if(x<0)neg++; } }
  if (!pos||!neg) return;
  t.columns.splice(v.j+1,0,{name:'Movimento',type:'text'});
  t.rows=t.rows.map(r=>{ const x=r[v.j], a=r.slice(); a.splice(v.j+1,0,typeof x==='number'&&x!==0?(x<0?'Saída':'Entrada'):null); return a; });
}
async function readDocument(file,status){
  const ext=file.name.split('.').pop().toLowerCase();
  let pages, method;
  if (ext==='pdf'){ const r=await pdfPages(file,status); pages=r.pages; method=r.ocr?'ocr':'texto'; }
  else { status('Preparando imagem…'); const img=await prepImage(file); status('Carregando leitor de imagem (OCR)…'); pages=[await ocrItems(img,pr=>status(`Reconhecendo texto da imagem (OCR)… ${Math.round(pr*100)}%`))]; method='ocr'; }
  const lines=pages.map(toLines);
  const text=lines.map(ls=>ls.map(l=>l.text).join('\n')).join('\n\n— nova página —\n\n');
  const year=(text.match(/\b(20\d{2})\b/)||[])[1];
  let aoas=extractTables(lines), structured=true;
  if (!aoas.length){ const fb=fallbackTable(lines.flat(),year); aoas=[fb.aoa]; structured=fb.structured; }
  const base=file.name.replace(/\.[^.]+$/,''), tables=[];
  aoas.forEach((aoa,i)=>{ if(aoa.length<2) return; const t=tableFromAoa(aoa); if(!t) return; enrichStatement(t); categorizeTable(t); t.name=aoas.length>1?`${base} — tabela ${i+1}`:base; t.fileName=file.name; tables.push(t); });
  return {tables,method,text,pages:pages.length,structured};
}
function previewDocImport(file,res){
  return new Promise(resolve=>{
    const bg=el('div',{class:'modal-bg'});
    const onKey=e=>{ if(e.key==='Escape') finish(false); };
    const finish=v=>{ bg.remove(); document.removeEventListener('keydown',onKey); resolve(v); };
    bg.addEventListener('click',e=>{ if(e.target===bg) finish(false); });
    document.addEventListener('keydown',onKey);
    const total=res.tables.reduce((s,t)=>s+t.rows.length,0);
    const parts=[
      el('div',{class:'doc-meta'},
        el('span',{class:'chip',text:`${res.pages} ${res.pages===1?'página':'páginas'}`}),
        el('span',{class:'chip',text:res.method==='ocr'?'Lido por imagem (OCR)':'Texto do PDF'}),
        el('span',{class:'chip',text:`${nf.format(total)} ${total===1?'linha':'linhas'}`}),
        res.tables.length>1?el('span',{class:'chip',text:`${res.tables.length} tabelas`}):null)];
    if (!res.structured) parts.push(el('div',{class:'doc-warn',text:'Não encontramos uma tabela organizada neste arquivo. Cada linha de texto será importada como um registro na coluna "Texto".'}));
    else if (res.method==='ocr') parts.push(el('div',{class:'doc-warn',text:'O texto foi lido a partir da imagem. Confira nomes e valores: o reconhecimento pode errar em imagens borradas ou tortas.'}));
    for (const t of res.tables){
      const show=t.rows.slice(0,12);
      parts.push(el('div',{class:'doc-tbl-head'},el('b',{text:t.name}),el('span',{class:'muted',text:` · ${nf.format(t.rows.length)} linhas · ${t.columns.length} colunas`})));
      parts.push(el('div',{class:'table-card doc-tbl'},el('div',{class:'table-scroll',style:'max-height:300px;min-height:0'},el('table',{class:'data'},
        el('thead',{},el('tr',{},t.columns.map(c=>el('th',{class:c.type==='number'?'num':''},tyIcon(c.type),c.name)))),
        el('tbody',{},show.map(r=>el('tr',{},r.map((v,j)=>el('td',{class:t.columns[j].type==='number'?'num':''},v==null||v===''?el('span',{class:'null',text:'—'}):display(v,t.columns[j].type))))))))));
      if (t.rows.length>show.length) parts.push(el('div',{class:'muted',style:'font-size:12px;margin-top:4px',text:`+ ${nf.format(t.rows.length-show.length)} linhas não mostradas na prévia`}));
    }
    parts.push(el('details',{class:'doc-raw'},el('summary',{text:'Ver texto extraído do arquivo'}),el('pre',{text:res.text.slice(0,30000)})));
    const m=el('div',{class:'modal wide',role:'dialog','aria-modal':'true'},
      el('h3',{text:`Importar “${file.name}”`}),
      el('p',{text:'Confira se as colunas e valores foram lidos corretamente. Depois de importar, você pode ajustar tipos de coluna e editar células na aba Dados.'}),
      ...parts,
      el('div',{class:'actions'},el('button',{class:'btn',onclick:()=>finish(false)},'Cancelar'),el('button',{class:'btn primary',onclick:()=>finish(true),disabled:!res.tables.length},'Importar como base')));
    bg.append(m); document.body.append(bg);
  });
}

export { DOC_EXT, HEAD_RX, atomKind, colOf, enrichStatement, extractTables, fallbackTable, getOcr, getPdfjs, isAtom, isHeaderLine, libCache, loadScript, ocrItems, ocrProgress, ocrWorkerP, pdfPages, prepImage, previewDocImport, readDocument, segmentRows, toLines };
