/* ----- Perguntas livres, sem inteligência artificial -----
   Lê uma pergunta em português e a transforma numa consulta: o que medir, como agrupar, filtros e período.
   Tudo por regras e pelos nomes/valores da própria planilha. Quando não entende, diz isso e sugere exemplos;
   nunca chuta uma resposta. A interpretação ("Entendi assim") é sempre mostrada para a pessoa conferir. */
import { fmtNum, MESES } from '../core/utils.ts';

export type Agg = 'sum' | 'avg' | 'max' | 'min' | 'count';
export interface Col { name: string; type: 'number' | 'date' | 'text'; virtual?: boolean }
type Row = unknown[];
export interface Parsed {
  ok: true;
  measure: string | null;           // coluna numérica; null = contar registros
  agg: Agg;
  groupBy: string | null;
  time: boolean;                    // agrupado por data (evolução)
  order: 'desc' | 'asc';
  limit: number | null;
  filters: { col: string; val: string }[];
  range: { from: string; to: string; label: string } | null;
  sign: 'neg' | 'pos' | null;       // extrato sem coluna Movimento: só saídas (negativos) ou só entradas
  understood: string[];
}
export type ParseResult = Parsed | { ok: false; hint: string; examples: string[] };
export type Answer =
  | { kind: 'value'; value: number; n: number; detail?: string }
  | { kind: 'groups'; groups: { label: string; value: number }[]; total: number; n: number };

export const fold = (s: unknown): string => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const has = (q: string, ...rx: RegExp[]) => rx.some(r => r.test(q));
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const NUM_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12, quinze: 15, trinta: 30, noventa: 90 };
// palavras que nunca são filtro (mesmo que apareçam como valor numa célula)
const STOP = new Set(['se', 'es', 'do', 'da', 'de', 'em', 'no', 'na', 'ao', 'um', 'as', 'os', 'e', 'o', 'a', 'que', 'qual', 'quem', 'por', 'mais', 'menos', 'mes', 'ano', 'dia', 'total', 'outros', 'sim', 'nao', 'valor', 'com', 'para', 'foi', 'teve']);
const PERSON = /vendedor|vendedora|atendente|responsavel|funcionari|colaborador|consultor|representante|corretor|tecnico/;
const BUYER = /cliente|comprador|destinatario|paciente|aluno|membro/;
const MONEY = /valor|total|receita|faturamento|preco|montante|venda|vendas|liquido|bruto|pago|recebido/;

// "vendedor" casa com "vendedores"; "região" com "regiões"; nomes compostos casam como frase
function mentions(q: string, colName: string): number {
  const n = fold(colName); if (!n) return 0;
  const words = q.split(' ');
  if (n.includes(' ')) return (` ${q} `.includes(` ${n} `) || ` ${q} `.includes(` ${n}s `)) ? n.length : 0;
  if (n.length < 3) return words.includes(n) ? n.length : 0;
  const forms = [n, n + 's', n + 'es', n.endsWith('ao') ? n.slice(0, -2) + 'oes' : '', n.endsWith('l') ? n.slice(0, -1) + 'is' : ''].filter(Boolean);
  return words.some(w => forms.includes(w)) ? n.length : 0;
}

function dateRange(q: string, now: Date): { from: string; to: string; label: string; used: string[] } | null {
  const y = now.getFullYear(), m = now.getMonth(), today = iso(now);
  const mk = (a: Date, b: Date, label: string, used: string[]) => ({ from: iso(a), to: iso(b), label, used });
  if (/\bhoje\b/.test(q)) return mk(now, now, 'hoje', ['hoje']);
  if (/\bontem\b/.test(q)) { const d = new Date(y, m, now.getDate() - 1); return mk(d, d, 'ontem', ['ontem']); }
  if (/\b(esta|nesta|essa|nessa) semana\b/.test(q)) { const d = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7)); return { from: iso(d), to: today, label: 'esta semana', used: ['semana'] }; }
  if (/\bsemana passada\b/.test(q)) { const s = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7) - 7); return mk(s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6), 'semana passada', ['semana', 'passada']); }
  if (/\b(este|neste|esse|nesse) mes\b|\bmes atual\b/.test(q)) return { from: iso(new Date(y, m, 1)), to: today, label: 'este mês', used: ['mes'] };
  if (/\bmes passado\b|\bultimo mes\b|\bmes anterior\b/.test(q)) return mk(new Date(y, m - 1, 1), new Date(y, m, 0), `${MONTH_PT[(m + 11) % 12]} de ${m === 0 ? y - 1 : y}`, ['mes', 'passado', 'anterior', 'ultimo']);
  if (/\b(este|neste|esse|nesse) ano\b|\bano atual\b/.test(q)) return { from: `${y}-01-01`, to: today, label: `${y} (até hoje)`, used: ['ano'] };
  if (/\bano passado\b|\bano anterior\b/.test(q)) return mk(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31), String(y - 1), ['ano', 'passado', 'anterior']);
  const ult = q.match(/\bultim[oa]s (\d+|[a-z]+) (dias|semanas|meses)\b/);
  if (ult) {
    const n = /^\d+$/.test(ult[1]) ? +ult[1] : NUM_WORDS[ult[1]];
    if (n) { const d = ult[2] === 'dias' ? new Date(y, m, now.getDate() - n + 1) : ult[2] === 'semanas' ? new Date(y, m, now.getDate() - 7 * n + 1) : new Date(y, m - n + 1, 1);
      return { from: iso(d), to: today, label: `últimos ${n} ${ult[2]}`, used: [ult[1], ult[2]] }; }
  }
  const mm = q.match(new RegExp(`\\b(${MONTHS.join('|')})\\b(?: (?:de )?(20\\d{2}))?`));
  if (mm) {
    const mi = MONTHS.indexOf(mm[1]); const yy = mm[2] ? +mm[2] : (mi > m ? y - 1 : y);
    return mk(new Date(yy, mi, 1), new Date(yy, mi + 1, 0), `${MONTH_PT[mi]} de ${yy}`, [mm[1]]);
  }
  const yr = q.match(/\b(20\d{2})\b/);
  if (yr) return mk(new Date(+yr[1], 0, 1), new Date(+yr[1], 11, 31), yr[1], [yr[1]]);
  return null;
}

export function parseQuestion(question: string, columns: Col[], rows: Row[], now = new Date()): ParseResult {
  const q = fold(question);
  const cols = columns.map((c, j) => ({ ...c, j }));
  const nums = cols.filter(c => c.type === 'number');
  const dateCol = cols.find(c => c.type === 'date') || null;
  const texts = cols.filter(c => c.type === 'text');
  const examples = suggestions(columns, rows);
  if (!q) return { ok: false, hint: 'Escreva uma pergunta sobre esta planilha.', examples };

  // 1) valores da planilha citados na pergunta viram filtros ("a Ana", "mercado", "SP")
  const filters: { col: string; val: string }[] = []; let qRest = ` ${q} `;
  const colNames = new Set(cols.map(c => fold(c.name)));
  const cands: { col: string; val: string; f: string }[] = [];
  for (const c of texts) {
    const seen = new Map<string, string>();
    for (const r of rows) { const v = r[c.j]; if (v == null || v === '') continue; const f = fold(v); if (!seen.has(f)) seen.set(f, String(v)); if (seen.size > 3000) break; }
    if (seen.size > 3000) continue;
    const uf = /^(uf|estado|uf .*|.* uf)$/.test(fold(c.name));
    for (const [f, v] of seen) {
      if (!f || STOP.has(f) || colNames.has(f) || /^\d+$/.test(f)) continue;
      if (f.length < 3 && !(uf && f.length === 2)) continue;
      if (` ${q} `.includes(` ${f} `)) cands.push({ col: c.name, val: v, f });
    }
  }
  cands.sort((a, b) => b.f.length - a.f.length);
  for (const cd of cands) {
    if (filters.some(x => x.col === cd.col) || !qRest.includes(` ${cd.f} `)) continue;
    filters.push({ col: cd.col, val: cd.val }); qRest = qRest.replace(` ${cd.f} `, ' ');
  }
  const qr = qRest.trim();

  // 2) entradas e saídas (extratos)
  let sign: Parsed['sign'] = null;
  const out = has(qr, /\b(gastei|gasto|gastos|gastamos|gastou|paguei|pagamos|saiu|saidas?|despesas?|debitos?)\b/), inn = has(qr, /\b(recebi|recebemos|entrou|entradas?|ganhei|creditos?|receitas?)\b/);
  const mov = texts.find(c => /^(movimento|tipo|natureza|operacao)$/.test(fold(c.name)) && rows.some(r => /^(saida|entrada)s?$/.test(fold(r[c.j]))));
  if ((out || inn) && !(out && inn)) {
    if (mov && !filters.some(f => f.col === mov.name)) filters.push({ col: mov.name, val: out ? 'Saída' : 'Entrada' });
    else if (!mov) sign = out ? 'neg' : 'pos';
  }

  // 3) período
  const rg = dateCol ? dateRange(qr, now) : null;
  const range = rg ? { from: rg.from, to: rg.to, label: rg.label } : null;

  // 4) o que medir
  let measure: string | null = null;
  const named = nums.map(c => ({ c, s: mentions(qr, c.name) })).filter(o => o.s).sort((a, b) => b.s - a.s)[0];
  const countish = has(qr, /\bquant[oa]s\b/, /\bnumero de\b/, /\bquantidade de (registros|vendas|pedidos|lancamentos|notas|linhas|itens)\b/, /\bcontar\b/);
  const moneyish = has(qr, /\bquanto\b/, /\b(vend|fatur|gast|receb|pag|lucr|ganh|cust)[a-z]*\b/, /\b(soma|total|valor|media|medio|ticket)\b/);
  const mainNum = () => (nums.find(c => MONEY.test(fold(c.name))) || nums[0])?.name ?? null;
  if (named) measure = named.c.name;
  else if (countish) measure = null;
  else if (moneyish || out || inn) measure = mainNum();

  // 5) agrupamento
  let groupBy: string | null = null, time = false;
  const por = qr.match(/\bpor ([a-z0-9 ]+)/);
  const groupTarget = (s: string) => cols.filter(c => c.type !== 'number' && !filters.some(f => f.col === c.name)).map(c => ({ c, s: mentions(s, c.name) })).filter(o => o.s).sort((a, b) => b.s - a.s)[0]?.c;
  if (por) { if (dateCol && /^(mes|meses|dia|dias|ano|anos|semana|data|periodo)\b/.test(por[1])) { groupBy = dateCol.name; time = true; } else { const g = groupTarget(por[1]); if (g) { groupBy = g.name; time = g.type === 'date'; } } }
  if (!groupBy && dateCol && has(qr, /\bevolu/, /\bao longo\b/, /\btendencia\b/, /\bhistorico\b/, /\bmensal\b/, /\bcada (mes|dia|ano)\b/, /\b(qual|que|em que) (mes|dia|ano)\b/, /\bquando\b/)) { groupBy = dateCol.name; time = true; }
  if (!groupBy && has(qr, /\b(qual|quais|que|quem|ranking|top)\b/)) {
    const g = groupTarget(qr);
    if (g) { groupBy = g.name; time = g.type === 'date'; }
    else if (/\bquem\b/.test(qr)) {
      const buy = /\b(compr|gast|pag)/.test(qr) && !/\bvend/.test(qr);
      const p = texts.find(c => !filters.some(f => f.col === c.name) && (buy ? BUYER : PERSON).test(fold(c.name))) || texts.find(c => !filters.some(f => f.col === c.name) && (PERSON.test(fold(c.name)) || BUYER.test(fold(c.name)) || /^nome/.test(fold(c.name))));
      if (p) groupBy = p.name;
    }
  }
  if (groupBy && filters.some(f => f.col === groupBy)) groupBy = null;

  // 6) cálculo, ordem e limite
  let agg: Agg = measure ? 'sum' : 'count';
  if (measure && has(qr, /\bmedi[ao]s?\b/, /\bticket\b/)) agg = 'avg';
  else if (measure && !groupBy && has(qr, /\b(maior|maximo|mais caro|mais alta|mais alto)\b/)) agg = 'max';
  else if (measure && !groupBy && has(qr, /\b(menor|minimo|mais barato|mais baixa|mais baixo)\b/)) agg = 'min';
  const order: 'desc' | 'asc' = has(qr, /\bmenos\b/, /\bmenor(es)?\b/, /\bpior(es)?\b/) && !has(qr, /\bmais\b/) ? 'asc' : 'desc';
  const NW = `\\d+|${Object.keys(NUM_WORDS).filter(w => w !== 'um' && w !== 'uma').join('|')}`;
  const lm = qr.match(/\btop (\d+)\b/) || qr.match(new RegExp(`\\b(${NW}) (?:[a-z]+ )?(?:que|com|maiores|menores|melhores|piores|primeiros)\\b`));
  const limit = lm ? (/^\d+$/.test(lm[1]) ? +lm[1] : NUM_WORDS[lm[1]] || null) : null;

  if (!groupBy && !filters.length && !range && !sign && !moneyish && !countish && !named)
    return { ok: false, hint: 'Não consegui entender esta pergunta com os nomes das colunas desta planilha.', examples };

  const AGG_PT: Record<Agg, string> = { sum: 'Soma de', avg: 'Média de', max: 'Maior', min: 'Menor', count: 'Quantidade de registros' };
  const understood = [measure ? `${AGG_PT[agg]} ${measure}` : 'Quantidade de registros'];
  if (sign) understood.push(sign === 'neg' ? 'só saídas (valores negativos)' : 'só entradas (valores positivos)');
  if (groupBy) understood.push(time ? `ao longo do tempo (${groupBy})` : `por ${groupBy}, ${order === 'desc' ? 'do maior para o menor' : 'do menor para o maior'}`);
  for (const f of filters) understood.push(`${f.col}: ${f.val}`);
  if (range) understood.push(range.label);
  if (limit && groupBy && !time) understood.push(`${limit} primeiros`);
  return { ok: true, measure, agg, groupBy, time, order, limit, filters, range, sign, understood };
}

/** Linhas que entram na resposta: filtros, período e sinal. */
export function filterRows(p: Parsed, columns: Col[], rows: Row[]): Row[] {
  const idx = (n: string) => columns.findIndex(c => c.name === n);
  const fs = p.filters.map(f => ({ j: idx(f.col), v: fold(f.val) })).filter(f => f.j >= 0);
  const dj = columns.findIndex(c => c.type === 'date'), mj = p.measure ? idx(p.measure) : -1;
  return rows.filter(r => {
    for (const f of fs) if (fold(r[f.j]) !== f.v && fold(r[f.j]).replace(/s$/, '') !== f.v.replace(/s$/, '')) return false;
    if (p.range && dj >= 0) { const d = r[dj]; if (typeof d !== 'string' || d < p.range.from || d > p.range.to) return false; }
    if (p.sign && mj >= 0) { const v = r[mj]; if (typeof v !== 'number' || (p.sign === 'neg' ? v >= 0 : v <= 0)) return false; }
    return true;
  });
}

const absIfOut = (p: Parsed, v: number) => (p.sign === 'neg' || p.filters.some(f => /^sa[ií]da/i.test(f.val)) ? Math.abs(v) : v);

export function answer(p: Parsed, columns: Col[], rows: Row[]): Answer {
  const fr = filterRows(p, columns, rows);
  const mj = p.measure ? columns.findIndex(c => c.name === p.measure) : -1;
  const val = (rs: Row[]) => {
    if (mj < 0 || p.agg === 'count') return rs.length;
    const vs = rs.map(r => r[mj]).filter((v): v is number => typeof v === 'number').map(v => absIfOut(p, v));
    if (!vs.length) return 0;
    if (p.agg === 'avg') return vs.reduce((a, b) => a + b, 0) / vs.length;
    if (p.agg === 'max') return Math.max(...vs);
    if (p.agg === 'min') return Math.min(...vs);
    return vs.reduce((a, b) => a + b, 0);
  };
  if (!p.groupBy) return { kind: 'value', value: val(fr), n: fr.length };
  const gj = columns.findIndex(c => c.name === p.groupBy);
  const key = (v: unknown) => { if (v == null || v === '') return '(vazio)'; if (p.time && typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 7); return String(v); };
  const g = new Map<string, Row[]>();
  for (const r of fr) { const k = key(r[gj]); const a = g.get(k); if (a) a.push(r); else g.set(k, [r]); }
  let groups = [...g.entries()].map(([k, rs]) => ({ k, label: p.time && /^\d{4}-\d{2}$/.test(k) ? `${MESES[+k.slice(5) - 1]}/${k.slice(2, 4)}` : k, value: val(rs) }));
  if (p.time) groups.sort((a, b) => a.k.localeCompare(b.k));
  else groups.sort((a, b) => (p.order === 'desc' ? b.value - a.value : a.value - b.value));
  if (p.limit && !p.time) groups = groups.slice(0, p.limit);
  return { kind: 'groups', groups: groups.map(({ label, value }) => ({ label, value })), total: groups.reduce((s, x) => s + x.value, 0), n: fr.length };
}

/** A resposta em uma frase. */
export function answerText(p: Parsed, a: Answer): string {
  const per = p.range ? ` em ${p.range.label}` : '';
  if (a.kind === 'value') {
    if (!a.n) return `Não há registros${per} com esses critérios.`;
    const what = p.measure ? (p.agg === 'avg' ? `A média de ${p.measure}` : p.agg === 'max' ? `O maior ${p.measure}` : p.agg === 'min' ? `O menor ${p.measure}` : `O total de ${p.measure}`) : 'O número de registros';
    return `${what}${per} foi ${fmtNum(a.value)}${p.measure ? ` (${fmtNum(a.n)} ${a.n === 1 ? 'registro' : 'registros'})` : ''}.`;
  }
  if (!a.groups.length) return `Não há registros${per} com esses critérios.`;
  if (p.time) {
    const s = [...a.groups].sort((x, y) => y.value - x.value), hi = s[0], lo = s[s.length - 1];
    return a.groups.length === 1 ? `Só há dados em ${hi.label}: ${fmtNum(hi.value)}.` : `O maior período foi ${hi.label}, com ${fmtNum(hi.value)}; o menor foi ${lo.label}, com ${fmtNum(lo.value)}.`;
  }
  const top = a.groups[0], pct = a.total && p.agg !== 'avg' && p.agg !== 'max' && p.agg !== 'min' ? ` (${fmtNum(Math.round(top.value / a.total * 1000) / 10)}% do total)` : '';
  const rest = a.groups.slice(1, 3).map(g => `“${g.label}”`);
  return `${p.order === 'desc' ? 'Em primeiro' : 'Com o menor valor'}${per}: “${top.label}”, com ${fmtNum(top.value)}${pct}.${rest.length ? ` Depois vêm ${rest.join(' e ')}.` : ''}`;
}

/** Perguntas de exemplo feitas com as colunas desta planilha. */
export function suggestions(columns: Col[], rows: Row[]): string[] {
  const nums = columns.filter(c => c.type === 'number'), texts = columns.filter(c => c.type === 'text' && !c.virtual), hasDate = columns.some(c => c.type === 'date');
  const m = (nums.find(c => MONEY.test(fold(c.name))) || nums[0])?.name;
  const isStatement = texts.some(c => /^movimento$/.test(fold(c.name)));
  const out: string[] = [];
  if (isStatement) { out.push(hasDate ? 'Quanto gastei este mês?' : 'Quanto gastei?'); const cat = texts.find(c => /categoria/.test(fold(c.name))); if (cat) out.push(`Em que ${cat.name.toLowerCase()} gastei mais?`); }
  const g = texts.find(c => PERSON.test(fold(c.name))) || texts.find(c => BUYER.test(fold(c.name))) || texts.find(c => /produto|categoria|item/.test(fold(c.name))) || texts[0];
  if (g && m && !isStatement) out.push(`Qual ${g.name.toLowerCase()} teve mais ${m.toLowerCase()}?`);
  if (m && hasDate) out.push(`Como ${m.toLowerCase()} evoluiu por mês?`);
  if (m && hasDate && !isStatement) { const now = new Date(); out.push(`Quanto foi ${m.toLowerCase()} em ${MONTH_PT[(now.getMonth() + 11) % 12]}?`); }
  if (g) { const j = columns.indexOf(g); const v = rows.find(r => r[j] != null && r[j] !== '')?.[j]; if (v != null && m) out.push(`Qual a média de ${m.toLowerCase()} de ${String(v)}?`); }
  if (!m) out.push('Quantos registros há por mês?');
  return [...new Set(out)].slice(0, 4);
}
