/* ----- Nota fiscal eletrônica (XML da NF-e / NFC-e) -----
   Cada item da nota vira uma linha. Várias notas enviadas juntas viram uma tabela só.
   Aceita o XML autorizado (nfeProc) e o XML da nota (NFe); ignora eventos (cancelamento, carta de correção). */
import type { ColType } from '../core/values.ts';

export interface Table { name: string; fileName: string; columns: { name: string; type: ColType }[]; rows: (string | number | null)[][] }
export interface NfeResult { rows: (string | number | null)[][]; chave: string; numero: string; emitente: string }

const COLS: [string, ColType][] = [
  ['Data de emissão', 'date'], ['Número', 'text'], ['Série', 'text'], ['Modelo', 'text'], ['Operação', 'text'], ['Natureza da operação', 'text'],
  ['Emitente', 'text'], ['CNPJ/CPF do emitente', 'text'], ['UF do emitente', 'text'],
  ['Destinatário', 'text'], ['CNPJ/CPF do destinatário', 'text'], ['UF', 'text'], ['Município', 'text'],
  ['Código do produto', 'text'], ['Produto', 'text'], ['NCM', 'text'], ['CFOP', 'text'], ['Unidade', 'text'],
  ['Quantidade', 'number'], ['Valor unitário', 'number'], ['Desconto', 'number'], ['Valor do item', 'number'],
  ['Valor total da nota', 'number'], ['Chave de acesso', 'text'],
];

// elementos pelo nome local (o XML da NF-e usa namespace)
const kids = (p: Element | Document, tag: string): Element[] => Array.from(p.getElementsByTagNameNS('*', tag)).concat(Array.from(p.getElementsByTagName(tag))).filter((e, i, a) => a.indexOf(e) === i);
const first = (p: Element | Document | null | undefined, tag: string): Element | null => (p ? kids(p, tag)[0] || null : null);
const txt = (p: Element | Document | null | undefined, tag: string): string => (first(p, tag)?.textContent || '').trim();
const num = (s: string): number | null => { if (!s) return null; const n = parseFloat(s); return isNaN(n) ? null : n; };
const doc = (p: Element | null) => txt(p, 'CNPJ') || txt(p, 'CPF') || txt(p, 'idEstrangeiro');

/** Lê um XML de NF-e/NFC-e. Devolve null se o arquivo não for uma nota (ex.: evento de cancelamento). */
export function parseNfe(xml: string): NfeResult | null {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  if (d.getElementsByTagName('parsererror').length) throw new Error('XML inválido');
  const inf = first(d, 'infNFe');
  if (!inf) return null;
  const ide = first(inf, 'ide'), emit = first(inf, 'emit'), dest = first(inf, 'dest');
  const endD = first(dest, 'enderDest'), endE = first(emit, 'enderEmit');
  const data = (txt(ide, 'dhEmi') || txt(ide, 'dEmi')).slice(0, 10) || null;
  const mod = txt(ide, 'mod');
  const modelo = mod === '65' ? 'NFC-e' : mod === '55' ? 'NF-e' : mod || 'NF-e';
  const operacao = txt(ide, 'tpNF') === '0' ? 'Entrada' : 'Saída';
  const chave = (inf.getAttribute('Id') || '').replace(/^NFe/, '') || txt(d, 'chNFe');
  const emitente = txt(emit, 'xNome') || txt(emit, 'xFant');
  const destNome = txt(dest, 'xNome') || (modelo === 'NFC-e' ? 'Consumidor final' : '');
  const vNF = num(txt(first(inf, 'ICMSTot'), 'vNF'));
  const head = [data, txt(ide, 'nNF'), txt(ide, 'serie'), modelo, operacao, txt(ide, 'natOp'), emitente, doc(emit), txt(endE, 'UF'),
    destNome, doc(dest), txt(endD, 'UF') || null, txt(endD, 'xMun') || null];
  const rows = kids(inf, 'det').map(det => {
    const p = first(det, 'prod');
    return [...head, txt(p, 'cProd'), txt(p, 'xProd'), txt(p, 'NCM'), txt(p, 'CFOP'), txt(p, 'uCom'),
      num(txt(p, 'qCom')), num(txt(p, 'vUnCom')), num(txt(p, 'vDesc')) ?? 0, num(txt(p, 'vProd')), vNF, chave]
      .map(v => (v === '' ? null : v));
  });
  return { rows, chave, numero: txt(ide, 'nNF'), emitente };
}

/** Junta várias notas numa tabela; notas repetidas (mesma chave) entram uma vez só. */
export function nfeTable(files: { name: string; xml: string }[]): { table: Table | null; ignored: string[]; repeated: number } {
  const rows: (string | number | null)[][] = [], seen = new Set<string>(), ignored: string[] = []; let repeated = 0;
  const emitentes = new Set<string>();
  for (const f of files) {
    let r: NfeResult | null = null;
    try { r = parseNfe(f.xml); } catch { r = null; }
    if (!r || !r.rows.length) { ignored.push(f.name); continue; }
    if (r.chave && seen.has(r.chave)) { repeated++; continue; }
    if (r.chave) seen.add(r.chave);
    emitentes.add(r.emitente); rows.push(...r.rows);
  }
  if (!rows.length) return { table: null, ignored, repeated };
  rows.sort((a, b) => String(a[0] ?? '').localeCompare(String(b[0] ?? '')));
  const notas = seen.size || files.length - ignored.length;
  const quem = emitentes.size === 1 ? ` · ${[...emitentes][0]}` : '';
  const name = notas === 1 ? `NF-e ${rows[0][1]}${quem}` : `Notas fiscais (${notas})${quem}`;
  return { table: { name, fileName: files.length === 1 ? files[0].name : `${files.length} arquivos XML`, columns: COLS.map(([name, type]) => ({ name, type })), rows }, ignored, repeated };
}
