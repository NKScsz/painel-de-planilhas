import { describe, expect, it } from 'vitest';
import { answer, answerText, parseQuestion, suggestions, type Col, type Parsed } from '../../src/easy/free-ask.ts';

const now = new Date(2026, 10, 23); // 23/11/2026
const vendas: Col[] = [
  { name: 'Data', type: 'date' }, { name: 'Vendedor', type: 'text' }, { name: 'Produto', type: 'text' },
  { name: 'UF', type: 'text' }, { name: 'Quantidade', type: 'number' }, { name: 'Valor total', type: 'number' },
];
const vRows = [
  ['2026-03-02', 'Ana', 'Caneta', 'SP', 2, 100],
  ['2026-03-15', 'Bruno', 'Caderno', 'MG', 1, 300],
  ['2026-03-20', 'Ana', 'Caderno', 'SP', 3, 50],
  ['2026-10-05', 'Carla', 'Mochila', 'RJ', 1, 400],
  ['2026-11-10', 'Ana', 'Caneta', 'SP', 5, 120],
  ['2026-11-12', 'Bruno', 'Mochila', 'MG', 2, 80],
];
const extrato: Col[] = [{ name: 'Data', type: 'date' }, { name: 'Descrição', type: 'text' }, { name: 'Valor', type: 'number' }, { name: 'Movimento', type: 'text' }, { name: 'Categoria', type: 'text' }];
const eRows = [
  ['2026-11-01', 'Salário', 5000, 'Entrada', 'Renda'],
  ['2026-11-03', 'Supermercado Bom Preço', -300, 'Saída', 'Mercado'],
  ['2026-11-08', 'Uber', -40, 'Saída', 'Transporte'],
  ['2026-11-15', 'Supermercado Bom Preço', -200, 'Saída', 'Mercado'],
  ['2026-10-20', 'Padaria', -60, 'Saída', 'Mercado'],
];
const ask = (q: string, cols = vendas, rows: unknown[][] = vRows) => parseQuestion(q, cols, rows, now);
const ok = (q: string, cols = vendas, rows: unknown[][] = vRows) => { const p = ask(q, cols, rows); if (!p.ok) throw new Error(`não entendeu: ${q}`); return p as Parsed; };

describe('perguntas livres: interpretação', () => {
  it('quanto a Ana vendeu em março', () => {
    const p = ok('Quanto a Ana vendeu em março?');
    expect(p).toMatchObject({ measure: 'Valor total', agg: 'sum', groupBy: null, filters: [{ col: 'Vendedor', val: 'Ana' }] });
    expect(p.range).toMatchObject({ from: '2026-03-01', to: '2026-03-31', label: 'março de 2026' });
    const a = answer(p, vendas, vRows);
    expect(a).toMatchObject({ kind: 'value', value: 150, n: 2 });
    expect(answerText(p, a)).toBe('O total de Valor total em março de 2026 foi 150 (2 registros).');
  });
  it('qual vendedor vendeu mais (ranking)', () => {
    const p = ok('qual vendedor vendeu mais?');
    expect(p).toMatchObject({ groupBy: 'Vendedor', measure: 'Valor total', order: 'desc', time: false });
    const a = answer(p, vendas, vRows);
    expect(a.kind === 'groups' && a.groups.map(g => g.label)).toEqual(['Carla', 'Bruno', 'Ana']); // 400, 380, 270
  });
  it('quem vendeu menos usa a coluna de pessoas e ordem crescente', () => {
    const p = ok('quem vendeu menos?');
    expect(p).toMatchObject({ groupBy: 'Vendedor', order: 'asc' });
  });
  it('quantas vendas por mês: contagem ao longo do tempo', () => {
    const p = ok('quantas vendas por mês?');
    expect(p).toMatchObject({ measure: null, agg: 'count', groupBy: 'Data', time: true });
    const a = answer(p, vendas, vRows);
    expect(a.kind === 'groups' && a.groups).toEqual([{ label: 'mar/26', value: 3 }, { label: 'out/26', value: 1 }, { label: 'nov/26', value: 2 }]);
  });
  it('média, maior e filtro por estado (UF de 2 letras)', () => {
    expect(answer(ok('qual o valor médio em SP?'), vendas, vRows)).toMatchObject({ value: 90, n: 3 });
    expect(answer(ok('qual a maior venda?'), vendas, vRows)).toMatchObject({ value: 400 });
  });
  it('quantidade citada pelo nome da coluna e período relativo', () => {
    const p = ok('quantidade de produtos vendidos este mês');
    expect(p.measure).toBe('Quantidade');
    expect(p.range?.label).toBe('este mês');
    expect(answer(p, vendas, vRows)).toMatchObject({ value: 7 });
  });
  it('top 2 produtos', () => {
    const p = ok('top 2 produtos com mais valor total');
    expect(p).toMatchObject({ groupBy: 'Produto', limit: 2 });
    const a = answer(p, vendas, vRows);
    expect(a.kind === 'groups' && a.groups.map(g => g.label)).toEqual(['Mochila', 'Caderno']);
  });
  it('não chuta quando não entende', () => {
    const p = ask('qual a cor do céu?');
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.examples.length).toBeGreaterThan(0);
  });
});

describe('perguntas livres: extratos', () => {
  it('quanto gastei este mês: só saídas, em valor positivo', () => {
    const p = ok('Quanto gastei este mês?', extrato, eRows);
    expect(p.filters).toEqual([{ col: 'Movimento', val: 'Saída' }]);
    expect(answer(p, extrato, eRows)).toMatchObject({ value: 540, n: 3 });
  });
  it('em que categoria gastei mais', () => {
    const p = ok('Em que categoria gastei mais?', extrato, eRows);
    expect(p.groupBy).toBe('Categoria');
    const a = answer(p, extrato, eRows);
    expect(a.kind === 'groups' && a.groups[0]).toEqual({ label: 'Mercado', value: 560 });
  });
  it('quanto gastei no supermercado (valor citado da descrição)', () => {
    const p = ok('quanto gastei no Supermercado Bom Preço?', extrato, eRows);
    expect(p.filters).toContainEqual({ col: 'Descrição', val: 'Supermercado Bom Preço' });
    expect(answer(p, extrato, eRows)).toMatchObject({ value: 500 });
  });
  it('sem coluna Movimento, "gastei" usa os valores negativos', () => {
    const cols = extrato.slice(0, 3), rows = eRows.map(r => r.slice(0, 3));
    const p = ok('quanto gastei em novembro?', cols, rows);
    expect(p.sign).toBe('neg');
    expect(answer(p, cols, rows)).toMatchObject({ value: 540 });
  });
});

describe('exemplos sugeridos', () => {
  it('usa os nomes das colunas da planilha', () => {
    expect(suggestions(vendas, vRows)).toContain('Qual vendedor teve mais valor total?');
    expect(suggestions(extrato, eRows)[0]).toBe('Quanto gastei este mês?');
  });
  it('todo exemplo sugerido é entendido', () => {
    for (const [c, r] of [[vendas, vRows], [extrato, eRows]] as const)
      for (const q of suggestions(c as Col[], r as unknown[][])) expect(ask(q, c as Col[], r as unknown[][]).ok, q).toBe(true);
  });
});
