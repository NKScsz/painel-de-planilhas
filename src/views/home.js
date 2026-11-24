import { currentMeta, installApp, openBaseTab, openProfile, profileName } from '../app/init.js';
import { icon } from '../app/render.js';
import { exportChartsPdf } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { el, fmtWhen, nf } from '../core/utils.ts';
import { checklist } from '../easy/checklist.js';
import { helpBar } from '../easy/help.js';
import { bulkDelete } from '../features/bulk-delete.js';
import { openConsultas } from '../features/cnpj-cep.js';
import { sheetDialog } from '../features/google-sheets.js';
import { createSample, tourFromHome } from '../features/sample-and-tour.js';
import { templatesDialog } from '../features/templates.js';
import { bindDrop, pickFile } from '../import/upload.js';
import { openModel } from './data-model.js';

/* ----- Página inicial ----- */
function homeView(){
  const first=profileName().split(/\s+/)[0];
  const h=new Date().getHours(), greet=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  const today=new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  const last=S.bases[0]; // a mais recente (lista já vem ordenada por atualização)
  const rows=S.bases.reduce((s,b)=>s+(b.rowCount||0),0), chartsN=S.bases.reduce((s,b)=>s+((b.charts||[]).length),0);
  const lastTxt=last?`“${last.name}”`:'';
  // atalhos: cartões iguais (ícone + título + frase curta); o nome da base aparece uma vez só, no topo
  const qcard=(ic,title,desc,onclick,disabled=false)=>{ const s=icon(ic); s.setAttribute('width','17'); s.setAttribute('height','17');
    return el('button',{class:'qx',onclick,disabled,title:disabled?desc:title},
      el('span',{class:'qi'},s),el('b',{text:title}),el('small',{text:desc}),el('span',{class:'ar','aria-hidden':'true',text:'→'})); };
  const quick=el('div',{class:'h-index'},
    el('div',{class:'lbl'},el('span',{text:'Atalhos'}),last?el('span',{class:'cur',title:last.name},'Planilha atual: ',el('b',{text:last.name})):null),
    el('div',{class:'qgrid'},
      qcard('table','Tabela de dados',last?'Consulte, busque e edite as linhas.':'Envie um arquivo para ver os dados aqui.',()=>openBaseTab(last.id,'dados'),!last),
      qcard('chart','Gráficos',last?'Indicadores e gráficos explicados.':'Montados a partir dos seus dados.',()=>openBaseTab(last.id,'graficos'),!last),
      qcard('pdf','Relatório em PDF',last?'Baixe o relatório pronto para enviar.':'Disponível depois de enviar uma planilha.',async()=>{ await openBaseTab(last.id,'graficos'); const m=currentMeta(); if(m&&m.id===last.id&&S.rows) exportChartsPdf(m); },!last||!(last.charts||[]).length),
      (()=>{ const c=qcard('model','Ligar planilhas',S.bases.length>=2?'Junte planilhas por uma coluna em comum.':'Disponível com 2 planilhas ou mais.',()=>openModel(),!S.bases.length); c.classList.add('adv'); return c; })(),
      qcard('file','Planilhas modelo','Vendas, financeiro, estoque, RH e marketing',()=>templatesDialog(null)),
      (()=>{ const c=qcard('table','Consultas','CNPJ e CEP com dados públicos',openConsultas); c.classList.add('adv'); return c; })(),
      qcard('upload','Google Sheets','Conecte uma planilha que se atualiza',()=>sheetDialog(),S.readOnly),
      qcard('user','Meu perfil','Nome, empresa, conta e sua marca nos relatórios',openProfile)));
  const meta=el('div',{class:'h-meta'},el('span',{text:'Painel / Início'}),el('span',{},today,S.bases.length?el('button',{class:'linkish',onclick:tourFromHome,title:'Conheça os recursos em 1 minuto'},'  ·  Fazer o tour'):null,S.installEvt?el('button',{class:'linkish',onclick:installApp,title:'Instale o painel como um aplicativo no computador ou celular'},'  ·  Instalar app'):null));
  const hero=el('div',{class:'h-hero'},
    el('h1',{text:S.bases.length?'Suas planilhas':'Sua primeira planilha'}),
    el('p',{text:S.bases.length?'Envie um arquivo novo ou continue de onde parou':'Envie sua primeira planilha, extrato ou foto de tabela. O resto o painel organiza.'}));
  // livro-razão à direita: números da conta alinhados à base do título
  const ledger=el('div',{class:'h-ledger'},
    [['Planilhas',S.bases.length],['Linhas',rows],['Gráficos',chartsN]].map(([k,v])=>el('div',{class:'row'},el('span',{class:'k',text:k}),el('span',{class:'v',text:nf.format(v)}))));
  // área grande para soltar arquivos (a área inteira é clicável)
  const di=icon('upload'); di.setAttribute('width','24'); di.setAttribute('height','24');
  const drop=el('div',{class:'home-drop'+(S.readOnly?' disabled':''),role:'button',tabindex:S.readOnly?'-1':'0','aria-label':'Enviar arquivo',
      onclick:()=>{ if(!S.readOnly) pickFile('new'); },onkeydown:e=>{ if(!S.readOnly&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); pickFile('new'); } }},
    el('div',{class:'di'},di),
    el('h3',{text:S.bases.length?'Solte um arquivo aqui':'Comece pelo primeiro arquivo'}),
    el('p',{text:'Arraste para esta área ou clique para escolher. Cada arquivo vira uma planilha no painel, com tabela, gráficos explicados e relatório.'}),
    el('div',{class:'drop-btns'},
      el('button',{class:'btn primary',disabled:S.readOnly,onclick:e=>{ e.stopPropagation(); pickFile('new'); }},'Escolher arquivo'),
      el('button',{class:'btn',disabled:S.readOnly,onclick:e=>{ e.stopPropagation(); sheetDialog(); }},'Conectar Google Sheets'),
      S.bases.length?null:el('button',{class:'btn',disabled:S.readOnly,onclick:e=>{ e.stopPropagation(); createSample(true); }},'Experimentar com dados de exemplo')),
    el('div',{class:'ftypes'},['.xlsx / .xls','.csv / .ods','Extrato .pdf / .ofx','Nota fiscal .xml','Foto ou print .png / .jpg'].map(t=>el('span',{class:'chip',text:t}))));
  if (!S.readOnly) bindDrop(drop);
  // tudo no eixo central: saudação, números, área de envio, atalhos e bases
  const home=el('div',{class:'home stagger'},meta,hero,ledger,checklist(),drop,quick,el('div',{class:'home-help'},helpBar('home')));
  const wrap=el('div',{class:'view'},home);
  if (!S.bases.length) return wrap;
  // bases como livro-razão (linhas com réguas), não como grade de cartões
  // seleção de várias bases para excluir de uma vez
  const sel=S.sel||(S.sel=new Set()); for (const id of [...sel]) if(!S.bases.some(b=>b.id===id)) sel.delete(id);
  const bar=el('div',{class:'bulk-bar',role:'status'}), cks=[];
  const allCk=el('input',{type:'checkbox',title:'Selecionar todas','aria-label':'Selecionar todas as bases',disabled:S.readOnly});
  const sync=()=>{
    allCk.checked=sel.size>0&&sel.size===S.bases.length; allCk.indeterminate=sel.size>0&&sel.size<S.bases.length;
    for (const c of cks){ c.checked=sel.has(c._id); c.closest('.lg-row').classList.toggle('sel',c.checked); }
    bar.innerHTML=''; bar.classList.toggle('on',sel.size>0);
    if (sel.size) bar.append(el('b',{text:`${sel.size} ${sel.size===1?'base selecionada':'bases selecionadas'}`}),el('span',{class:'spacer'}),
      el('button',{class:'btn sm',onclick:()=>{ sel.clear(); sync(); }},'Limpar seleção'),
      el('button',{class:'btn sm danger',onclick:()=>bulkDelete([...sel])},sel.size===1?'Excluir a selecionada':`Excluir as ${sel.size} selecionadas`));
  };
  allCk.onchange=()=>{ if(allCk.checked) S.bases.forEach(b=>sel.add(b.id)); else sel.clear(); sync(); };
  const lg=el('div',{class:'lg',role:'list'},
    el('div',{class:'lg-row lg-h'},el('label',{class:'lg-all'},allCk,el('span',{text:'Planilha'})),el('span',{class:'lg-hide',style:'text-align:right',text:'Linhas'}),el('span',{class:'lg-hide',style:'text-align:right',text:'Colunas'}),el('span',{class:'lg-hide',style:'text-align:right',text:'Gráficos'}),el('span',{class:'lg-hide',text:'Atualizada'}),el('span',{text:'Abrir'})));
  for (const b of S.bases){
    lg.append(el('div',{class:'lg-row',role:'listitem',tabindex:'0',title:`Abrir “${b.name}”`,
      onclick:()=>openBaseTab(b.id,'dados'),onkeydown:e=>{ if(e.key==='Enter') openBaseTab(b.id,'dados'); }},
      el('div',{class:'lg-pick'},(()=>{ const ck=el('input',{type:'checkbox','aria-label':`Selecionar “${b.name}”`,disabled:S.readOnly,onclick:e=>e.stopPropagation(),onkeydown:e=>e.stopPropagation(),onchange:()=>{ if(ck.checked) sel.add(b.id); else sel.delete(b.id); sync(); }}); ck._id=b.id; cks.push(ck); return ck; })(),
        el('div',{class:'lg-name'},el('b',{text:b.name}),el('span',{text:b.fileName||'—'}))),
      el('span',{class:'lg-num lg-hide',text:nf.format(b.rowCount||0)}),
      el('span',{class:'lg-num lg-hide',text:nf.format(b.columns?.length||0)}),
      el('span',{class:'lg-num lg-hide',text:nf.format((b.charts||[]).length)}),
      el('span',{class:'lg-date lg-hide',text:fmtWhen(b.updatedAt)}),
      el('div',{class:'lg-act'},
        el('button',{class:'btn sm',onclick:e=>{ e.stopPropagation(); openBaseTab(b.id,'dados'); }},'Dados'),
        el('button',{class:'btn sm',onclick:e=>{ e.stopPropagation(); openBaseTab(b.id,'graficos'); }},'Gráficos'))));
  }
  home.append(el('section',{class:'h-bases'},el('div',{class:'hd'},el('h2',{text:'Suas planilhas'}),
    el('div',{class:'hd-r'},el('span',{text:`${S.bases.length} · mais recentes primeiro`}),
      S.readOnly?null:el('button',{class:'btn sm danger',onclick:()=>bulkDelete(S.bases.map(b=>b.id))},'Excluir todas'))),bar,lg));
  requestAnimationFrame(sync);
  return wrap;
}

export { homeView };
