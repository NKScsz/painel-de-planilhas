import { icon, render } from './render.js';
import { $ } from '../core/utils.ts';
import { popMenu } from '../easy/simple-mode.js';

/* ----- Tema claro e escuro -----
   "auto" segue o sistema (celular/computador); a escolha fica guardada neste aparelho.
   O index.html aplica o tema antes de desenhar a página, para não piscar. */
const KEY = 'tema';
const pref = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } };
const systemLight = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
const resolved = () => { const p = pref(); return p === 'auto' ? (systemLight() ? 'light' : 'dark') : p; };

function applyTheme() {
  const t = resolved(), root = document.documentElement;
  root.dataset.theme = t; root.style.colorScheme = t;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t === 'light' ? '#fafafa' : '#141415');
  const b = $('#themeBtn'); if (b) { b.replaceChildren(icon(t === 'light' ? 'sun' : 'moon')); b.title = `Tema: ${{ auto: 'automático', light: 'claro', dark: 'escuro' }[pref()]}`; }
}
function setTheme(p) { try { localStorage.setItem(KEY, p); } catch { /* sem armazenamento: vale só nesta visita */ } applyTheme(); render(); }
function themeMenu(anchor) {
  const cur = pref(), mark = v => (cur === v ? ' (atual)' : '');
  popMenu(anchor, [
    { icon: 'monitor', label: 'Automático' + mark('auto'), hint: 'Igual ao celular ou computador: claro de dia, escuro à noite, se o sistema fizer isso', onclick: () => setTheme('auto') },
    { icon: 'sun', label: 'Claro' + mark('light'), hint: 'Fundo branco, bom para ambientes iluminados e para imprimir', onclick: () => setTheme('light') },
    { icon: 'moon', label: 'Escuro' + mark('dark'), hint: 'Fundo grafite, cansa menos a vista à noite', onclick: () => setTheme('dark') },
  ], 'Tema');
}
// sistema trocou de claro para escuro (ou o contrário) com o tema em "automático"
function watchSystemTheme() {
  if (!window.matchMedia) return;
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (pref() === 'auto') { applyTheme(); render(); } });
}

export { applyTheme, setTheme, themeMenu, watchSystemTheme };
