import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nfeTable, parseNfe } from '../../src/import/nfe.ts';
import { decodeOfx, ofxAmount, ofxDate, parseOfx } from '../../src/import/ofx.ts';

const nfe = readFileSync('tests/fixtures/nfe-exemplo.xml', 'utf8');
// NFC-e (modelo 65) sem destinatário, sem envelope nfeProc
const nfce = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe35261100000000000191650010000000071000000077">
  <ide><natOp>Venda</natOp><mod>65</mod><serie>1</serie><nNF>7</nNF><dhEmi>2026-11-06T08:00:00-03:00</dhEmi><tpNF>1</tpNF></ide>
  <emit><CNPJ>00000000000191</CNPJ><xNome>Loja Exemplo Ltda</xNome><enderEmit><UF>SP</UF></enderEmit></emit>
  <det nItem="1"><prod><cProd>C</cProd><xProd>Café 500g</xProd><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1</qCom><vUnCom>18.9</vUnCom><vProd>18.90</vProd></prod></det>
  <total><ICMSTot><vNF>18.90</vNF></ICMSTot></total></infNFe></NFe>`;
const evento = '<procEventoNFe><evento><infEvento><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>';

describe('NF-e', () => {
  it('cada item da nota vira uma linha com os dados da nota', () => {
    const r = parseNfe(nfe)!;
    expect(r.rows).toHaveLength(2);
    expect(r.numero).toBe('1234');
    expect(r.chave).toBe('35261100000000000191550010000012341000012345');
    const [item1, item2] = r.rows;
    expect(item1.slice(0, 13)).toEqual(['2026-11-05', '1234', '1', 'NF-e', 'Saída', 'Venda de mercadoria', 'Loja Exemplo Ltda', '00000000000191', 'SP', 'Cliente Teste & Cia', '11111111000111', 'MG', 'Belo Horizonte']);
    expect(item1.slice(13, 23)).toEqual(['A-01', 'Caneta azul', '96081000', '6102', 'UN', 10, 2.5, 0, 25, 70]);
    expect(item2[19]).toBeCloseTo(15.9);
    expect(item2[20]).toBeCloseTo(2.7);
  });
  it('NFC-e sem destinatário vira consumidor final', () => {
    const r = parseNfe(nfce)!;
    expect(r.rows[0][3]).toBe('NFC-e');
    expect(r.rows[0][9]).toBe('Consumidor final');
  });
  it('evento (cancelamento, carta de correção) não é nota', () => {
    expect(parseNfe(evento)).toBeNull();
  });
  it('várias notas viram uma tabela; repetidas e eventos ficam de fora', () => {
    const r = nfeTable([{ name: 'a.xml', xml: nfe }, { name: 'b.xml', xml: nfce }, { name: 'a-copia.xml', xml: nfe }, { name: 'cancel.xml', xml: evento }]);
    expect(r.table!.rows).toHaveLength(3);
    expect(r.repeated).toBe(1);
    expect(r.ignored).toEqual(['cancel.xml']);
    expect(r.table!.name).toBe('Notas fiscais (2) · Loja Exemplo Ltda');
    expect(r.table!.columns.find(c => c.name === 'Valor do item')!.type).toBe('number');
    expect(r.table!.columns.find(c => c.name === 'CNPJ/CPF do destinatário')!.type).toBe('text');
  });
});

const ofx1 = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Banco Exemplo</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261101
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103120000[-3:BRT]<TRNAMT>-45,90<FITID>001<MEMO>Padaria São João</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261101<TRNAMT>3500.00<FITID>002<NAME>Salário<MEMO>Salário Empresa X</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-45,90<FITID>001<MEMO>Padaria São João</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>3454,10<DTASOF>20261130</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const ofx2 = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>9876</ACCTID></CCACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261110</DTPOSTED><TRNAMT>-120.00</TRNAMT><FITID>x1</FITID><MEMO>Mercado &amp; Cia</MEMO></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

describe('OFX', () => {
  it('lê datas e valores com ponto ou vírgula', () => {
    expect(ofxDate('20261103120000[-3:BRT]')).toBe('2026-11-03');
    expect(ofxAmount('-45,90')).toBeCloseTo(-45.9);
    expect(ofxAmount('1.234,56')).toBeCloseTo(1234.56);
    expect(ofxAmount('3500.00')).toBe(3500);
  });
  it('versão 1 (SGML) em Windows-1252: acentos, ordem e repetidos', () => {
    const buf = Uint8Array.from(Buffer.from(ofx1, 'latin1')).buffer;
    const r = parseOfx(decodeOfx(buf))!;
    expect(r.banco).toBe('Banco Exemplo');
    expect(r.conta).toBe('12345-6');
    expect(r.repetidos).toBe(1);
    expect(r.saldo).toBeCloseTo(3454.1);
    expect(r.aoa[0]).toEqual(['Data', 'Descrição', 'Valor', 'Tipo']);
    expect(r.aoa.slice(1)).toEqual([
      ['2026-11-01', 'Salário Empresa X', 3500, 'Crédito'],
      ['2026-11-03', 'Padaria São João', -45.9, 'Débito'],
    ]);
  });
  it('versão 2 (XML) de cartão de crédito', () => {
    const r = parseOfx(ofx2)!;
    expect(r.conta).toBe('9876');
    expect(r.aoa[1]).toEqual(['2026-11-10', 'Mercado & Cia', -120, 'Débito']);
  });
  it('arquivo sem lançamentos', () => {
    expect(parseOfx('<OFX></OFX>')).toBeNull();
  });
});
