import { goHome, openBaseTab } from '../app/init.js';
import { icon, render } from '../app/render.js';
import { aggregate, chartLabels, describeChart, makeChart } from '../charts/draw-and-pdf.js';
import { HTML_TYPES, htmlChart } from '../charts/extra-types.js';
import { S } from '../core/state.js';
import { handleWriteError } from '../core/storage.js';
import { $, el, toast } from '../core/utils.ts';
import { imageButton } from '../features/chart-share.js';
import { getRows } from './data-model.js';

/* ----- Painel geral: gráficos de várias planilhas numa tela só -----
   Cada gráfico é fixado pelo alfinete no cartão dele (aba Gráficos). A lista fica na conta
   (documento data/users/{uid}/app, campo "board"); sem login, vale só nesta aba. */
const isPinned = (baseId, chartId) => (S.board || []).some(p => p.b === baseId && p.c === chartId);

async function saveBoard(list) {
  S.board = list;
  if (S.mode === 'cloud' && S.db && S.uid) await S.db.doc(`data/users/${S.uid}/app`).set({ board: list }, { merge: true });
}
async function togglePin(meta, spec) {
  const on = isPinned(meta.id, spec.id);
  const list = on ? S.board.filter(p => !(p.b === meta.id && p.c === spec.id)) : [...(S.board || []), { b: meta.id, c: spec.id }];
  try { await saveBoard(list); toast(on ? 'Gráfico tirado do painel geral.' : 'Gráfico fixado no painel geral. Abra pelo menu lateral.'); }
  catch (e) { handleWriteError(e); }
  render();
}
const pinButton = (meta, spec) => {
  const on = isPinned(meta.id, spec.id);
  return el('button', { class: 'icon-btn pin-btn' + (on ? ' on' : ''), title: on ? 'Tirar do painel geral' : 'Fixar no painel geral (junto com gráficos de outras planilhas)', 'aria-pressed': String(on), 'aria-label': on ? 'Tirar do painel geral' : 'Fixar no painel geral', onclick: () => togglePin(meta, spec) }, icon('pin'));
};

function openBoard() { S.view = 'painel'; $('#aside').classList.remove('open'); render(); }

function boardView() {
  const pins = S.board || [];
  const view = el('div', { class: 'view board' });
  view.append(el('div', { class: 'board-head' },
    el('h1', { text: 'Painel geral' }),
    el('p', { text: 'Gráficos de várias planilhas numa tela só. Para trazer um gráfico para cá, toque no alfinete dele, na aba Gráficos de qualquer planilha.' })));
  if (!pins.length) {
    view.append(el('div', { class: 'teach' },
      el('b', { text: 'Seu painel geral ainda está vazio' }),
      el('p', { text: 'Junte aqui os gráficos que você mais olha, mesmo que venham de planilhas diferentes: vendas, despesas e estoque lado a lado.' }),
      el('div', { class: 'teach-btns' }, el('button', { class: 'btn primary', onclick: goHome }, 'Escolher gráficos nas minhas planilhas'))));
    return view;
  }
  const grid = el('div', { class: 'charts board-grid' });
  view.append(grid);
  for (const p of pins) grid.append(boardCard(p));
  return view;
}

function boardCard(p) {
  const meta = S.bases.find(b => b.id === p.b), spec = meta && (meta.charts || []).find(c => c.id === p.c);
  const card = el('div', { class: 'chart-card board-card' + (spec && spec.wide ? ' wide' : '') });
  const remove = el('button', { class: 'icon-btn pin-btn on', title: 'Tirar do painel geral', 'aria-label': 'Tirar do painel geral', onclick: () => saveBoard(S.board.filter(x => x !== p)).then(render, handleWriteError) }, icon('pin'));
  if (!spec) {
    card.append(el('div', { class: 'chart-head' }, el('div', { style: 'flex:1' }, el('div', { class: 'chart-title', text: 'Gráfico não encontrado' }),
      el('div', { class: 'chart-sub', text: meta ? `Ele foi removido de “${meta.name}”.` : 'A planilha dele foi excluída.' })), remove));
    return card;
  }
  let res = null;
  const head = el('div', { class: 'chart-head' },
    el('div', { style: 'flex:1;min-width:0' }, el('div', { class: 'chart-title', text: spec.title || '…' }), el('div', { class: 'chart-sub board-src' }, icon('sheet', 13), meta.name)),
    imageButton(meta, spec, () => res),
    el('button', { class: 'icon-btn', title: 'Abrir a planilha', 'aria-label': `Abrir a planilha ${meta.name}`, onclick: () => openBaseTab(meta.id, 'graficos') }, icon('expand')),
    remove);
  const body = el('div', { class: 'board-body' }, el('div', { class: 'board-loading' }, el('span', { class: 'spinner' })));
  card.append(head, body);
  getRows(meta.id).then(rows => {
    if (!card.isConnected) return;
    res = aggregate(meta, spec, rows);
    const L = chartLabels(spec, res || { labels: [] });
    head.querySelector('.chart-title').textContent = L.title;
    body.innerHTML = '';
    if (!res || !res.labels.length) { body.append(el('div', { class: 'muted board-empty', text: 'Sem dados para este gráfico.' })); return; }
    if (HTML_TYPES.has(spec.type)) body.append(htmlChart(spec, res, meta));
    else { const box = el('div', { class: 'chart-box' }), cv = el('canvas', { role: 'img', 'aria-label': `${L.title} — ${meta.name}` }); box.append(cv); body.append(box); requestAnimationFrame(() => makeChart(cv, spec, res, L.yLabel)); }
    body.append(el('div', { class: 'chart-note' }, el('b', { text: 'Sobre este gráfico: ' }), describeChart(meta, spec, res, true)));
  }).catch(e => { console.error(e); body.innerHTML = ''; body.append(el('div', { class: 'muted board-empty', text: 'Não foi possível carregar esta planilha agora.' })); });
  return card;
}

export { boardView, isPinned, openBoard, pinButton, saveBoard, togglePin };
