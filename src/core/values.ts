import { fmtDate, nf } from './utils.ts';

/* ============ Conversão de valores ============ */
export type ColType = 'number' | 'date' | 'text';
type Raw = string | number | boolean | Date | null | undefined;

/** Lê números como aparecem em planilhas e extratos brasileiros: "1.234,56", "R$ -5,00", "260,00-", "1.234,56 D", "(10)". */
function parseNum(v: Raw): number {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean' || v instanceof Date) return NaN;
  let s = String(v).trim().replace(/[−–—]/g, '-').replace(/ /g, ' ');
  let neg = false;
  const tail = s.match(/^(.*\d)\s*([DC]|-)$/i); if (tail) { s = tail[1]; if (tail[2] === '-' || tail[2].toUpperCase() === 'D') neg = true; }
  const sign = () => { s = s.replace(/^([+-])\s*/, (_x, g: string) => { if (g === '-') neg = !neg; return ''; }); };
  sign(); s = s.replace(/^R\$\s?/i, ''); sign();
  s = s.replace(/\s/g, '').replace(/%$/, '');
  if (/^\(.*\)$/.test(s)) { neg = !neg; s = s.slice(1, -1); }
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  const n = parseFloat(s); return neg ? -n : n;
}
function pad(n: number | string): string { return String(n).padStart(2, '0'); }
const MES_N: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
/** Data em texto ou Date → "AAAA-MM-DD" (ou null se não for uma data). */
function parseDate(v: Raw): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v !== 'string') return null;
  const s = v.trim(); let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(\s.*)?$/))) { let y = +m[3]; if (y < 100) y += 2000; const mo = +m[2], d = +m[1]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return `${y}-${pad(mo)}-${pad(d)}`; }
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})([T\s].*)?$/))) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  if ((m = s.match(/^(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:de\s+)?(\d{4})$/i))) return `${m[3]}-${pad(MES_N[m[2].toLowerCase()])}-${pad(+m[1])}`;
  return null;
}
/** Procura uma data dentro de um texto livre ("04 de novembro 2026", "05/11/2026"). */
function findDate(t: unknown): string | null {
  let m = String(t).match(/(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:de\s+)?(\d{4})/i);
  if (m) return `${m[3]}-${pad(MES_N[m[2].toLowerCase()])}-${pad(+m[1])}`;
  m = String(t).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/); if (m) return parseDate(m[0]);
  return null;
}
const CODE_RX = /(^id$|^id[_\s]|[_\s]id$|c[oó]d|cpf|cnpj|cep|telefone|celular|fone|matr[ií]cula|^n[º°o.]?\s*$|^nr|placa|rg$|nota fiscal|^nf)/i;
/** Decide o tipo da coluna pela maioria (85%) dos valores; códigos (CPF, CEP, id…) ficam como texto. */
function detectType(name: string, values: Raw[]): ColType {
  const vals = values.filter(v => v != null && v !== '');
  if (!vals.length) return 'text';
  const sample = vals.length > 3000 ? vals.filter((_, i) => i % Math.ceil(vals.length / 3000) === 0) : vals;
  let n = 0, d = 0;
  for (const v of sample) { if (v instanceof Date) { d++; continue; } if (!isNaN(parseNum(v))) n++; else if (parseDate(v)) d++; }
  if (d / sample.length >= .85) return 'date';
  if (n / sample.length >= .85) return CODE_RX.test(name) ? 'text' : 'number';
  return 'text';
}
function convert(v: Raw, type: ColType): string | number | null {
  if (v == null || v === '') return null;
  if (type === 'number') { const n = parseNum(v); return isNaN(n) ? (typeof v === 'string' ? v : null) : n; }
  if (type === 'date') { const d = parseDate(v); return d || (v instanceof Date ? null : String(v)); }
  if (v instanceof Date) return parseDate(v);
  if (type === 'text' && typeof v === 'number') return String(v);
  return typeof v === 'string' ? v.trim() : String(v);
}
function display(v: unknown, type: ColType): string {
  if (v == null || v === '') return '';
  if (type === 'number' && typeof v === 'number') return nf.format(v);
  if (type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  return String(v);
}

export { CODE_RX, MES_N, convert, detectType, display, findDate, pad, parseDate, parseNum };
