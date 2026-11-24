import { openBase, signIn } from '../app/init.js';
import { icon, render } from '../app/render.js';
import { autoCharts } from '../charts/auto-charts.js';
import { S } from '../core/state.js';
import { handleWriteError, saveBase, saveMeta } from '../core/storage.js';
import { $, el, fmtWhen, nf, toast, uid8 } from '../core/utils.ts';
import { convert } from '../core/values.ts';
import { nfeTable } from '../import/nfe.ts';
import { DOC_EXT } from '../import/pdf-image.js';
import { SHEET_EXT, fileTables } from '../import/upload.js';
import { autoClean, cleanInfo } from './auto-clean.js';
import { keepCalcs } from './calc-columns.js';
import { formModal } from './extras.js';

/* ----- Google Drive: uma pasta inteira ou arquivos escolhidos viram planilhas -----
   Tudo roda no navegador (plano gratuito): o botão "Atualizar" confere o Drive e
   cria planilhas para arquivos novos e substitui os dados dos que mudaram.
   A permissão do Google vale por cerca de 1 hora; depois, um clique na conta renova. */
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const FOLDER = 'application/vnd.google-apps.folder', GSHEET = 'application/vnd.google-apps.spreadsheet';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let EXTS = null; // montada no primeiro uso (os módulos de leitura importam este de volta)
const exts = () => EXTS || (EXTS = [...SHEET_EXT.filter(e => e !== 'txt'), ...DOC_EXT, 'ofx', 'xml']);
const MAX_FILES = 300, MAX_BYTES = 40 * 1024 * 1024;
const extOf = n => String(n || '').toLowerCase().split('.').pop();
const isSupported = f => f.mimeType === GSHEET || (f.mimeType !== FOLDER && exts().includes(extOf(f.name)));
const fail = code => Object.assign(new Error(code), { code });

/* ---------- permissão (token de acesso do Google) ---------- */
let tok = null;
try { const s = JSON.parse(sessionStorage.getItem('driveTok') || 'null'); if (s && s.exp > Date.now()) tok = s; } catch { /* sem armazenamento */ }
const hasToken = () => !!(tok && tok.uid === S.uid && tok.exp > Date.now() + 60000);
function dropToken() { tok = null; try { sessionStorage.removeItem('driveTok'); } catch { /* ok */ } }

// Abre a janela do Google pedindo leitura do Drive. Precisa ser chamada logo no clique (senão o navegador bloqueia a janela).
async function ensureToken() {
  if (S.mode !== 'cloud' || !S.auth || !S.auth.currentUser) throw fail('login');
  if (hasToken()) return;
  const p = new firebase.auth.GoogleAuthProvider();
  p.addScope(SCOPE);
  const u = S.auth.currentUser; if (u.email) p.setCustomParameters({ login_hint: u.email });
  let r;
  try { r = await u.reauthenticateWithPopup(p); }
  catch (e) {
    if (e.code === 'auth/user-mismatch') throw fail('mismatch');
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') throw fail('cancel');
    if (e.code === 'auth/popup-blocked') throw fail('popup');
    throw e;
  }
  const v = r && r.credential && r.credential.accessToken;
  if (!v) throw fail('scope');
  tok = { v, exp: Date.now() + 55 * 60000, uid: S.uid };
  try { sessionStorage.setItem('driveTok', JSON.stringify(tok)); } catch { /* ok */ }
}

async function api(path, params = {}, blob = false) {
  if (!hasToken()) throw fail('auth');
  const u = new URL('https://www.googleapis.com/drive/v3/' + path);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + tok.v } });
  if (r.status === 401) { dropToken(); throw fail('auth'); }
  if (r.status === 404) throw fail('notfound');
  if (r.status === 403) {
    const j = await r.json().catch(() => ({})), why = JSON.stringify(j);
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(why)) throw fail('api-off');
    if (/insufficient|scope/i.test(why)) { dropToken(); throw fail('scope'); }
    throw fail('forbidden');
  }
  if (!r.ok) throw fail('http');
  return blob ? r.blob() : r.json();
}
const FIELDS = 'id,name,mimeType,modifiedTime,size,trashed';
async function listQuery(q, max = 1000) {
  const out = []; let pageToken = null;
  do {
    const j = await api('files', { q, fields: `nextPageToken,files(${FIELDS})`, pageSize: 1000, orderBy: 'folder,name_natural', supportsAllDrives: true, includeItemsFromAllDrives: true, pageToken });
    out.push(...(j.files || [])); pageToken = j.nextPageToken;
  } while (pageToken && out.length < max);
  return out;
}
const children = id => listQuery(`'${id}' in parents and trashed=false`);
// todos os arquivos aceitos da pasta, incluindo subpastas
async function folderFiles(id) {
  const files = [], queue = [[id, 0]], seen = new Set();
  while (queue.length && files.length < MAX_FILES) {
    const [fid, depth] = queue.shift(); if (seen.has(fid)) continue; seen.add(fid);
    for (const f of await children(fid)) {
      if (f.mimeType === FOLDER) { if (depth < 6) queue.push([f.id, depth + 1]); }
      else if (isSupported(f)) files.push(f);
    }
  }
  return files.slice(0, MAX_FILES);
}
async function download(f) {
  if (f.mimeType === GSHEET) return new File([await api(`files/${f.id}/export`, { mimeType: XLSX }, true)], f.name + '.xlsx');
  return new File([await api(`files/${f.id}`, { alt: 'media', supportsAllDrives: true }, true)], f.name);
}

function errorText(e) {
  return ({
    login: 'Entre com sua conta Google para conectar o Google Drive.',
    mismatch: 'Escolha a mesma conta Google com que você entrou no painel.',
    cancel: 'Conexão com o Google Drive cancelada.',
    popup: 'O navegador bloqueou a janela do Google. Libere as janelas deste site e tente de novo.',
    scope: 'O Google não liberou a leitura do Drive. Tente de novo e marque a caixa “Ver os arquivos do Google Drive”.',
    auth: 'A permissão do Google Drive expirou. Toque em Atualizar de novo para renovar.',
    'api-off': 'A leitura do Google Drive ainda não está ligada neste projeto (Google Drive API). Quem administra o painel precisa ativá-la no Google Cloud.',
    forbidden: 'O Google Drive recusou o acesso a este arquivo ou pasta.',
    notfound: 'Arquivo ou pasta não encontrado no Google Drive.',
  })[e && e.code] || 'Não foi possível falar com o Google Drive agora. Confira sua internet e tente de novo.';
}

/* ---------- conexões salvas na conta ---------- */
async function saveDrives(list) {
  S.drives = list;
  if (S.mode === 'cloud' && S.db && S.uid) await S.db.doc(`data/users/${S.uid}/app`).set({ drives: list }, { merge: true });
}
const connBases = c => S.bases.filter(b => b.source && b.source.type === 'gdrive' && b.source.conn === c.id);
const connTitle = c => c.mode === 'folder' ? (c.folder && c.folder.name) || 'Pasta' : `${c.files.length} ${c.files.length === 1 ? 'arquivo escolhido' : 'arquivos escolhidos'}`;

/* ---------- atualização ---------- */
async function createBase(tb, src) {
  const meta = { id: uid8(), name: tb.name, fileName: tb.fileName, columns: tb.columns, createdAt: Date.now(), charts: autoCharts(tb.columns, tb.rows), cleanLog: cleanInfo(tb), source: src };
  await saveBase(meta, tb.rows);
  if (!S.bases.find(b => b.id === meta.id)) S.bases.unshift(structuredClone(meta));
  return meta;
}
// troca os dados mantendo nome, gráficos, tipos que a pessoa ajustou e colunas calculadas (como no Google Sheets)
async function replaceBase(old, tb, src) {
  if (S.currentId === old.id && S.dirty) return false;
  const m = structuredClone(old), types = new Map(m.columns.map(c => [c.name, c.type]));
  const cols = keepCalcs(m.columns, tb.columns.map(c => ({ name: c.name, type: types.get(c.name) || c.type })));
  const rows = tb.rows.map(r => r.map((v, j) => cols[j].type !== tb.columns[j].type ? convert(v, cols[j].type) : v));
  m.columns = cols; m.fileName = tb.fileName; m.cleanLog = cleanInfo(tb); m.source = src;
  const names = new Set(cols.map(c => c.name));
  m.charts = (m.charts || []).filter(c => (!c.x || names.has(c.x)) && (!c.y || names.has(c.y)));
  if (!m.charts.length) m.charts = autoCharts(cols, rows);
  await saveBase(m, rows, 'Antes da atualização pelo Google Drive');
  const i = S.bases.findIndex(b => b.id === m.id); if (i >= 0) S.bases[i] = structuredClone(m);
  if (S.currentId === m.id) { S.rows = rows; S.dirty = false; }
  return true;
}

const syncing = new Set();
async function syncConn(c, t) {
  const say = m => { if (t) t.textContent = m; };
  say(`Conferindo “${connTitle(c)}” no Google Drive…`);
  let files = [];
  if (c.mode === 'folder') files = await folderFiles(c.folder.id);
  else for (const x of c.files) {
    try { const f = await api(`files/${x.id}`, { fields: FIELDS, supportsAllDrives: true }); if (!f.trashed) files.push(f); }
    catch (e) { if (e.code !== 'notfound' && e.code !== 'forbidden') throw e; } // sumiu ou perdeu acesso: conta como "saiu do Drive"
  }
  const bases = connBases(c), out = { created: 0, updated: 0, same: 0, skipped: 0, failed: [], missing: 0, notes: [] }, now = Date.now();
  const xmls = files.filter(f => extOf(f.name) === 'xml' && f.mimeType !== GSHEET), others = files.filter(f => !xmls.includes(f));
  let n = 0;
  for (const f of others) {
    n++;
    const parts = bases.filter(b => b.source.fileId === f.id);
    if (parts.length && parts.every(p => p.source.modifiedTime === f.modifiedTime)) { out.same++; continue; }
    if (f.size && +f.size > MAX_BYTES) { out.failed.push(`${f.name} (maior que 40 MB)`); continue; }
    try {
      say(`Lendo “${f.name}” (${n} de ${others.length})…`);
      const r = await fileTables(await download(f), { preview: false, onMsg: say });
      out.notes.push(...r.notes);
      const tables = r.tables.map(autoClean).filter(tb => tb.rows.length && tb.columns.length);
      if (!tables.length) { out.failed.push(f.name); continue; }
      for (let i = 0; i < tables.length; i++) {
        const src = { type: 'gdrive', conn: c.id, fileId: f.id, part: i, modifiedTime: f.modifiedTime, name: f.name, syncedAt: now };
        const old = parts.find(p => (p.source.part || 0) === i);
        if (old) { if (await replaceBase(old, tables[i], src)) out.updated++; else out.skipped++; }
        else { await createBase(tables[i], src); out.created++; }
      }
    } catch (e) { if (['auth', 'api-off', 'scope'].includes(e.code)) throw e; console.error(e); out.failed.push(f.name); }
  }
  // notas fiscais em XML: todas da conexão viram uma planilha só
  if (xmls.length) {
    const sig = xmls.map(f => f.id + ':' + f.modifiedTime).sort().join('|'), old = bases.find(b => b.source.fileId === 'xml');
    if (old && old.source.sig === sig) out.same++;
    else {
      say(`Lendo ${xmls.length === 1 ? 'a nota fiscal' : `${xmls.length} notas fiscais`}…`);
      const list = [];
      for (const f of xmls) { try { list.push({ name: f.name, xml: await (await download(f)).text() }); } catch (e) { if (['auth', 'api-off', 'scope'].includes(e.code)) throw e; out.failed.push(f.name); } }
      const r = nfeTable(list);
      if (r.table) {
        const tb = autoClean(r.table), src = { type: 'gdrive', conn: c.id, fileId: 'xml', sig, name: `${xmls.length} XML`, syncedAt: now };
        if (old) { if (await replaceBase(old, tb, src)) out.updated++; else out.skipped++; } else { await createBase(tb, src); out.created++; }
      }
    }
  }
  // planilhas cujo arquivo saiu do Drive: não apagamos, só marcamos
  const present = new Set(files.map(f => f.id)); if (xmls.length) present.add('xml');
  for (const b of bases) {
    const missing = !present.has(b.source.fileId);
    if (missing) out.missing++;
    if (!!b.source.missing !== missing) { const m = structuredClone(b); m.source.missing = missing; try { await saveMeta(m); Object.assign(b, m); } catch (e) { console.warn(e); } }
  }
  return out;
}

async function refresh(conns) {
  if (S.readOnly) { toast('Acesso somente leitura.', true); return; }
  conns = (conns || S.drives || []).filter(c => !syncing.has(c.id));
  if (!conns.length) return;
  try { await ensureToken(); } catch (e) { toast(errorText(e), e.code !== 'cancel', 7000); return; }
  const t = toast('Conferindo o Google Drive…', false, 900000);
  const tot = { created: 0, updated: 0, same: 0, skipped: 0, failed: [], missing: 0, notes: [] };
  conns.forEach(c => syncing.add(c.id)); render();
  try {
    for (const c of conns) {
      const r = await syncConn(c, t);
      for (const k of ['created', 'updated', 'same', 'skipped', 'missing']) tot[k] += r[k];
      tot.failed.push(...r.failed); tot.notes.push(...r.notes);
      c.syncedAt = Date.now();
    }
    await saveDrives(S.drives.map(d => conns.find(c => c.id === d.id) || d));
    const parts = [];
    if (tot.created) parts.push(`${tot.created} ${tot.created === 1 ? 'planilha nova' : 'planilhas novas'}`);
    if (tot.updated) parts.push(`${tot.updated} ${tot.updated === 1 ? 'atualizada' : 'atualizadas'}`);
    if (!parts.length) parts.push('Nada mudou no Drive desde a última atualização');
    if (tot.skipped) parts.push(`${tot.skipped} com edições não salvas aqui (salve e atualize de novo)`);
    if (tot.missing) parts.push(`${tot.missing} não ${tot.missing === 1 ? 'está' : 'estão'} mais no Drive (a planilha continua aqui)`);
    if (tot.failed.length) parts.push(`não deu para ler: ${tot.failed.slice(0, 4).join(', ')}${tot.failed.length > 4 ? '…' : ''}`);
    toast(parts.join(' · ') + '.', tot.failed.length > 0, tot.failed.length || tot.missing ? 9000 : 4500);
  } catch (e) { console.error(e); toast(errorText(e), true, 8000); }
  finally { t.remove(); conns.forEach(c => syncing.delete(c.id)); render(); }
}

/* ---------- janela para escolher pasta ou arquivos ---------- */
async function driveDialog() {
  if (S.readOnly) { toast('Acesso somente leitura.', true); return; }
  if (S.mode !== 'cloud') { toast(errorText(fail('login')), true, 6000); return; }
  try { await ensureToken(); } catch (e) { toast(errorText(e), e.code !== 'cancel', 7000); return; }

  let mode = 'folder', root = 'root', path = [{ id: 'root', name: 'Meu Drive' }], items = [], query = '';
  const picked = new Map(); // arquivos marcados (modo "arquivos específicos")
  const list = el('div', { class: 'dv-list', role: 'list' }), crumbs = el('div', { class: 'dv-crumbs' }), info = el('p', { class: 'dv-info' });
  const search = el('input', { class: 'dv-search', type: 'search', placeholder: 'Procurar no Drive pelo nome…', 'aria-label': 'Procurar no Google Drive' });
  const seg = (k, label, desc) => el('button', { type: 'button', class: 'dv-mode', 'data-k': k, onclick: () => { mode = k; paint(); } }, el('b', { text: label }), el('span', { text: desc }));
  const modes = el('div', { class: 'dv-modes', role: 'radiogroup', 'aria-label': 'O que conectar' },
    seg('folder', 'Pasta inteira', 'Todos os arquivos da pasta e das subpastas, inclusive os que entrarem depois'),
    seg('files', 'Arquivos específicos', 'Só os arquivos que você marcar'));
  const rootBtn = (k, label) => el('button', { type: 'button', class: 'db-pill', 'data-r': k, onclick: () => { root = k; query = ''; search.value = ''; path = k === 'root' ? [{ id: 'root', name: 'Meu Drive' }] : [{ id: 'shared', name: 'Compartilhados comigo' }]; load(); } }, label);
  const roots = el('div', { class: 'dv-roots' }, rootBtn('root', 'Meu Drive'), rootBtn('shared', 'Compartilhados comigo'));
  const here = () => path[path.length - 1];

  async function load() {
    list.innerHTML = ''; list.append(el('div', { class: 'dv-empty' }, el('span', { class: 'spinner' })));
    try {
      if (query) items = await listQuery(`name contains '${query.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed=false`, 300);
      else if (here().id === 'shared') items = await listQuery('sharedWithMe and trashed=false', 500);
      else items = await children(here().id);
      items = items.filter(f => f.mimeType === FOLDER || isSupported(f));
    } catch (e) { items = []; list.innerHTML = ''; list.append(el('div', { class: 'dv-empty', text: errorText(e) })); return; }
    paint();
  }
  function paint() {
    for (const b of modes.children) { const on = b.dataset.k === mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.setAttribute('role', 'radio'); }
    for (const b of roots.children) b.classList.toggle('on', b.dataset.r === root && !query);
    crumbs.innerHTML = '';
    if (query) crumbs.append(el('span', { text: `Resultados para “${query}”` }));
    else path.forEach((p, i) => { if (i) crumbs.append(el('span', { class: 'sep', text: '›' })); crumbs.append(i === path.length - 1 ? el('b', { text: p.name }) : el('button', { type: 'button', class: 'linkish', onclick: () => { path = path.slice(0, i + 1); load(); } }, p.name)); });
    {
      list.innerHTML = '';
      if (!items.length) list.append(el('div', { class: 'dv-empty', text: query ? 'Nada encontrado com esse nome.' : 'Nenhuma pasta ou arquivo aceito aqui.' }));
      for (const f of items) {
        const folder = f.mimeType === FOLDER;
        const ck = !folder && mode === 'files' ? el('input', { type: 'checkbox', checked: picked.has(f.id), 'aria-label': `Escolher “${f.name}”`, onclick: e => e.stopPropagation(), onchange: e => { if (e.target.checked) picked.set(f.id, { id: f.id, name: f.name }); else picked.delete(f.id); paintFoot(); } }) : null;
        list.append(el('div', { class: 'dv-row' + (folder ? ' folder' : '') + (!folder && mode === 'folder' ? ' muted-row' : ''), role: 'listitem', tabindex: folder || ck ? '0' : '-1',
          onclick: () => { if (folder) { query = ''; search.value = ''; path.push({ id: f.id, name: f.name }); load(); } else if (ck) { ck.checked = !ck.checked; ck.dispatchEvent(new Event('change')); } },
          onkeydown: e => { if (e.key === 'Enter') e.currentTarget.click(); } },
        ck || el('span', { class: 'dv-ck-space' }),
        el('span', { class: 'db-ic' }, icon(folder ? 'folder' : f.mimeType === GSHEET ? 'table' : extOf(f.name) === 'pdf' ? 'pdf' : 'sheet', 16)),
        el('span', { class: 'dv-nm', text: f.name }),
        el('span', { class: 'dv-when', text: folder ? 'Pasta' : f.modifiedTime ? `Alterado em ${new Date(f.modifiedTime).toLocaleDateString('pt-BR')}` : '' }),
        folder ? el('span', { class: 'dv-go', 'aria-hidden': 'true', text: '›' }) : null));
      }
    }
    paintFoot();
  }
  function paintFoot() {
    if (mode === 'folder') {
      const ok = !query && here().id !== 'shared';
      info.textContent = ok ? `Vai conectar a pasta “${here().name}”: cada planilha, extrato, PDF ou nota fiscal dela (e das subpastas) vira uma planilha aqui.` : 'Abra uma pasta da lista para conectar ela inteira.';
      dlg.ok.textContent = ok ? `Conectar a pasta “${here().name}”` : 'Escolha uma pasta';
    } else {
      info.textContent = picked.size ? `${picked.size} ${picked.size === 1 ? 'arquivo marcado' : 'arquivos marcados'}. Você pode abrir outras pastas e marcar mais.` : 'Marque os arquivos que quer trazer. Dá para abrir pastas e procurar pelo nome.';
      dlg.ok.textContent = picked.size ? `Conectar ${picked.size} ${picked.size === 1 ? 'arquivo' : 'arquivos'}` : 'Marque os arquivos';
    }
  }
  let searchT = null;
  search.addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(() => { query = search.value.trim(); load(); }, 350); });

  const content = el('div', { class: 'dv-form' }, modes, el('div', { class: 'dv-bar' }, roots, search), crumbs, list, info,
    el('p', { class: 'muted dv-tip', text: 'Aceita Excel, CSV, ODS, Google Planilhas, extrato em PDF ou OFX, nota fiscal em XML e foto de tabela. Depois, o botão “Atualizar” traz arquivos novos e alterações.' }));
  const dlg = formModal('Conectar Google Drive', '', content, 'Conectar', async () => {
    let conn;
    if (mode === 'folder') {
      if (query || here().id === 'shared') { toast('Abra a pasta que quer conectar.', true); return false; }
      conn = { id: uid8(), mode: 'folder', folder: { id: here().id, name: here().name }, files: [], createdAt: Date.now() };
    } else {
      if (!picked.size) { toast('Marque pelo menos um arquivo.', true); return false; }
      conn = { id: uid8(), mode: 'files', folder: null, files: [...picked.values()], createdAt: Date.now() };
    }
    try { await saveDrives([...(S.drives || []), conn]); } catch (e) { handleWriteError(e); return false; }
    openDrive(); refresh([conn]);
  }, 'drive-modal');
  load();
}

/* ---------- tela "Google Drive" ---------- */
function openDrive() { S.view = 'drive'; $('#aside').classList.remove('open'); render(); }

function moreMenu(c) {
  return async () => {
    if (!confirm(`Desconectar “${connTitle(c)}”? As planilhas que já vieram do Drive continuam aqui, só param de ser atualizadas.`)) return;
    try { await saveDrives(S.drives.filter(d => d.id !== c.id)); toast('Conexão removida. As planilhas continuam no painel.'); render(); }
    catch (e) { handleWriteError(e); }
  };
}

function driveView() {
  const view = el('div', { class: 'view board dv-view' });
  const conns = S.drives || [];
  const busy = conns.some(c => syncing.has(c.id));
  view.append(el('div', { class: 'board-head dv-head' },
    el('div', {}, el('h1', { text: 'Google Drive' }),
      el('p', { text: 'Conecte uma pasta inteira ou só alguns arquivos. Cada arquivo vira uma planilha aqui. Quando algo mudar no Drive, toque em Atualizar.' })),
    S.mode === 'cloud' && !S.readOnly ? el('div', { class: 'dv-head-btns' },
      conns.length ? el('button', { class: 'btn', disabled: busy, onclick: () => refresh() }, icon('refresh', 14), busy ? 'Atualizando…' : 'Atualizar tudo') : null,
      el('button', { class: 'btn primary', onclick: driveDialog }, icon('plus', 14), 'Conectar pasta ou arquivos')) : null));

  if (S.mode !== 'cloud') {
    view.append(el('div', { class: 'teach' }, el('b', { text: 'Entre com sua conta Google' }),
      el('p', { text: 'O Google Drive é ligado à sua conta. Entre para conectar pastas e arquivos; na demonstração sem conta isso não fica disponível.' }),
      el('div', { class: 'teach-btns' }, el('button', { class: 'btn primary', onclick: e => signIn(e.currentTarget) }, 'Entrar com Google'))));
    return view;
  }
  if (!conns.length) {
    view.append(el('div', { class: 'teach' }, el('b', { text: 'Nenhuma pasta ou arquivo conectado ainda' }),
      el('p', { text: 'Escolha uma pasta (tudo que estiver nela vira planilha, inclusive arquivos novos) ou marque só os arquivos que quiser.' }),
      el('div', { class: 'teach-btns' }, el('button', { class: 'btn primary', disabled: S.readOnly, onclick: driveDialog }, 'Conectar pasta ou arquivos'))));
  }
  const list = el('div', { class: 'dv-conns' });
  for (const c of conns) {
    const bs = connBases(c), on = syncing.has(c.id);
    const sub = [c.mode === 'folder' ? 'Pasta inteira, com subpastas' : 'Arquivos escolhidos', `${bs.length} ${bs.length === 1 ? 'planilha' : 'planilhas'}`, c.syncedAt ? `atualizado em ${fmtWhen(c.syncedAt)}` : 'ainda não atualizado'].join(' · ');
    list.append(el('section', { class: 'dv-conn' },
      el('div', { class: 'dv-conn-h' },
        el('span', { class: 'db-ic' }, icon(c.mode === 'folder' ? 'folder' : 'file', 16)),
        el('div', { class: 'db-name' }, el('b', { text: connTitle(c) }), el('span', { text: sub })),
        el('button', { class: 'btn sm', disabled: on || S.readOnly, onclick: () => refresh([c]) }, icon('refresh', 13), on ? 'Atualizando…' : 'Atualizar'),
        el('button', { class: 'icon-btn', title: 'Desconectar', 'aria-label': `Desconectar ${connTitle(c)}`, disabled: S.readOnly, onclick: moreMenu(c) }, icon('close', 15))),
      bs.length ? el('div', { class: 'dv-bases' }, ...bs.map(b => el('button', { class: 'dv-base' + (b.source.missing ? ' gone' : ''), title: b.source.missing ? 'O arquivo não está mais no Drive; a planilha continua aqui' : `Abrir “${b.name}”`, onclick: () => openBase(b.id) },
        icon('sheet', 14), el('span', { text: b.name }), b.source.missing ? el('small', { text: 'saiu do Drive' }) : null)))
        : el('p', { class: 'muted dv-none', text: on ? 'Trazendo os arquivos…' : 'Toque em Atualizar para trazer os arquivos.' })));
  }
  view.append(list);
  view.append(el('p', { class: 'muted dv-foot', text: 'Arquivos apagados do Drive não são apagados aqui. Edições feitas no painel numa planilha do Drive são substituídas na próxima atualização (a versão anterior fica no histórico, quando a planilha estiver aberta). O Google pede para confirmar o acesso de novo depois de cerca de 1 hora.' }));
  return view;
}

export { driveDialog, driveView, openDrive, refresh as refreshDrive };
