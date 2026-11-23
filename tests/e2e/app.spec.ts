import { expect, test, type Page } from '@playwright/test';

// Falha o teste se a página lançar qualquer erro de JavaScript.
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

async function openDemo(page: Page) {
  await page.goto('/');
  // o botão só aparece depois que o login do Firebase responde "ninguém conectado"
  await page.getByRole('button', { name: 'Ver demonstração sem conta' }).click();
  await expect(page.locator('.chart-card').first()).toBeVisible();
  // fecha o tour guiado se ele abrir
  await page.waitForTimeout(1200);
  if (await page.locator('.tour').count()) await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
}

test('página de entrada mostra a chamada e a prévia do painel', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Planilhas viram decisões' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar com Google' }).first()).toBeVisible();
  await expect(page.getByText('dados fictícios').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('demonstração abre com gráficos, resumo e metas', async ({ page }) => {
  const errors = trackErrors(page);
  await openDemo(page);
  await expect(page.getByText('Resumo em poucas palavras')).toBeVisible();
  expect(await page.locator('.chart-card canvas').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.goal').first()).toBeVisible();
  // os gráficos desenharam de verdade (canvas com tamanho)
  const box = await page.locator('.chart-card canvas').first().boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('aba Dados lista as linhas e a busca filtra', async ({ page }) => {
  const errors = trackErrors(page);
  await openDemo(page);
  await page.locator('.tab', { hasText: 'Dados' }).click();
  await page.waitForTimeout(500);
  if (await page.locator('.tour').count()) await page.keyboard.press('Escape');
  const rows = page.locator('table.data tbody tr');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  expect(before).toBeGreaterThan(1);
  // cada pedido tem um código único: a busca deixa só a linha dele
  await page.getByPlaceholder('Buscar').fill('P-10005');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('P-10005');
  expect(errors).toEqual([]);
});

test('abas Relatórios e Apresentação abrem sem erro', async ({ page }) => {
  const errors = trackErrors(page);
  await openDemo(page);
  for (const tab of ['Relatórios', 'Apresentação']) {
    await page.locator('.tab', { hasText: tab }).click();
    await page.waitForTimeout(600);
    if (await page.locator('.tour').count()) await page.keyboard.press('Escape');
    await expect(page.locator('.tab.active')).toContainText(tab);
  }
  expect(errors).toEqual([]);
});

test('baixa o relatório em PDF', async ({ page }) => {
  const errors = trackErrors(page);
  await openDemo(page);
  const download = page.waitForEvent('download');
  await page.locator('[data-tour="pdf"]').click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/i);
  expect(errors).toEqual([]);
});

test('no celular a tela não vaza para os lados', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'só no celular');
  await openDemo(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('.tabs')).toBeVisible();
});
