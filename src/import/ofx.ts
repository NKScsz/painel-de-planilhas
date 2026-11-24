/* ----- Extrato bancário em OFX -----
   O OFX é o arquivo de extrato que os bancos exportam ("Exportar extrato > OFX/Money").
   Funciona com a versão 1 (SGML, tags sem fechamento) e a 2 (XML), extrato de conta e de cartão. */

export interface OfxResult { aoa: (string | number)[][]; banco: string; conta: string; saldo: number | null; repetidos: number }

/** Os bancos brasileiros costumam gravar o OFX em Windows-1252; o cabeçalho diz qual é. */
export function decodeOfx(buf: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 600));
  const cp = /CHARSET:\s*(1252|ISO-?8859-?1|LATIN1)/i.test(head) || /encoding="(windows-1252|iso-8859-1)"/i.test(head);
  const utf = /CHARSET:\s*UTF-?8|encoding="utf-8"/i.test(head) || /ENCODING:\s*UTF-?8/i.test(head);
  if (cp && !utf) return new TextDecoder('windows-1252').decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unescape = (s: string) => s.replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : ENT[e.toLowerCase()] ?? m));
// valor de um campo dentro de um bloco: <TAG>valor (até a próxima tag ou fim de linha)
const field = (block: string, tag: string): string => { const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')); return m ? unescape(m[1].trim()) : ''; };

/** "20261105120000[-3:BRT]" → "2026-11-05" */
export function ofxDate(s: string): string | null {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
/** "-12.50", "-12,50", "1.234,56" → número */
export function ofxAmount(s: string): number {
  let t = s.replace(/\s/g, '');
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  return parseFloat(t);
}

export function parseOfx(text: string): OfxResult | null {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi);
  if (!blocks) return null;
  const seen = new Set<string>(); let repetidos = 0;
  const aoa: (string | number)[][] = [['Data', 'Descrição', 'Valor', 'Tipo', 'Documento']];
  for (const b of blocks) {
    const data = ofxDate(field(b, 'DTPOSTED')), valor = ofxAmount(field(b, 'TRNAMT'));
    if (!data || isNaN(valor)) continue;
    const id = field(b, 'FITID');
    if (id) { if (seen.has(id)) { repetidos++; continue; } seen.add(id); }
    const name = field(b, 'NAME'), memo = field(b, 'MEMO');
    const desc = name && memo && !memo.toLowerCase().includes(name.toLowerCase()) ? `${name} - ${memo}` : memo || name || field(b, 'PAYEE') || 'Sem descrição';
    aoa.push([data, desc.replace(/\s{2,}/g, ' '), valor, TIPOS[field(b, 'TRNTYPE').toUpperCase()] || field(b, 'TRNTYPE') || '', field(b, 'CHECKNUM') || field(b, 'REFNUM') || '']);
  }
  if (aoa.length < 2) return null;
  // ordem cronológica e sem colunas vazias (Tipo/Documento só aparecem se o banco preencher)
  const body = aoa.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const keep = aoa[0].map((_, j) => j < 3 || body.some(r => r[j] !== ''));
  const pick = (r: (string | number)[]) => r.filter((_, j) => keep[j]);
  const banco = field(text, 'ORG') || BANCOS[field(text, 'BANKID').replace(/^0+/, '')] || (field(text, 'BANKID') ? `Banco ${field(text, 'BANKID')}` : '');
  const saldoTxt = field(text.slice(text.search(/<LEDGERBAL>/i) >= 0 ? text.search(/<LEDGERBAL>/i) : text.length), 'BALAMT');
  return { aoa: [pick(aoa[0]), ...body.map(pick)], banco, conta: field(text, 'ACCTID'), saldo: saldoTxt ? ofxAmount(saldoTxt) : null, repetidos };
}

const TIPOS: Record<string, string> = {
  CREDIT: 'Crédito', DEBIT: 'Débito', INT: 'Juros', DIV: 'Dividendos', FEE: 'Tarifa', SRVCHG: 'Tarifa', DEP: 'Depósito', ATM: 'Saque',
  POS: 'Compra', XFER: 'Transferência', CHECK: 'Cheque', PAYMENT: 'Pagamento', CASH: 'Saque', DIRECTDEP: 'Depósito', DIRECTDEBIT: 'Débito automático', REPEATPMT: 'Pagamento recorrente', OTHER: 'Outros',
};
// códigos de compensação mais comuns (quando o arquivo não traz o nome do banco)
const BANCOS: Record<string, string> = {
  '1': 'Banco do Brasil', '33': 'Santander', '77': 'Inter', '104': 'Caixa', '237': 'Bradesco', '260': 'Nubank', '290': 'PagBank',
  '323': 'Mercado Pago', '336': 'C6 Bank', '341': 'Itaú', '380': 'PicPay', '748': 'Sicredi', '756': 'Sicoob', '208': 'BTG Pactual', '212': 'Banco Original',
};
