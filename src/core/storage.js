import { renderSidebar } from '../app/render.js';
import { S } from './state.js';
import { toast } from './utils.ts';
import { applyCalcs } from '../features/calc-columns.js';
import { deleteVersion, setBaseline, snapshotVersion, verCol } from '../features/history.js';
import { scheduleShare } from '../features/share.js';

/* ============ Armazenamento ============ */
const enc=new TextEncoder();
const MAX_CHUNK=190*1024;
function chunkRows(rows){
  const chunks=[]; let cur=[], size=20;
  for (const r of rows){ const s=enc.encode(JSON.stringify(r)).length+1; if(cur.length && size+s>MAX_CHUNK){chunks.push(cur);cur=[];size=20;} cur.push(r); size+=s; }
  if (cur.length||!chunks.length) chunks.push(cur);
  return chunks;
}
const basesCol = () => S.db.doc(`data/users/${S.uid}/app`).collection('bases');
const chunkCol = id => basesCol().doc(id).collection('chunks');
const cid = i => String(i).padStart(4,'0');
let writeChain=Promise.resolve();
function queue(fn){ const p=writeChain.then(fn); writeChain=p.catch(()=>{}); return p; }
async function retry(fn){ try{ return await fn(); }catch(e){ if(e&&e.code==='unavailable'){ await new Promise(r=>setTimeout(r,400+Math.random()*600)); return fn(); } throw e; } }
function handleWriteError(e){
  console.error(e);
  if (e && e.code==='permission-denied') toast('Não foi possível salvar: sua conta não tem permissão aqui. Saia e entre de novo; se continuar, fale com quem administra o painel.',true,7000);
  else if (e && e.code==='unauthenticated'){ toast('Sua sessão expirou. Entre novamente com o Google.',true,7000); }
  else if (e && e.code==='resource-exhausted') toast('O espaço para guardar planilhas acabou. Exclua planilhas antigas que você não usa mais e tente de novo.',true,7000);
  else toast('Não foi possível salvar agora. Confira sua internet e tente de novo em instantes.',true,6000);
}

async function saveBase(meta, rows, reason){
  applyCalcs(meta,rows); // colunas calculadas sempre atualizadas com os dados
  await snapshotVersion(meta,reason); // guarda a versão anterior (histórico)
  meta.rowCount=rows.length; meta.updatedAt=Date.now();
  if (S.mode!=='cloud'){ S.local[meta.id]={meta:structuredClone(meta),rows:rows.map(r=>r.slice())}; upsertLocalMeta(meta); if(meta.id===S.currentId) setBaseline(meta,rows); return; }
  return queue(async()=>{
    const chunks=chunkRows(rows);
    const old=S.bases.find(b=>b.id===meta.id)?.chunkCount||0;
    // Firestore não aceita array dentro de array: cada bloco de linhas vai como texto JSON
    for (let i=0;i<chunks.length;i++) await retry(()=>chunkCol(meta.id).doc(cid(i)).set({json:JSON.stringify(chunks[i])}));
    meta.chunkCount=chunks.length;
    await retry(()=>basesCol().doc(meta.id).set(meta));
    for (let i=chunks.length;i<old;i++) await retry(()=>chunkCol(meta.id).doc(cid(i)).delete());
  }).then(()=>{ scheduleShare(meta); if(meta.id===S.currentId) setBaseline(meta,rows); });
}
async function saveMeta(meta){
  meta.updatedAt=Date.now();
  if (S.mode!=='cloud'){ if(S.local[meta.id]) S.local[meta.id].meta=structuredClone(meta); upsertLocalMeta(meta); return; }
  return queue(()=>retry(()=>basesCol().doc(meta.id).set(meta))).then(()=>scheduleShare(meta));
}
async function deleteBase(meta){
  if (S.mode!=='cloud'){ delete S.local[meta.id]; S.bases=S.bases.filter(b=>b.id!==meta.id); return; }
  return queue(async()=>{
    try{ for (const v of (await verCol(meta.id).get()).docs.map(d=>d.data())) await deleteVersion(meta.id,v); }catch(e){ console.warn(e); } // histórico junto
    await retry(()=>basesCol().doc(meta.id).delete());
    for (let i=0;i<(meta.chunkCount||0);i++) await retry(()=>chunkCol(meta.id).doc(cid(i)).delete());
  });
}
async function loadRows(meta){
  if (S.mode!=='cloud') return (S.local[meta.id]?.rows||[]).map(r=>r.slice());
  const snap=await retry(()=>chunkCol(meta.id).get());
  const docs=snap.docs.filter(d=>d.exists && parseInt(d.id,10)<(meta.chunkCount||1e9)).sort((a,b)=>a.id<b.id?-1:1);
  const rows=[]; for (const d of docs){ const x=d.data(); for (const r of (x.json?JSON.parse(x.json):(x.rows||[]))) rows.push(r.slice()); }
  return rows;
}
function upsertLocalMeta(meta){ const i=S.bases.findIndex(b=>b.id===meta.id); const m=structuredClone(meta); if(i<0) S.bases.unshift(m); else S.bases[i]=m; renderSidebar(); }

export { MAX_CHUNK, basesCol, chunkCol, chunkRows, cid, deleteBase, enc, handleWriteError, loadRows, queue, retry, saveBase, saveMeta, upsertLocalMeta, writeChain };
