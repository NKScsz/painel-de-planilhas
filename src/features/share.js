import { currentMeta, profileName, setStatus } from '../app/init.js';
import { confirmBox } from '../app/modals.js';
import { icon, render } from '../app/render.js';
import { exportChartsPdf, hashStr } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { chunkRows, cid, handleWriteError, retry, saveMeta } from '../core/storage.js';
import { el, fmtWhen, nf, toast } from '../core/utils.ts';
import { convert } from '../core/values.ts';
import { brand, lum } from './brand.js';
import { formModal } from './extras.js';
import { fetchSheetTable } from './google-sheets.js';
import { keepAwake } from './tv-mode.js';
import { renderViz } from '../views/charts-tab.js';
import { vizData } from '../views/data-model.js';

/* ----- Link de compartilhamento (somente leitura, sem login) ----- */
const shareRef=t=>S.db.collection('shares').doc(t);
// endereço do app (raiz no Firebase, subpasta no GitHub Pages)
const appUrl=()=>location.origin+location.pathname.replace(/[^/]*$/,'');
const shareUrl=t=>`${appUrl()}?v=${t}`;
function newToken(){ const a=new Uint8Array(18); crypto.getRandomValues(a); return [...a].map(b=>'abcdefghijkmnpqrstuvwxyz23456789'[b%32]).join(''); }
const shareSig={}; let shareTimer=null;
function scheduleShare(meta){
  if (!meta||!meta.share||!meta.share.token||S.mode!=='cloud') return;
  clearTimeout(shareTimer);
  shareTimer=setTimeout(()=>{ const m=currentMeta(); if(m&&m.id===meta.id&&m.share&&S.rows&&!S.dirty) publishShare(m,S.rows).catch(e=>console.error(e)); },2500);
}
async function publishShare(meta,rows){
  const tok=meta.share.token, vd=vizData(meta,rows), pf=S.profile||{}, br=brand();
  const data=JSON.parse(JSON.stringify({owner:S.uid,baseId:meta.id,name:meta.name,fileName:meta.fileName||'',
    columns:vd.vmeta.columns.map(c=>({name:c.name,type:c.type})),charts:meta.charts||[],goals:meta.goals||[],rowCount:vd.rows.length,tv:meta.tv||null,
    // base do Google Sheets sem colunas de outras bases: a TV pode reler a planilha sozinha
    source:meta.source&&meta.source.type==='gsheet'&&vd.vmeta.columns.length===meta.columns.length?{type:'gsheet',id:meta.source.id,gid:meta.source.gid}:null,
    by:{name:profileName(),role:pf.role||'',company:pf.company||'',brand:{name:br.name,color:br.custom?br.color:'',logo:br.logo,lw:br.lw,lh:br.lh}}}));
  const json=JSON.stringify(vd.rows), sig=JSON.stringify(data).length+':'+hashStr(JSON.stringify(data))+':'+json.length+':'+hashStr(json);
  if (shareSig[tok]===sig) return; // nada mudou desde a última publicação
  const chunks=chunkRows(vd.rows), ref=shareRef(tok);
  const prev=await ref.get().catch(()=>null), old=prev&&prev.exists?(prev.data().chunkCount||0):0;
  // o documento principal é gravado por último: quem acompanha ao vivo (TV) só recarrega com os blocos já prontos
  if (!prev||!prev.exists) await ref.set({...data,chunkCount:0,updatedAt:0}); // as regras exigem o dono antes dos blocos
  for (let i=0;i<chunks.length;i++) await retry(()=>ref.collection('chunks').doc(cid(i)).set({json:JSON.stringify(chunks[i])}));
  await ref.set({...data,chunkCount:chunks.length,updatedAt:Date.now()});
  for (let i=chunks.length;i<old;i++) await retry(()=>ref.collection('chunks').doc(cid(i)).delete());
  shareSig[tok]=sig;
}
async function unpublishShare(tok){
  const ref=shareRef(tok), d=await ref.get(); if(!d.exists) return;
  for (let i=0;i<(d.data().chunkCount||0);i++) await retry(()=>ref.collection('chunks').doc(cid(i)).delete());
  await ref.delete(); delete shareSig[tok];
}
async function enableShare(){
  const m2=structuredClone(currentMeta()); m2.share={token:newToken(),at:Date.now()}; m2.columns=m2.columns.filter(c=>!c.virtual);
  await publishShare(m2,S.rows); const i=S.bases.findIndex(b=>b.id===m2.id); if(i>=0) S.bases[i]=structuredClone(m2);
  await saveMeta(m2); return m2;
}
function shareDialog(meta){
  if (S.mode!=='cloud'){ toast('Entre com sua conta Google para criar links de compartilhamento.',true); return; }
  const body=el('div',{class:'share-box'});
  const dlg=formModal('Compartilhar painel','',body,null,null,'share-modal');
  const draw=()=>{
    const m=currentMeta(); body.innerHTML='';
    if (!m||m.id!==meta.id){ dlg.close(); return; }
    if (!m.share||!m.share.token){
      body.append(
        el('p',{text:'Crie um link para mostrar este painel a clientes, sócios ou à equipe. Quem abrir não precisa de conta.'}),
        el('ul',{class:'share-list'},
          el('li',{text:'A pessoa vê os indicadores, as metas e os gráficos (aba Gráficos) e pode usar os filtros.'}),
          el('li',{text:'Não dá para editar nada. Quando você muda os dados ou os gráficos, o link se atualiza sozinho.'}),
          el('li',{text:'Os dados desta base ficam acessíveis para quem tiver o link, junto com seu nome e empresa. Envie só para quem pode ver.'}),
          el('li',{text:'Você pode desativar o link quando quiser.'})),
        el('button',{class:'btn primary',onclick:async e=>{ const b=e.currentTarget; b.disabled=true; b.textContent='Criando link…';
          try{ await enableShare(); draw(); toast('Link criado.'); }
          catch(err){ console.error(err); b.disabled=false; b.textContent='Criar link'; handleWriteError(err); } }},'Criar link'));
      return;
    }
    const url=shareUrl(m.share.token), inp=el('input',{value:url,readonly:true,onclick:e=>e.target.select()});
    body.append(
      el('p',{text:'Qualquer pessoa com este link vê o painel, sem precisar de conta. O link se atualiza sozinho quando você muda os dados.'}),
      el('div',{class:'share-url'},inp,el('button',{class:'btn primary',onclick:async()=>{ try{ await navigator.clipboard.writeText(url); toast('Link copiado.'); }catch(e){ inp.select(); toast('Selecione e copie o link (Ctrl+C).'); } }},'Copiar')),
      el('div',{class:'share-btns'},
        el('a',{class:'btn',href:url,target:'_blank',rel:'noopener'},'Abrir o link'),
        el('a',{class:'btn whats',href:`https://wa.me/?text=${encodeURIComponent(`${m.name}: veja o painel atualizado em ${url}`)}`,target:'_blank',rel:'noopener'},icon('chat'),'Enviar no WhatsApp'),
        el('button',{class:'btn',onclick:async e=>{ const b=e.currentTarget; b.disabled=true; try{ delete shareSig[m.share.token]; await publishShare(currentMeta(),S.rows); toast('Link atualizado com os dados atuais.'); }catch(err){ handleWriteError(err); } b.disabled=false; }},'Atualizar agora'),
        el('button',{class:'btn danger',onclick:async e=>{
          if (!await confirmBox('Desativar o link?','Quem tiver o link não vai mais conseguir abrir o painel. Se criar outro depois, o endereço será diferente.','Desativar')) return;
          try{ const m2=structuredClone(currentMeta()); const tok=m2.share.token; await unpublishShare(tok); delete m2.share; m2.columns=m2.columns.filter(c=>!c.virtual);
            const i=S.bases.findIndex(b=>b.id===m2.id); if(i>=0) S.bases[i]=structuredClone(m2); await saveMeta(m2); draw(); toast('Link desativado.'); }
          catch(err){ handleWriteError(err); } }},'Desativar link')),
      el('div',{class:'muted',style:'font-size:12px',text:`Criado em ${fmtWhen(m.share.at)}.`}));
  };
  draw();
}
async function loadShareData(tok){
  const ref=shareRef(tok), d=await ref.get(); if(!d.exists) throw new Error('not-found');
  const x=d.data(), snap=await ref.collection('chunks').get();
  const docs=snap.docs.filter(c=>parseInt(c.id,10)<(x.chunkCount||0)).sort((a,b)=>a.id<b.id?-1:1);
  const rows=[]; for (const c of docs) for (const r of JSON.parse(c.data().json||'[]')) rows.push(r);
  return {x,rows};
}
function applyShare(x,rows){
  const meta={id:'share',name:x.name,fileName:x.fileName,columns:x.columns||[],charts:x.charts||[],goals:x.goals||[],tv:x.tv||null,source:x.source||null,updatedAt:x.updatedAt,rowCount:rows.length};
  Object.assign(S,{bases:[meta],currentId:'share',rows,basesLoaded:true});
  S.share={...S.share,by:x.by||{},stamp:x.updatedAt,loading:false,error:false};
  S.profile={name:x.by?.name||'',role:x.by?.role||'',company:x.by?.company||'',brand:x.by?.brand||{}};
  S.tvAt=Date.now(); document.title=`${x.name} · painel compartilhado`;
}
// TV pelo link de uma base do Google Sheets: relê a planilha direto (não grava nada)
async function pollShareSheet(){
  const m=currentMeta(); if(!m||!m.source) return;
  try{
    const tb=await fetchSheetTable(m.source), map=m.columns.map(c=>tb.columns.findIndex(x=>x.name===c.name));
    if (map.some(j=>j<0)) return;
    const rows=tb.rows.map(r=>map.map((j,k)=>tb.columns[j].type===m.columns[k].type?r[j]:convert(r[j],m.columns[k].type)));
    if (JSON.stringify(rows)!==JSON.stringify(S.rows)){ S.rows=rows; S.tvAt=Date.now(); render(); }
  }catch(e){ console.warn(e); }
}
async function openShare(tok){
  const tv=new URLSearchParams(location.search).get('tv')==='1';
  S.mode='share'; S.share={loading:true,tv}; S.readOnly=true; S.view=tv?'tv':'base'; S.tab='graficos';
  document.head.append(el('meta',{name:'robots',content:'noindex'}));
  setStatus('','Carregando painel…'); render();
  try{
    const {x,rows}=await loadShareData(tok); applyShare(x,rows);
    setStatus('ok',tv?'Ao vivo':'Somente visualização');
    // ao vivo: quando o dono muda os dados, o painel se atualiza sozinho
    let busy=false, again=false;
    const reload=()=>{ if(busy){ again=true; return; } busy=true;
      loadShareData(tok).then(({x,rows})=>{ applyShare(x,rows); render(); }).catch(e=>console.error(e)).finally(()=>{ busy=false; if(again){ again=false; reload(); } }); };
    shareRef(tok).onSnapshot(d=>{
      if (!d.exists){ S.share={...S.share,error:true}; setStatus('warn','Link indisponível'); render(); return; }
      if (d.data().updatedAt&&d.data().updatedAt!==S.share.stamp) reload();
    },e=>console.error(e));
    if (tv){ keepAwake(); if(x.source) setInterval(pollShareSheet,120000); }
  }catch(e){ console.error(e); S.share={error:true}; setStatus('warn','Link indisponível'); }
  render();
}
function shareView(){
  const v=el('div',{class:'view share-page'});
  if (S.share.loading){ v.append(el('div',{class:'muted'},el('span',{class:'spinner'}),'  Carregando painel…')); return v; }
  if (S.share.error){ v.append(el('div',{class:'empty'},el('div',{class:'empty-box'},el('h1',{text:'Link indisponível'}),
    el('p',{text:'Este link foi desativado por quem compartilhou ou está incompleto. Peça um link novo a essa pessoa.'}),
    el('a',{class:'btn',href:appUrl()},'Conhecer o Painel de Planilhas')))); return v; }
  const meta=currentMeta(), by=S.share.by||{}, b=by.brand||{}, bname=b.name||by.company||'';
  if (/^#[0-9a-f]{6}$/i.test(b.color||'')&&lum(b.color)<0.55) v.style.cssText=`--accent:${b.color};--accent-strong:${b.color}`;
  v.append(el('div',{class:'share-head'},
    b.logo?el('div',{class:'share-logo'},el('img',{src:b.logo,alt:bname||'Logo'})):null,
    el('div',{class:'share-t'},bname?el('div',{class:'share-kicker',text:bname}):null,el('h1',{text:meta.name}),
      el('div',{class:'meta-line',text:`Compartilhado por ${[by.name,by.role].filter(Boolean).join(' · ')||'—'} · atualizado em ${fmtWhen(meta.updatedAt)} · ${nf.format(S.rows.length)} registros`})),
    el('div',{class:'head-actions'},el('button',{class:'btn primary',onclick:()=>exportChartsPdf(meta),disabled:!(meta.charts||[]).length},icon('pdf'),'Baixar PDF'))));
  v.append(el('div',{class:'banner'},'Cópia somente leitura. Use os filtros e clique nos gráficos para explorar: nada do que você fizer aqui altera os dados.'));
  const body=el('div'); v.append(body); renderViz(body,meta);
  v.append(el('div',{class:'share-foot'},'Feito com ',el('a',{href:appUrl(),text:'Painel de Planilhas'}),': transforme planilhas em painéis e relatórios.'));
  return v;
}

export { applyShare, enableShare, loadShareData, newToken, openShare, pollShareSheet, publishShare, scheduleShare, shareDialog, shareRef, shareSig, shareTimer, shareUrl, shareView, unpublishShare };
