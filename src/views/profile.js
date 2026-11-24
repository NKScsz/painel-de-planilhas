import { downloads, fillAvatar, profileName, renderUser, signOut } from '../app/init.js';
import { icon, render } from '../app/render.js';
import { exportChartsPdf } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { handleWriteError, saveMeta } from '../core/storage.js';
import { el, fmtWhen, nf, toast } from '../core/utils.ts';
import { popMenu } from '../easy/simple-mode.js';
import { brandCard } from '../features/brand.js';
import { bulkDelete } from '../features/bulk-delete.js';
import { refreshDrive } from '../features/google-drive.js';
import { sheetDialog, syncSheet } from '../features/google-sheets.js';
import { shareDialog } from '../features/share.js';
import { tvDialog } from '../features/tv-mode.js';
import { bindDrop, pickFile } from '../import/upload.js';
import { copyCsv, exportXlsx, removeBase, updateDialog } from './data-tab.js';

/* ----- Meu perfil ----- */
const PROFILE_FIELDS=[
  {k:'name',label:'Nome de exibição',ph:'Como você quer ser chamado',max:80,req:true},
  {k:'role',label:'Função / cargo',ph:'Ex.: Analista financeiro',max:80},
  {k:'company',label:'Empresa',ph:'Ex.: Minha Empresa Ltda.',max:100},
  {k:'department',label:'Setor / departamento',ph:'Ex.: Financeiro',max:80},
  {k:'phone',label:'Telefone',ph:'(00) 00000-0000',max:30,type:'tel'}];
function profileView(){
  const p=S.profile||{}, nm=profileName();
  const saved={}; PROFILE_FIELDS.forEach(f=>saved[f.k]=f.k==='name'?nm:(p[f.k]||''));
  const inputs={};
  const err=el('div',{class:'form-err'});
  const saveBtn=el('button',{class:'btn primary',disabled:true,onclick:()=>save()},'Salvar alterações');
  const resetBtn=el('button',{class:'btn',disabled:true,onclick:()=>{ S.profileDirty=false; render(); }},'Descartar');
  const sign=el('div',{class:'pdf-sign'});
  const signText=()=>{ const v=k=>inputs[k]?inputs[k].value.trim():saved[k];
    const who=[v('name')||nm,v('role')].filter(Boolean).join(' · '), org=[v('department'),v('company')].filter(Boolean).join(' · ');
    sign.textContent=`Nos relatórios em PDF: "Preparado por ${who}${org?' · '+org:''}"`; };
  const check=()=>{ const changed=PROFILE_FIELDS.some(f=>inputs[f.k].value.trim()!==saved[f.k]); S.profileDirty=changed; saveBtn.disabled=!changed; resetBtn.disabled=!changed; err.textContent=''; signText(); };
  const grid=el('div',{class:'form-grid'},
    PROFILE_FIELDS.map(f=>{ const i=el('input',{type:f.type||'text',value:saved[f.k],placeholder:f.ph,maxlength:f.max,autocomplete:'off'});
      i.addEventListener('input',check); i.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!saveBtn.disabled) save(); }); inputs[f.k]=i;
      return el('label',{class:'field'},f.label+(f.req?' *':''),i); }),
    el('label',{class:'field'},'E-mail',el('input',{value:S.me?.email||'',disabled:true,title:'Vem da sua conta Google e não pode ser alterado aqui'})));
  signText();
  async function save(){
    const data={}; for (const f of PROFILE_FIELDS) data[f.k]=inputs[f.k].value.trim().slice(0,f.max);
    if (!data.name){ err.textContent='Informe um nome de exibição.'; inputs.name.focus(); return; }
    saveBtn.disabled=true; saveBtn.textContent='Salvando…';
    try{
      await S.db.doc(`data/users/${S.uid}/app`).set({profile:{...data,updatedAt:Date.now()}},{merge:true});
      S.profile={...S.profile,...data}; S.profileDirty=false;
      const u=S.auth.currentUser; if (u&&data.name!==u.displayName) u.updateProfile({displayName:data.name}).catch(()=>{});
      renderUser(); render(); toast('Perfil atualizado.');
    }catch(e){ saveBtn.textContent='Salvar alterações'; saveBtn.disabled=false; handleWriteError(e); }
  }
  // resumo da conta
  const rows=S.bases.reduce((s,b)=>s+(b.rowCount||0),0), chartsN=S.bases.reduce((s,b)=>s+((b.charts||[]).length),0);
  const md=S.authUser?.metadata||{}, dt=v=>v?new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}):'—';
  const stat=(l,v)=>el('div',{class:'stat-row'},el('span',{text:l}),el('b',{text:v}));
  const av=el('div',{class:'avatar lg'}); fillAvatar(av,nm);
  return el('div',{class:'view'},el('div',{class:'profile-page'},
    el('div',{class:'profile-hero'},av,
      el('div',{style:'min-width:0'},
        el('h1',{text:nm}),
        el('div',{class:'role',text:[p.role,p.department,p.company].filter(Boolean).join(' · ')||'Complete seu perfil com sua função e empresa.'}),
        el('div',{class:'mail',text:`${S.me?.email||''} · conta Google`}))),
    el('div',{class:'p-grid'},
      el('div',{},el('div',{class:'p-card'},
        el('h2',{text:'Dados pessoais'}),
        el('p',{class:'desc',text:'Essas informações aparecem no topo do site e identificam você nos relatórios em PDF.'}),
        grid, sign,
        el('div',{class:'form-actions'},err,resetBtn,saveBtn)),
        brandCard()),
      el('div',{},
        el('div',{class:'p-card'},
          el('h2',{text:'Sua conta'}),
          stat('Bases salvas',nf.format(S.bases.length)),
          stat('Linhas no total',nf.format(rows)),
          stat('Gráficos',nf.format(chartsN)),
          stat('Membro desde',dt(md.creationTime)),
          stat('Último acesso',dt(md.lastSignInTime)),
          el('button',{class:'btn danger',style:'width:100%;justify-content:center;margin-top:14px',disabled:S.readOnly||!S.bases.length,onclick:()=>bulkDelete(S.bases.map(b=>b.id))},`Excluir todas as bases${S.bases.length?` (${S.bases.length})`:''}`)),
        el('div',{class:'p-card'},
          el('h2',{text:'Sessão'}),
          el('p',{class:'desc',text:'Foto e e-mail vêm da sua conta Google.'}),
          el('button',{class:'btn danger',style:'width:100%;justify-content:center',onclick:signOut},'Sair da conta'))))));
}
function emptyState(){
  const drop=el('div',{class:'big-drop'},
    el('div',{style:'font-weight:600;font-size:15px;margin-bottom:4px',text:'Arraste uma planilha, PDF ou imagem para cá'}),
    el('div',{class:'muted',style:'margin-bottom:14px',text:'Excel, CSV ou ODS (cada aba vira uma base), extratos em PDF ou OFX, XML de notas fiscais (várias de uma vez viram uma base só), ou fotos e prints (PNG/JPG).'}),
    el('div',{class:'drop-btns'},el('button',{class:'btn primary',onclick:()=>pickFile('new'),disabled:S.readOnly},'Escolher arquivo'),
      el('button',{class:'btn',onclick:()=>sheetDialog(),disabled:S.readOnly},'Conectar Google Sheets')));
  bindDrop(drop);
  return el('div',{class:'empty'},el('div',{class:'empty-box'},
    el('h1',{text:'Seus dados, organizados e sempre à mão'}),
    el('p',{text:'Envie uma planilha e ela fica salva na sua conta: consulte, edite e veja gráficos de qualquer lugar.'}),
    drop,
    el('div',{class:'feat'},
      el('div',{},el('b',{text:'Tabela completa'}),'Busca, ordenação, edição de células e linhas'),
      el('div',{},el('b',{text:'Gráficos automáticos'}),'Indicadores e gráficos montados a partir das colunas'),
      el('div',{},el('b',{text:'Salvo no seu login'}),'Abra em qualquer computador ou celular'))));
}
function pageHead(meta){
  // nome em várias linhas: o título aparece inteiro, mesmo quando é longo
  const ti=el('textarea',{class:'title-input',rows:1,disabled:S.readOnly,'aria-label':'Nome da planilha',title:meta.name,spellcheck:'false'});
  ti.value=meta.name; if(meta.name.length>40) ti.classList.add('long');
  const fit=()=>{ ti.style.height='auto'; ti.style.height=ti.scrollHeight+'px'; };
  ti.addEventListener('input',()=>{ ti.value=ti.value.replace(/\n/g,' '); fit(); });
  requestAnimationFrame(fit); addEventListener('resize',fit,{passive:true});
  ti.addEventListener('keydown',e=>{if(e.key==='Enter'){ e.preventDefault(); ti.blur(); } if(e.key==='Escape'){ti.value=meta.name;fit();ti.blur();}});
  ti.addEventListener('change',async()=>{ const v=ti.value.trim(); if(!v||v===meta.name){ti.value=meta.name;return;} const m=structuredClone(meta); m.name=v; try{await saveMeta(m);}catch(e){handleWriteError(e);} });
  return el('div',{class:'page-head'},
    el('div',{class:'title-wrap'},ti,el('div',{class:'meta-line',text:`${nf.format(S.rows?S.rows.length:meta.rowCount||0)} linhas · ${meta.columns.length} colunas · ${meta.source?.type==='gdrive'?`Google Drive · ${meta.source.missing?'o arquivo saiu do Drive':'atualizado em '+fmtWhen(meta.source.syncedAt)}`:meta.source?.type==='gsheet'?`Google Sheets · sincronizado em ${fmtWhen(meta.source.syncedAt)}`:`arquivo ${meta.fileName||'—'} · atualizado em ${fmtWhen(meta.updatedAt)}`}`}),
      meta.share?.token?el('button',{class:'share-pill',onclick:()=>shareDialog(meta),title:'Este painel tem um link público ativo'},el('span',{class:'dot ok'}),'Link de compartilhamento ativo'):null),
    el('div',{class:'head-actions'},
      el('button',{class:'btn primary','data-tour':'pdf',onclick:()=>exportChartsPdf(meta),disabled:!S.rows||!(meta.charts||[]).length,title:'Baixa um relatório em PDF com os gráficos (respeitando os filtros da aba Gráficos) e uma explicação de cada um'},icon('pdf'),'Baixar PDF'),
      S.mode==='cloud'&&!S.readOnly?el('button',{class:'btn',onclick:()=>shareDialog(meta),title:'Crie um link para clientes verem este painel sem login'},icon('send'),'Compartilhar'):null,
      el('button',{class:'btn','data-tour':'more','aria-haspopup':'menu',title:'Modo TV, atualizar a planilha, baixar em Excel, excluir…',onclick:e=>popMenu(e.currentTarget,[
        {icon:'tv',label:'Modo TV',hint:'Painel em tela cheia para a TV da empresa, atualizado ao vivo',onclick:()=>tvDialog(meta),disabled:!S.rows},
        meta.source?.type==='gdrive'?{icon:'refresh',label:'Atualizar pelo Google Drive',hint:'Confere o Drive e traz a versão mais nova (e arquivos novos da pasta)',onclick:()=>{ const c=(S.drives||[]).find(d=>d.id===meta.source.conn); if(c) refreshDrive([c]); else toast('Esta planilha veio de uma conexão do Drive que foi removida.',true); },disabled:S.readOnly}
        :meta.source?.type==='gsheet'?{icon:'upload',label:'Sincronizar com o Google Sheets',hint:'Busca agora a versão mais nova da planilha',onclick:()=>syncSheet(meta,false),disabled:S.readOnly}
          :{icon:'upload',label:'Atualizar com nova planilha',hint:'Troque os dados ou adicione linhas novas',onclick:updateDialog,disabled:S.readOnly},
        downloads?{icon:'sheet',label:'Baixar em Excel',hint:'Os dados desta planilha num arquivo .xlsx',onclick:exportXlsx}:null,
        {icon:'copy',label:'Copiar os dados',hint:'Para colar em outro programa (formato CSV)',onclick:copyCsv},
        {sep:true},
        {icon:'trash',label:'Excluir esta planilha',hint:'Apaga a planilha, os gráficos e os relatórios dela',danger:true,onclick:()=>removeBase(meta),disabled:S.readOnly}],'Mais opções')},icon('more'),'Mais')));
}

export { PROFILE_FIELDS, emptyState, pageHead, profileView };
