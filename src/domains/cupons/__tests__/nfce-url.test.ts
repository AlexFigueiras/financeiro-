import { describe, expect, it } from 'vitest';
import { interpretarUrlNfce } from '../domain/nfce-url';

const CHAVE = '35260112345678000190650010000012345123456789';

describe('interpretarUrlNfce', () => {
  it('extrai a chave de acesso do QR Code 2.0 (?p=chave|versao|...)', () => {
    const resultado = interpretarUrlNfce(
      `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE}|2|1|abcd1234`
    );
    expect(resultado.chaveAcesso).toBe(CHAVE);
    expect(resultado.url).toContain('nfce.fazenda.sp.gov.br');
  });

  it('extrai a chave de acesso do QR Code 1.0 (?chNFe=)', () => {
    const resultado = interpretarUrlNfce(
      `https://nfce.sefaz.ba.gov.br/consulta?chNFe=${CHAVE}&nVersao=100`
    );
    expect(resultado.chaveAcesso).toBe(CHAVE);
  });

  it('cai no fallback do primeiro bloco de 44 dígitos quando não há ?p= nem ?chNFe=', () => {
    const resultado = interpretarUrlNfce(`https://nfce.fazenda.mg.gov.br/portal/${CHAVE}`);
    expect(resultado.chaveAcesso).toBe(CHAVE);
  });

  it('rejeita URL sem chave de 44 dígitos', () => {
    expect(() => interpretarUrlNfce('https://nfce.fazenda.sp.gov.br/qrcode?p=123')).toThrow(
      'chave de acesso'
    );
  });

  it('rejeita protocolo http (exige https)', () => {
    expect(() => interpretarUrlNfce(`http://nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE}|2|1|x`)).toThrow(
      'https'
    );
  });

  it('rejeita host fora da allowlist da SEFAZ', () => {
    expect(() => interpretarUrlNfce(`https://evil.com/qrcode?p=${CHAVE}|2|1|x`)).toThrow(
      'não é um domínio conhecido'
    );
  });

  it('rejeita IP de metadado cloud (guard de SSRF)', () => {
    expect(() =>
      interpretarUrlNfce(`https://169.254.169.254/qrcode?p=${CHAVE}|2|1|x`)
    ).toThrow('não é um domínio conhecido');
  });

  it('rejeita URL vazia ou malformada', () => {
    expect(() => interpretarUrlNfce('')).toThrow('obrigatória');
    expect(() => interpretarUrlNfce('não é uma url')).toThrow('inválida');
  });
});
