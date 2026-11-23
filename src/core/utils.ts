/* ============ Utilidades ============ */
type Kid = Node | string | number | null | undefined | false | Kid[];
type Attrs = Record<string, any>;

const $ = <T extends Element = HTMLElement>(s: string): T => document.querySelector(s) as T;

/** Cria um elemento: atributos ("class", "text", "on…" para eventos) e filhos (nós ou texto). */
const el = <K extends keyof HTMLElementTagNameMap>(tag: K | string, attrs: Attrs = {}, ...kids: Kid[]): any => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of (kids as unknown[]).flat() as Array<Node | string | number | null | undefined | false>)
    if (k != null && k !== false) e.append(typeof k === 'object' && 'nodeType' in k ? k : document.createTextNode(String(k)));
  return e;
};

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
/** Número em pt-BR; a partir de 1 milhão, no formato curto ("1,2 mi"). */
const fmtNum = (n: number | null | undefined): string => (n == null || isNaN(n)) ? '—' : (Math.abs(n) >= 1e6 ? nfc.format(n) : nf.format(n));
/** "2026-11-23" → "23/11/2026"; "2026-11" → "11/2026"; "2026" → "2026". */
const fmtDate = (s: string | null | undefined): string => { if (!s) return ''; const [y, m, d] = s.split('-'); return d ? `${d}/${m}/${y}` : (m ? `${m}/${y}` : y); };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
const fmtWhen = (t: number | string | Date | null | undefined): string => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const uid8 = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function toast(msg: string, err = false, ms = 3800): HTMLElement { const t = el('div', { class: 'toast' + (err ? ' err' : ''), text: msg }); $('#toasts').append(t); setTimeout(() => t.remove(), ms); return t; }
function css(v: string): string { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

export { $, MESES, css, el, fmtDate, fmtNum, fmtWhen, nf, nfc, toast, uid8 };
