import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}
async function openDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver demonstração sem conta' }).click();
  await expect(page.locator('.chart-card').first()).toBeVisible();
  await page.waitForTimeout(1200);
  if (await page.locator('.tour').count()) await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
}
async function closeTour(page: Page) {
  await page.waitForTimeout(600);
  if (await page.locator('.tour').count()) await page.keyboard.press('Escape');
}

const OFX = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Banco Exemplo</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341<ACCTID>12345-6</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261101<TRNAMT>3500.00<FITID>1<MEMO>Salário Empresa X</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-45,90<FITID>2<MEMO>Padaria São João</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105<TRNAMT>-230,00<FITID>3<MEMO>Supermercado Bom Preço</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('importa um extrato OFX (Windows-1252) como planilha de extrato', async ({ page }) => {
  const errors = trackErrors(page);
  await openDemo(page);
  await page.locator('#fileInput').setInputFiles({ name: 'extrato.ofx', mimeType: 'application/x-ofx', buffer: Buffer.from(OFX, 'latin1') });
  await expect(page.locator('.title-input')).toHaveValue('Extrato Banco Exemplo · conta 45-6');
  await page.locator('.tab', { hasText: 'Dados' }).click(); await closeTour(page);
  await expect(page.locator('table.data tbody tr')).toHaveCount(3);
  await expect(page.locator('table.data')).toContainText('Padaria São João');
  await expect(page.locator('table.data thead')).toContainText('Movimento');
  expect(errors).toEqual([]);
});

test('importa o XML de uma NF-e, um item por linha', async ({ page }) => {
  const errors = trackErrors(page);
  await openDemo(page);
  await page.locator('#fileInput').setInputFiles({ name: 'nota.xml', mimeType: 'text/xml', buffer: readFileSync('tests/fixtures/nfe-exemplo.xml') });
  await expect(page.locator('.title-input')).toHaveValue('NF-e 1234 · Loja Exemplo Ltda');
  await page.locator('.tab', { hasText: 'Dados' }).click(); await closeTour(page);
  await expect(page.locator('table.data tbody tr')).toHaveCount(2);
  await expect(page.locator('table.data')).toContainText('Caneta azul');
  expect(errors).toEqual([]);
});

test('pergunta livre: entende, responde e mostra o gráfico', async ({ page }) => {
  const errors = trackErrors(page);
  await openDemo(page);
  await page.locator('.ask-input').fill('qual vendedor teve mais valor total?');
  await page.locator('.ask-form').getByRole('button', { name: 'Perguntar' }).click();
  const modal = page.locator('.modal');
  await expect(modal.locator('.fa-understood')).toContainText('por Vendedor');
  await expect(modal.locator('.fa-answer')).toContainText('Em primeiro');
  await expect(modal.locator('canvas')).toBeVisible();
  await modal.getByRole('button', { name: 'Cancelar' }).click();
  // pergunta sem sentido: não chuta, sugere exemplos que funcionam
  await page.locator('.ask-input').fill('qual a cor do céu?');
  await page.locator('.ask-input').press('Enter');
  await expect(page.locator('.modal .fa-hint')).toBeVisible();
  await page.locator('.modal .ask-chip').first().click();
  await expect(page.locator('.modal .fa-understood')).toBeVisible();
  expect(errors).toEqual([]);
});

test('fixa um gráfico no painel geral', async ({ page }, info) => {
  test.skip(info.project.name !== 'computador', 'menu lateral fixo só no computador');
  const errors = trackErrors(page);
  await openDemo(page);
  const title = (await page.locator('.chart-card .chart-title').first().textContent())!.trim();
  await page.locator('.chart-card').first().locator('.pin-btn').click();
  await expect(page.locator('.chart-card').first().locator('.pin-btn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#boardNav').click();
  await expect(page.getByRole('heading', { name: 'Painel geral' })).toBeVisible();
  await expect(page.locator('.board-card')).toHaveCount(1);
  await expect(page.locator('.board-card .chart-title')).toHaveText(title);
  await expect(page.locator('.board-card canvas')).toBeVisible();
  await expect(page.locator('.board-card .board-src')).toContainText('Exemplo');
  expect(errors).toEqual([]);
});

test('baixa o gráfico como imagem para o WhatsApp', async ({ page }, info) => {
  test.skip(info.project.name !== 'computador', 'no celular abre o compartilhar do sistema');
  const errors = trackErrors(page);
  await openDemo(page);
  await page.locator('.chart-card').first().getByRole('button', { name: 'Imagem do gráfico para WhatsApp' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Baixar imagem/ }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/\.png$/);
  const size = readFileSync((await d.path())!).length;
  expect(size).toBeGreaterThan(20_000);
  expect(errors).toEqual([]);
});

test('troca para o tema claro e mantém depois de recarregar', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.locator('#themeBtn').click();
  await page.getByRole('menuitem', { name: /^Claro/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(250, 250, 250)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#themeBtn').click();
  await page.getByRole('menuitem', { name: /^Escuro/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});
