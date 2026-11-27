import { confirmBox } from './modals.js';
import { render } from './render.js';
import { FIREBASE_CONFIG } from '../config/firebase-config.js';
import { S } from '../core/state.js';
import { basesCol, loadRows } from '../core/storage.js';
import { $, el, toast } from '../core/utils.ts';
import { syncSheet } from '../features/google-sheets.js';
import { setBaseline } from '../features/history.js';
import { seedSampleOnce, startDemo } from '../features/sample-and-tour.js';
import { openShare } from '../features/share.js';
import { ensureRelated, modelDragging } from '../views/data-model.js';

/* ============ Inicialização ============ */
function setStatus(kind,text){ $('#status').innerHTML=''; $('#status').append(el('span',{class:'dot '+kind}),el('span',{text})); }
// download de arquivos (Excel e PDF) direto pelo navegador
let downloads={ save:async({filename,data})=>{
  const blob=data instanceof Blob?data:new Blob([data]);
  const url=URL.createObjectURL(blob); const a=el('a',{href:url,download:filename});
  document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
}};
// versão do GitHub Pages: só demonstração, sem login (os dados ficam na aba)
const NO_LOGIN=/.github.io$/i.test(location.hostname);
const firebaseConfigured=()=>!!(window.firebase && FIREBASE_CONFIG.apiKey && !/COLE_AQUI/.test(FIREBASE_CONFIG.apiKey) && !/SEU-PROJETO/.test(FIREBASE_CONFIG.projectId));

// app instalável (PWA): service worker e botão "Instalar app"



async function installApp(){ const e=S.installEvt; if(!e) return; e.prompt(); try{ await e.userChoice; }catch(x){} S.installEvt=null; render(); }
async function init(){
  render();
  if (!firebaseConfigured()){
    S.mode='setup'; setStatus('warn',window.firebase?'Firebase não configurado':'Sem conexão com o Firebase'); render(); return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  S.db=firebase.firestore();
  S.db.settings({ignoreUndefinedProperties:true});
  // link compartilhado (?v=…): abre o painel somente leitura, sem login
  const shareTok=new URLSearchParams(location.search).get('v');
  if (shareTok&&/^[a-z0-9]{12,40}$/.test(shareTok)){ openShare(shareTok); return; }
  if (NO_LOGIN){ document.body.classList.add('no-login'); await startDemo(); return; }
  S.auth=firebase.auth();
  try{ await S.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }catch(e){}
  S.auth.getRedirectResult().catch(e=>authError(e));
  S.auth.onAuthStateChanged(user=>{
    if (S.unsubBases){ S.unsubBases(); S.unsubBases=null; }
    if (S.unsubProfile){ S.unsubProfile(); S.unsubProfile=null; }
    clearTimeout(basesTimer);
    Object.assign(S,{board:[],bases:[],basesLoaded:false,currentId:null,rows:null,dirty:false,readOnly:false,view:'home',profile:{},profileDirty:false,authUser:user||null,model:{relationships:[],positions:{}},rowCache:{},queries:[]});
    if (S.sql&&S.sql.db){ try{ S.sql.db.close(); }catch(e){} } S.sql=null; // outra conta: banco SQL novo
    if (user){
      S.uid=user.uid; S.mode='cloud';
      S.me={name:user.displayName||user.email||'Você',email:user.email,photo:user.photoURL};
      setStatus('ok','Conectado');
      subscribeBases();
      // perfil (nome, função, empresa…) fica no documento data/users/{uid}/app
      S.unsubProfile=S.db.doc(`data/users/${S.uid}/app`).onSnapshot(d=>{
        const data=(d.exists&&d.data())||{};
        S.profile=data.profile||{};
        // painel geral: só redesenha se a lista mudou e a pessoa está nele
        const bd=Array.isArray(data.board)?data.board:[]; const bChanged=JSON.stringify(bd)!==JSON.stringify(S.board||[]); S.board=bd;
        if (bChanged&&S.view==='painel') render();
        const qs=Array.isArray(data.queries)?data.queries:[]; const qChanged=JSON.stringify(qs)!==JSON.stringify(S.queries||[]); S.queries=qs;
        if (qChanged&&S.view==='sql'&&!S.sql?.busy) render();
        renderUser();
        if (S.view==='perfil'&&!S.profileDirty) render();
        // modelo de dados (relações + posições no diagrama); só redesenha se mudou de verdade
        const m={relationships:(data.model&&data.model.relationships)||[],positions:(data.model&&data.model.positions)||{}};
        if (JSON.stringify(m)!==JSON.stringify(S.model)){
          S.model=m;
          if (S.view==='modelo'&&!modelDragging) render();
          else if (S.view==='base'&&S.tab==='graficos'&&currentMeta()&&S.rows){ const meta=currentMeta(); ensureRelated(meta).then(()=>{ if(S.view==='base'&&S.currentId===meta.id) render(); }); }
        }
      },e=>console.error(e));
    } else {
      S.uid=null; S.me=null; S.mode='login';
      setStatus('', 'Não conectado');
    }
    renderUser(); render();
  });
}
function renderUser(){
  const chip=$('#userchip'), out=$('#logoutBtn');
  if (!S.me){ chip.classList.add('hidden'); out.classList.add('hidden'); return; }
  const nm=profileName(), p=S.profile||{};
  $('#uname').textContent=nm; chip.title='Meu perfil'+(S.me.email?` (${S.me.email})`:'');
  fillAvatar($('#avatar'),nm);
  fillAvatar($('#profileNavIc'),nm);
  $('#profileNavSub').textContent=[p.role,p.company].filter(Boolean).join(' · ')||'Nome, função e empresa';
  chip.classList.remove('hidden'); out.classList.remove('hidden');
}
function fillAvatar(av,nm){
  av.innerHTML='';
  if (S.me&&S.me.photo){ const img=el('img',{src:S.me.photo,alt:'',referrerpolicy:'no-referrer',style:'width:100%;height:100%;border-radius:inherit;object-fit:cover'}); img.onerror=()=>{ av.textContent=initials(nm); }; av.append(img); }
  else av.textContent=initials(nm);
}
const profileName=()=>String(S.profile?.name||'').trim()||S.me?.name||'Você';
function openProfile(){ if(S.view==='perfil') return; S.view='perfil'; $('#aside').classList.remove('open'); render(); }
// sair do perfil com alterações não salvas pede confirmação
async function leaveProfile(){
  if (S.view==='perfil'&&(S.profileDirty||S.brandDirty)){ const ok=await confirmBox('Descartar alterações do perfil?','Você alterou seu perfil ou sua marca e ainda não salvou.','Descartar'); if(!ok) return false; }
  S.profileDirty=false; S.brandDirty=false; return true;
}
async function goHome(){
  if (S.mode!=='cloud'&&S.mode!=='local') return;
  $('#aside').classList.remove('open');
  if (S.view==='home') return;
  if (!await leaveProfile()) return;
  S.view='home'; render(); $('#main').scrollTop=0;
}
// abre uma base direto numa aba (dados | graficos)
async function openBaseTab(id,tab){ S.tab=tab; history.replaceState(null,'','#'+tab); await openBase(id); }





// iniciais da base para o menu recolhido ("Vendas 2026" -> "V2", "extrato-picpay" -> "EP")
const baseAbbr=n=>{ const w=String(n).split(/[\s\-_—.]+/).filter(Boolean); return ((w[0]||'?')[0]+(w[1]?w[1][0]:(w[0]||'')[1]||'')).toUpperCase(); };
// recolher / expandir o menu lateral (preferência guardada neste navegador)
function setAsideCollapsed(c){
  document.querySelector('.app').classList.toggle('collapsed',c);
  const b=$('#collapseBtn'), t=c?'Expandir menu':'Recolher menu';
  b.title=t; b.setAttribute('aria-label',t); b.setAttribute('aria-expanded',String(!c));
  try{ localStorage.setItem('asideCollapsed',c?'1':'0'); }catch(e){}
}




const initials=nm=>String(nm).trim().split(/\s+/).map(p=>p[0]).slice(0,2).join('').toUpperCase()||'?';
function authError(e){
  if (!e) return;
  console.error(e);
  const msg={
    'auth/unauthorized-domain':'Este endereço não está autorizado. Adicione-o em Firebase > Authentication > Settings > Authorized domains.',
    'auth/operation-not-allowed':'O login com Google não está ativado. Ative em Firebase > Authentication > Sign-in method > Google.',
    'auth/network-request-failed':'Sem conexão com a internet. Tente novamente.',
    'auth/operation-not-supported-in-this-environment':'Abra o site por um endereço http(s) (ex.: Firebase Hosting ou localhost), não direto do arquivo.'
  }[e.code];
  if (e.code==='auth/popup-closed-by-user'||e.code==='auth/cancelled-popup-request') return;
  toast(msg||'Não foi possível entrar com o Google. Tente novamente.',true,8000);
}
async function signIn(btn){
  const provider=new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  if (btn) btn.disabled=true;
  try{ await S.auth.signInWithPopup(provider); }
  catch(e){
    if (e.code==='auth/popup-blocked'){ try{ await S.auth.signInWithRedirect(provider); return; }catch(e2){ authError(e2); } }
    else authError(e);
  }
  finally{ if (btn) btn.disabled=false; }
}
async function signOut(){
  if (S.dirty||S.profileDirty){ const ok=await confirmBox('Sair sem salvar?','Você tem alterações que ainda não foram salvas.','Sair'); if(!ok) return; S.dirty=false; S.profileDirty=false; }
  try{ await S.auth.signOut(); toast('Você saiu da sua conta.'); }catch(e){ toast('Não foi possível sair agora.',true); }
}

let basesTimer=null;
function subscribeBases(){
  basesTimer=setTimeout(()=>{ if(!S.basesLoaded){ setStatus('warn','Servidor demorando para responder…'); } },10000);
  S.unsubBases=basesCol().onSnapshot(snap=>{
    if(!snap.metadata.fromCache){ clearTimeout(basesTimer); setStatus('ok','Salvo na nuvem'); }
    S.bases=snap.docs.filter(d=>d.exists).map(d=>structuredClone(d.data())).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    S.basesLoaded=true;
    if (!snap.metadata.fromCache) seedSampleOnce();
    const cur=S.bases.find(b=>b.id===S.currentId);
    if (S.currentId && !cur){ S.currentId=null; S.rows=null; }
    if (!S.currentId && S.bases.length && S.view==='base') openBase(S.bases[0].id);
    else render();
  }, err=>{ console.error(err); clearTimeout(basesTimer); S.basesLoaded=true; setStatus('warn',err&&err.code==='permission-denied'?'Sem permissão para abrir suas planilhas':'Sem conexão: confira sua internet'); render(); });
}
function currentMeta(){ return S.bases.find(b=>b.id===S.currentId); }

async function openBase(id){
  if (S.view!=='base'){
    if (!await leaveProfile()) return;
    S.view='base';
    if (id===S.currentId&&S.rows){ $('#aside').classList.remove('open'); render(); return; }
  }
  if (S.dirty && S.currentId!==id){ const ok=await confirmBox('Descartar alterações?','Você tem edições não salvas nesta base.','Descartar'); if(!ok) return; }
  S.currentId=id; S.rows=null; S.dirty=false; S.page=0; S.sort={col:-1,dir:1}; S.search=''; S.vfilter={col:'',val:'',from:'',to:''};
  $('#aside').classList.remove('open');
  S.loadingRows=true; render();
  const meta=currentMeta();
  try{ S.rows=await loadRows(meta); setBaseline(meta,S.rows); }catch(e){ console.error(e); toast('Não foi possível carregar os dados desta base.',true); S.rows=[]; }
  try{ await ensureRelated(meta); }catch(e){ console.error(e); } // dados das bases conectadas (modelo de dados)
  S.loadingRows=false;
  if (S.currentId===id){ render(); if(meta&&meta.source) syncSheet(currentMeta(),true); } // base ligada ao Google Sheets: busca a versão mais nova
}

export { NO_LOGIN, authError, baseAbbr, basesTimer, currentMeta, downloads, fillAvatar, firebaseConfigured, goHome, init, initials, installApp, leaveProfile, openBase, openBaseTab, openProfile, profileName, renderUser, setAsideCollapsed, setStatus, signIn, signOut, subscribeBases };
