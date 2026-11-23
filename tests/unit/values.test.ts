import { describe, expect, it } from 'vitest';
import { convert, detectType, display, findDate, parseDate, parseNum } from '../../src/core/values.ts';
import { fmtDate, fmtNum } from '../../src/core/utils.ts';

describe('parseNum: números como aparecem em planilhas e extratos', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234,5', 1234.5],
    ['1,234.56', 1234.56],
    ['R$ 22,00', 22],
    ['+R$ 22,00', 22],
    ['−R$ 260,00', -260],
    ['R$ -5,00', -5],
    ['260,00-', -260],
    ['1.234,56 D', -1234.56],
    ['1.234,56 C', 1234.56],
    ['(10)', -10],
    ['15%', 15],
    [42, 42],
  ])('%s → %s', (raw, n) => expect(parseNum(raw)).toBeCloseTo(n as number, 6));

  it.each(['', null, undefined, 'abc', '12abc', true])('%s não é número', raw => expect(parseNum(raw as any)).toBeNaN());
});

describe('parseDate e findDate', () => {
  it('lê os formatos brasileiros', () => {
    expect(parseDate('05/11/2026')).toBe('2026-11-05');
    expect(parseDate('5-1-26')).toBe('2026-01-05');
    expect(parseDate('2026-11-05T10:00')).toBe('2026-11-05');
    expect(parseDate('4 de novembro de 2026')).toBe('2026-11-04');
    expect(parseDate(new Date(2026, 0, 31))).toBe('2026-01-31');
  });
  it('recusa datas impossíveis e textos', () => {
    expect(parseDate('31/13/2026')).toBeNull();
    expect(parseDate('texto')).toBeNull();
    expect(parseDate(12345 as any)).toBeNull();
  });
  it('acha a data dentro de um texto livre', () => {
    expect(findDate('Extrato emitido em 04 de novembro 2026 às 10h')).toBe('2026-11-04');
    expect(findDate('Vencimento: 05/12/2026')).toBe('2026-12-05');
    expect(findDate('sem data')).toBeNull();
  });
});

describe('detectType', () => {
  it('reconhece número, data e texto pela maioria', () => {
    expect(detectType('Valor', ['1.234,56', '10', '22,5', 'R$ 3,00'])).toBe('number');
    expect(detectType('Data', ['05/11/2026', '06/11/2026', '2026-11-07'])).toBe('date');
    expect(detectType('Cliente', ['Ana', 'Bruno', '3'])).toBe('text');
  });
  it('mantém códigos como texto, mesmo sendo números', () => {
    expect(detectType('CPF', ['12345678901', '98765432100'])).toBe('text');
    expect(detectType('CEP', ['70000000', '01310100'])).toBe('text');
  });
});

describe('convert e display', () => {
  it('converte para o tipo da coluna', () => {
    expect(convert('1.234,56', 'number')).toBe(1234.56);
    expect(convert('05/11/2026', 'date')).toBe('2026-11-05');
    expect(convert(  '  Ana ', 'text')).toBe('Ana');
    expect(convert(7, 'text')).toBe('7');
    expect(convert('', 'number')).toBeNull();
  });
  it('mostra no formato brasileiro', () => {
    expect(display(1234.5, 'number')).toBe('1.234,5');
    expect(display('2026-11-05', 'date')).toBe('05/11/2026');
    expect(display(null, 'text')).toBe('');
  });
  it('formata números e datas', () => {
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(1234.567)).toBe('1.234,57');
    expect(fmtDate('2026-11')).toBe('11/2026');
  });
});
