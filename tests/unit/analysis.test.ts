import { describe, expect, it } from 'vitest';
// módulos ainda em JavaScript: testados como estão
import { compareRange, deltaOf } from '../../src/features/compare.js';
import { forecastOf } from '../../src/features/forecast.js';
import { barColors } from '../../src/charts/draw-and-pdf.js';
import { autoCharts } from '../../src/charts/auto-charts.js';
import { sampleBase } from '../../src/features/sample-and-tour.js';

describe('compareRange: período anterior equivalente', () => {
  const now = new Date(2026, 10, 23); // 23/11/2026
  it('mês fechado → mês anterior inteiro', () => {
    expect(compareRange('2026-10-01', '2026-10-31', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
  it('mês em andamento → mesmo trecho do mês anterior', () => {
    expect(compareRange('2026-11-01', '2026-11-30', now)).toEqual({ from: '2026-10-01', to: '2026-10-23' });
  });
  it('ano em andamento → mesmo trecho do ano anterior', () => {
    expect(compareRange('2026-01-01', '2026-12-31', now)).toEqual({ from: '2025-01-01', to: '2025-11-23' });
  });
  it('intervalo livre → os mesmos dias imediatamente antes', () => {
    expect(compareRange('2026-11-10', '2026-11-16', now)).toEqual({ from: '2026-11-03', to: '2026-11-09' });
  });
  it('intervalo inválido → nada', () => {
    expect(compareRange('2026-11-16', '2026-11-10', now)).toBeNull();
  });
});

describe('deltaOf: variação com sentido de bom ou ruim', () => {
  it('subir é bom para faturamento e ruim para despesa', () => {
    expect(deltaOf(110, 100, 'Faturamento')).toMatchObject({ dir: 1, good: true });
    expect(deltaOf(110, 100, 'Despesas')).toMatchObject({ dir: 1, good: false });
  });
  it('sem base de comparação', () => {
    expect(deltaOf(5, 0, 'x')).toBeNull();
    expect(deltaOf(0, 0, 'x')).toMatchObject({ dir: 0, txt: 'igual' });
  });
});

describe('forecastOf: tendência por linha reta', () => {
  it('continua uma série que cresce 10 por mês', () => {
    const res = { gran: 'm', keys: ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'], values: [10, 20, 30, 40, 50, 60] };
    const fc = forecastOf(res)!;
    expect(fc.slope).toBeCloseTo(10);
    expect(fc.keys).toHaveLength(9);
    expect(fc.trend[8]).toBeCloseTo(90);
    expect(fc.labels[8]).toBe('set/25');
  });
  it('precisa de pelo menos 4 períodos', () => {
    expect(forecastOf({ gran: 'm', keys: ['2025-01', '2025-02', '2025-03'], values: [1, 2, 3] })).toBeNull();
  });
});

describe('barColors: uma cor de destaque por gráfico', () => {
  it('só a maior barra leva o azul', () => {
    const c = barColors({ labels: ['Ana', 'Bruno', 'Carla'], values: [5, 9, 3] }, 'dark');
    expect(c.filter((x: string) => x === '#4a7dff')).toHaveLength(1);
    expect(c[1]).toBe('#4a7dff');
  });
  it('entrada e saída mantêm verde e vermelho', () => {
    const c = barColors({ labels: ['Entrada', 'Saída'], values: [100, 80] }, 'dark');
    expect(new Set(c).size).toBe(2);
    expect(c).not.toContain('#4a7dff');
  });
});

describe('autoCharts: gráficos escolhidos pelos dados', () => {
  const { meta, rows } = sampleBase();
  const specs = autoCharts(meta.columns, rows);
  it('começa pela evolução no tempo', () => {
    expect(specs[0]).toMatchObject({ type: 'line', x: 'Data' });
  });
  it('não agrupa por código de pedido', () => {
    expect(specs.some((s: any) => s.x === 'Pedido')).toBe(false);
  });
  it('usa o mapa quando há coluna de UF', () => {
    expect(specs.some((s: any) => s.type === 'map' && s.x === 'UF')).toBe(true);
  });
  it('fica no limite de gráficos', () => {
    expect(specs.length).toBeGreaterThanOrEqual(4);
    expect(specs.length).toBeLessThanOrEqual(9);
  });
});
