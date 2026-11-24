import { currentMeta, installApp, openBaseTab, openProfile, profileName } from '../app/init.js';
import { icon } from '../app/render.js';
import { exportChartsPdf } from '../charts/draw-and-pdf.js';
import { S } from '../core/state.js';
import { el, fmtWhen, nf } from '../core/utils.ts';
import { checklist } from '../easy/checklist.js';
import { baseEntries, sheetLabel } from '../core/groups.js';
import { fold } from '../easy/free-ask.ts';
import { helpBar } from '../easy/help.js';
import { bulkDelete } from '../features/bulk-delete.js';
import { openConsultas } from '../features/cnpj-cep.js';
import { sheetDialog } from '../features/google-sheets.js';
import { createSample, tourFromHome } from '../features/sample-and-tour.js';
import { templatesDialog } from '../features/templates.js';
import { bindDrop, pickFile } from '../import/upload.js';
import { openBoard } from './board.js';
import { openModel } from './data-model.js';

/* ----- Página inicial -----
   No jeito das telas iniciais de ferramentas de dados: saudação no centro, uma caixa para procurar
   ou soltar arquivos, abas em pílula e a lista do que você usou por último. */
let homeTab = null; // aba escolhida (Recentes, Com gráficos, Atalhos); vale enquanto a página estiver aberta

// "há 3 dias", "ontem", "há 2 h": como a lista mostra a última atualização
function whenAgo(t) {
  if (!t) return '';
  const min = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (!isFinite(min)) return '';
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24); if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  return new Date(t).toLocaleDateString('pt-BR');
}
// tipo e ícone da planilha, pela origem ou pela extensão do arquivo
function kindOf(b) {
  if (b.source && b.source.type === 'gsheet') return ['Google Sheets', 'table'];
  const ext = String(b.fileName || '').toLowerCase().split('.').pop();
  if (['xlsx', 'xls', 'xlsm'].includes(ext)) return ['Excel', 'sheet'];
  if (['csv', 'tsv', 'txt'].includes(ext)) return ['CSV', 'sheet'];
  if (ext === 'ods') return ['ODS', 'sheet'];
  if (ext === 'pdf') return ['PDF', 'pdf'];
  if (ext === 'ofx') return ['Extrato OFX', 'building'];
  if (ext === 'xml') return ['Nota fiscal', 'file'];
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext)) return ['Imagem', 'image'];
  return ['Planilha', 'sheet'];
}

function homeView() {
  const first = profileName().split(/\s+/)[0];
  const h = new Date().getHours(), greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const last = S.bases[0]; // a mais recente (lista já vem ordenada por atualização)
  const rowsN = S.bases.reduce((s, b) => s + (b.rowCount || 0), 0), chartsN = S.bases.reduce((s, b) => s + ((b.charts || []).length), 0);
  const ro = S.readOnly;

  const title = el('h1', { class: 'db-welcome', text: first && first !== 'Visitante' ? `${greet}, ${first}` : 'Bem-vindo ao Painel de Planilhas' });
  const meta = el('div', { class: 'db-meta' }, el('span', { text: today }),
    S.bases.length ? el('button', { class: 'linkish', onclick: tourFromHome, title: 'Conheça os recursos em 1 minuto' }, 'Fazer o tour') : null,
    S.installEvt ? el('button', { class: 'linkish', onclick: installApp, title: 'Instale o painel como um aplicativo no computador ou celular' }, 'Instalar app') : null);

  // caixa central: procurar planilhas e enviar arquivos (dá para soltar o arquivo em cima dela)
  const search = el('input', { class: 'db-search', type: 'search', placeholder: S.bases.length ? 'Procure uma planilha ou solte um arquivo aqui…' : 'Solte um arquivo aqui ou escolha abaixo…', 'aria-label': 'Procurar planilha' });
  const chip = (ic, label, onclick, dis) => el('button', { class: 'db-chip', type: 'button', disabled: !!dis, onclick }, icon(ic, 15), label);
  const box = el('div', { class: 'db-box' + (ro ? ' disabled' : '') },
    search,
    el('div', { class: 'db-box-row' },
      el('div', { class: 'db-chips' },
        chip('upload', 'Enviar arquivo', () => pickFile('new'), ro),
        chip('file', 'Modelos', () => templatesDialog(null), ro),
        chip('table', 'Google Sheets', () => sheetDialog(), ro),
        S.bases.length ? null : chip('chart', 'Dados de exemplo', () => createSample(true), ro)),
      el('button', { class: 'btn primary', disabled: ro, onclick: () => pickFile('new') }, 'Escolher arquivo', icon('upload', 14))));
  if (!ro) bindDrop(box);
  const types = el('p', { class: 'db-types', text: 'Aceita Excel, CSV e ODS, extrato em PDF ou OFX, nota fiscal em XML e foto ou print de tabela.' });

  // abas em pílula
  const entries = baseEntries(); // abas de um mesmo arquivo = uma linha só
  const withCharts = entries.filter(g => g.members.some(b => (b.charts || []).length));
  const tabs = [['recentes', 'Recentes', 'clock'], ['graficos', 'Com gráficos', 'chart'], ['atalhos', 'Atalhos', 'sparkle']];
  if (!homeTab) homeTab = S.bases.length ? 'recentes' : 'atalhos';
  const pills = el('div', { class: 'db-pills', role: 'tablist', 'aria-label': 'O que mostrar' });
  const list = el('div', { class: 'db-list', role: 'list' });
  const toolbar = el('div', { class: 'db-toolbar' });
  const bar = el('div', { class: 'bulk-bar', role: 'status' });

  // seleção de várias planilhas para excluir de uma vez
  const sel = S.sel || (S.sel = new Set()); for (const id of [...sel]) if (!S.bases.some(b => b.id === id)) sel.delete(id);
  let cks = [];
  const allCk = el('input', { type: 'checkbox', title: 'Selecionar todas', 'aria-label': 'Selecionar todas as planilhas', disabled: ro });
  const sync = () => {
    allCk.checked = sel.size > 0 && sel.size === S.bases.length; allCk.indeterminate = sel.size > 0 && sel.size < S.bases.length;
    for (const c of cks) { const all = c._ids.every(id => sel.has(id)), some = c._ids.some(id => sel.has(id)); c.checked = all; c.indeterminate = some && !all; c.closest('.db-row').classList.toggle('sel', all); }
    list.classList.toggle('selecting', sel.size > 0);
    bar.innerHTML = ''; bar.classList.toggle('on', sel.size > 0);
    if (sel.size) bar.append(el('b', { text: `${sel.size} ${sel.size === 1 ? 'planilha selecionada' : 'planilhas selecionadas'}` }), el('span', { class: 'spacer' }),
      el('button', { class: 'btn sm', onclick: () => { sel.clear(); sync(); } }, 'Limpar seleção'),
      el('button', { class: 'btn sm danger', onclick: () => bulkDelete([...sel]) }, sel.size === 1 ? 'Excluir a selecionada' : `Excluir as ${sel.size} selecionadas`));
  };
  allCk.onchange = () => { if (allCk.checked) S.bases.forEach(b => sel.add(b.id)); else sel.clear(); sync(); };

  const baseRow = g => {
    const b = g.first, ms = g.members, multi = ms.length > 1;
    const [kind, ic] = kindOf(b), nCharts = ms.reduce((s, m) => s + (m.charts || []).length, 0), nRows = ms.reduce((s, m) => s + (m.rowCount || 0), 0);
    const upd = Math.max(...ms.map(m => m.updatedAt || 0)) || b.updatedAt, ago = whenAgo(upd);
    const ck = el('input', { type: 'checkbox', class: 'db-ck', 'aria-label': `Selecionar “${g.name}”`, disabled: ro, onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation(), onchange: () => { for (const m of ms) { if (ck.checked) sel.add(m.id); else sel.delete(m.id); } sync(); } });
    ck._ids = ms.map(m => m.id); cks.push(ck);
    const row = el('div', { class: 'db-row', role: 'listitem', tabindex: '0', title: `Abrir “${g.name}”`,
      onclick: () => openBaseTab(b.id, 'dados'), onkeydown: e => { if (e.key === 'Enter') openBaseTab(b.id, 'dados'); } },
    ck,
    el('span', { class: 'db-ic' }, icon(ic, 16)),
    el('div', { class: 'db-name' }, el('b', { text: g.name }),
      el('span', { text: [b.fileName, multi ? `${ms.length} abas: ${ms.map(sheetLabel).join(', ')}` : '', `${nf.format(nRows)} linhas`, nCharts ? `${nCharts} ${nCharts === 1 ? 'gráfico' : 'gráficos'}` : ''].filter(Boolean).join(' · ') })),
    el('span', { class: 'db-when', title: fmtWhen(upd), text: ago ? `Atualizada • ${ago}` : '' }),
    el('span', { class: 'db-kind', text: kind }),
    el('div', { class: 'db-act' },
      el('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); openBaseTab(b.id, 'dados'); } }, 'Dados'),
      el('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); openBaseTab(b.id, 'graficos'); } }, 'Gráficos')));
    row._find = fold(`${g.name} ${ms.map(m => m.name).join(' ')} ${b.fileName || ''} ${kind}`);
    return row;
  };
  // atalhos com a mesma cara das linhas da lista
  const qrow = (ic, t, desc, onclick, disabled = false, adv = false) => {
    const r = el('button', { class: 'db-row db-q' + (adv ? ' adv' : ''), type: 'button', role: 'listitem', onclick, disabled, title: disabled ? desc : t },
      el('span', { class: 'db-ic' }, icon(ic, 16)),
      el('div', { class: 'db-name' }, el('b', { text: t }), el('span', { text: desc })),
      el('span', { class: 'db-when' }),
      el('span', { class: 'db-kind', text: 'Atalho' }));
    r._find = fold(`${t} ${desc}`); return r;
  };
  const shortcuts = () => [
    qrow('table', 'Tabela de dados', last ? `Consulte, busque e edite as linhas de “${last.name}”.` : 'Envie um arquivo para ver os dados aqui.', () => openBaseTab(last.id, 'dados'), !last),
    qrow('chart', 'Gráficos', last ? `Indicadores e gráficos explicados de “${last.name}”.` : 'Montados a partir dos seus dados.', () => openBaseTab(last.id, 'graficos'), !last),
    qrow('pdf', 'Relatório em PDF', last ? 'Baixe o relatório pronto para enviar.' : 'Disponível depois de enviar uma planilha.', async () => { await openBaseTab(last.id, 'graficos'); const m = currentMeta(); if (m && m.id === last.id && S.rows) exportChartsPdf(m); }, !last || !(last.charts || []).length),
    qrow('board', 'Painel geral', 'Gráficos de várias planilhas numa tela só.', () => openBoard()),
    qrow('file', 'Planilhas modelo', 'Vendas, financeiro, estoque, RH e marketing.', () => templatesDialog(null), ro),
    qrow('upload', 'Google Sheets', 'Conecte uma planilha que se atualiza sozinha.', () => sheetDialog(), ro),
    qrow('model', 'Ligar planilhas', S.bases.length >= 2 ? 'Junte planilhas por uma coluna em comum.' : 'Disponível com 2 planilhas ou mais.', () => openModel(), !S.bases.length),
    qrow('building', 'Consultas', 'CNPJ e CEP com dados públicos.', openConsultas),
    qrow('user', 'Meu perfil', 'Nome, empresa, conta e sua marca nos relatórios.', openProfile),
  ];
  const empty = (txt, btn) => el('div', { class: 'db-empty' }, el('p', { text: txt }), btn || null);

  const filter = () => {
    const q = fold(search.value.trim()); let n = 0;
    for (const r of list.querySelectorAll('.db-row')) { const ok = !q || r._find.includes(q); r.hidden = !ok; if (ok) n++; }
    list.querySelector('.db-none')?.remove();
    if (q && !n) list.append(el('div', { class: 'db-empty db-none' }, el('p', { text: `Nada encontrado para “${search.value.trim()}”.` })));
  };
  const fill = () => {
    list.innerHTML = ''; toolbar.innerHTML = ''; cks = [];
    if (homeTab === 'atalhos') list.append(...shortcuts());
    else {
      const src = homeTab === 'graficos' ? withCharts : entries;
      if (!src.length) list.append(homeTab === 'graficos' && S.bases.length
        ? empty('Nenhuma planilha com gráficos ainda. Abra uma planilha e toque em “Refazer gráficos”.')
        : empty('Você ainda não tem planilhas. Envie um arquivo ou experimente com dados de exemplo.',
          el('button', { class: 'btn', disabled: ro, onclick: () => createSample(true) }, 'Experimentar com dados de exemplo')));
      else {
        list.append(...src.map(baseRow));
        toolbar.append(
          el('label', { class: 'db-all' }, allCk, el('span', { text: `${nf.format(entries.length)} ${entries.length === 1 ? 'planilha' : 'planilhas'} · ${nf.format(rowsN)} linhas · ${nf.format(chartsN)} gráficos` })),
          el('span', { class: 'spacer' }),
          ro ? null : el('button', { class: 'btn sm danger', onclick: () => bulkDelete(S.bases.map(b => b.id)) }, 'Excluir todas'));
      }
    }
    for (const p of pills.children) { const on = p.dataset.k === homeTab; p.classList.toggle('on', on); p.setAttribute('aria-selected', String(on)); }
    filter(); sync();
  };
  search.addEventListener('input', () => { if (homeTab === 'graficos' && search.value) { homeTab = 'recentes'; fill(); } else filter(); });
  search.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = [...list.querySelectorAll('.db-row')].find(x => !x.hidden); if (r) r.click(); } });
  for (const [k, label, ic] of tabs) {
    const n = k === 'recentes' ? entries.length : k === 'graficos' ? withCharts.length : 0;
    pills.append(el('button', { class: 'db-pill', type: 'button', role: 'tab', 'data-k': k, onclick: () => { homeTab = k; fill(); } }, icon(ic, 14), label, n ? el('span', { class: 'db-n', text: String(n) }) : null));
  }

  const home = el('div', { class: 'home db-home' },
    title, meta, box, types, checklist(),
    el('section', { class: 'db-sec' }, pills, toolbar, bar, list),
    el('div', { class: 'home-help' }, helpBar('home')));
  fill();
  return el('div', { class: 'view' }, home);
}

export { homeView };
