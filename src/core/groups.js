import { S } from './state.js';

/* ----- Planilhas com abas -----
   Um Excel com abas de formatos diferentes (ex.: Vendas e Estoque) vira uma planilha por aba
   por dentro (cada uma com sua tabela e seus gráficos), mas aparece como UM item, com as abas
   para escolher. Envios novos guardam meta.group = {id, name} e meta.sheetLabel.
   Envios antigos são reconhecidos pelo nome do arquivo + hora do envio (até 3 min de diferença). */
const SEP = ' — ';
const BOOK_RX = /\.(xlsx|xls|xlsm|ods)$/i;
const GAP = 3 * 60 * 1000;

let cache = { list: null, n: -1, map: null };
function groupsMap() {
  if (cache.list === S.bases && cache.n === S.bases.length && cache.stamp === stamp()) return cache.map;
  const map = new Map(), derived = new Map();
  for (const b of S.bases) {
    if (b.group && b.group.id) { (map.get(b.group.id) || map.set(b.group.id, []).get(b.group.id)).push(b); continue; }
    if (b.fileName && BOOK_RX.test(b.fileName)) (derived.get(b.fileName) || derived.set(b.fileName, []).get(b.fileName)).push(b);
  }
  // envios antigos: mesmo arquivo, enviados juntos (podem existir dois envios do mesmo arquivo)
  for (const [file, list] of derived) {
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let cur = [], last = -Infinity;
    const flush = () => { if (cur.length) map.set(`f:${file}:${cur[0].createdAt || 0}`, cur); cur = []; };
    for (const b of list) { if ((b.createdAt || 0) - last > GAP) flush(); cur.push(b); last = b.createdAt || 0; }
    flush();
  }
  for (const [k, list] of map) {
    if (list.length < 2) { map.delete(k); continue; }
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || String(a.name).localeCompare(String(b.name)));
  }
  cache = { list: S.bases, n: S.bases.length, stamp: stamp(), map };
  return map;
}
// muda quando nomes/grupos mudam (S.bases pode ser a mesma lista com itens trocados)
const stamp = () => S.bases.map(b => b.id + (b.group ? b.group.id + b.group.name : '') + b.name).join('|');

function groupKeyOf(meta) {
  if (!meta) return null;
  for (const [k, list] of groupsMap()) if (list.some(b => b.id === meta.id)) return k;
  return null;
}
/** Abas da mesma planilha (na ordem do arquivo), ou null se for uma planilha simples. */
function groupMembers(meta) { const k = groupKeyOf(meta); return k ? groupsMap().get(k) : null; }
function groupName(meta) {
  if (meta.group && meta.group.name) return meta.group.name;
  return String(meta.fileName || meta.name).replace(/\.[^.]+$/, '');
}
function sheetLabel(meta) {
  if (meta.sheetLabel) return meta.sheetLabel;
  const g = groupName(meta), n = String(meta.name || '');
  if (n.startsWith(g + SEP)) return n.slice(g.length + SEP.length) || 'Principal';
  return n === g ? 'Principal' : n;
}
/** Uma entrada por planilha: as abas de um mesmo arquivo viram um item só (na ordem de S.bases). */
function baseEntries(bases = S.bases) {
  const seen = new Set(), out = [];
  for (const b of bases) {
    const k = groupKeyOf(b);
    if (!k) { out.push({ key: b.id, name: b.name, first: b, members: [b] }); continue; }
    if (seen.has(k)) continue; seen.add(k);
    const members = groupsMap().get(k);
    out.push({ key: k, name: groupName(members[0]), first: members[0], members });
  }
  return out;
}
// rótulo de uma tabela juntada de várias abas (ex.: "Jan a Dez")
function mergedLabel(sheets) {
  if (!sheets || !sheets.length) return '';
  return sheets.length <= 3 ? sheets.join(' + ') : `${sheets[0]} a ${sheets[sheets.length - 1]}`;
}

export { SEP, baseEntries, groupKeyOf, groupMembers, groupName, mergedLabel, sheetLabel };
