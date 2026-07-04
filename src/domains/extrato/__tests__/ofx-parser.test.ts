import { describe, expect, it } from 'vitest';
import { parseOfx, parseOfxAmount, parseOfxDate, hashOfx, pareceOfx } from '../domain/ofx-parser';

describe('parseOfxAmount', () => {
  it('converte formato brasileiro 1.234,56', () => {
    expect(parseOfxAmount('-1.234,56')).toBe(-1234.56);
  });
  it('converte formato com ponto decimal', () => {
    expect(parseOfxAmount('1234.56')).toBe(1234.56);
  });
  it('converte formato com vírgula decimal simples', () => {
    expect(parseOfxAmount('-45,90')).toBe(-45.9);
  });
  it('lança AppError para valor inválido', () => {
    expect(() => parseOfxAmount('abc')).toThrow('Valor OFX inválido');
  });
});

describe('parseOfxDate', () => {
  it('interpreta YYYYMMDD como meio-dia de Brasília', () => {
    const d = parseOfxDate('20260115');
    expect(d.toISOString()).toBe('2026-01-15T15:00:00.000Z');
  });
  it('interpreta YYYYMMDDHHMMSS com fuso explícito', () => {
    const d = parseOfxDate('20260115143000[-3:BRT]');
    expect(d.toISOString()).toBe('2026-01-15T17:30:00.000Z');
  });
  it('lança AppError para data malformada', () => {
    expect(() => parseOfxDate('não-é-data')).toThrow('Data OFX inválida');
  });
});

describe('parseOfx', () => {
  it('extrai transações de um bloco SGML simples', () => {
    const conteudo = `
      <OFX>
      <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20260110
      <TRNAMT>-50.00
      <FITID>123
      <MEMO>Compra supermercado
      </STMTTRN>
      </OFX>
    `;
    const transacoes = parseOfx(conteudo);
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0].valor).toBe(-50);
    expect(transacoes[0].descricao).toBe('Compra supermercado');
    expect(transacoes[0].fitid).toBe('123');
  });

  it('lança AppError quando não há tag <OFX>', () => {
    expect(() => parseOfx('conteúdo qualquer')).toThrow('não parece ser um OFX válido');
  });

  it('lança AppError quando não há blocos STMTTRN', () => {
    expect(() => parseOfx('<OFX></OFX>')).toThrow('Nenhuma transação');
  });

  it('ignora blocos truncados sem DTPOSTED/TRNAMT', () => {
    const conteudo = `<OFX><STMTTRN><MEMO>sem data nem valor</STMTTRN></OFX>`;
    expect(() => parseOfx(conteudo)).toThrow('sem transações válidas');
  });
});

describe('hashOfx', () => {
  it('é determinístico para os mesmos dados', () => {
    const t = { data: new Date('2026-01-10T12:00:00Z'), valor: -50, descricao: 'Loja X', fitid: null };
    expect(hashOfx(t, 1)).toBe(hashOfx(t, 1));
  });
  it('muda quando a conta muda (mesmo hash não vaza entre contas)', () => {
    const t = { data: new Date('2026-01-10T12:00:00Z'), valor: -50, descricao: 'Loja X', fitid: null };
    expect(hashOfx(t, 1)).not.toBe(hashOfx(t, 2));
  });
});

describe('pareceOfx', () => {
  it('reconhece pela extensão .ofx', () => {
    expect(pareceOfx('application/octet-stream', 'extrato.ofx', Buffer.from(''))).toBe(true);
  });
  it('reconhece pelo conteúdo <OFX>', () => {
    expect(pareceOfx('text/plain', 'arquivo.txt', Buffer.from('OFXHEADER:100'))).toBe(true);
  });
  it('rejeita PDF', () => {
    expect(pareceOfx('application/pdf', 'extrato.pdf', Buffer.from('%PDF-1.4'))).toBe(false);
  });
});
