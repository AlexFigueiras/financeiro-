import { describe, expect, it } from 'vitest';
import { criarExtratoService } from '../services/extrato-service';
import { ExtratoRepository } from '../ports/extrato-repository';
import { ExtratoOcrPort } from '../ports/extrato-ocr-port';
import { ResultadoImportExtrato, TransacaoOfx } from '../types';

const OFX_MINIMO = `
  <OFX>
  <STMTTRN>
  <DTPOSTED>20260110
  <TRNAMT>-50.00
  <MEMO>Loja X
  </STMTTRN>
  </OFX>
`;

function fakeRepo(
  resultado: ResultadoImportExtrato,
  overrides: Partial<ExtratoRepository> = {}
): ExtratoRepository {
  return {
    async inserirTransacoes() { return resultado; },
    async buscarArquivoImportado() { return null; },
    async registrarArquivoImportado() {},
    ...overrides,
  };
}

function fakeOcr(transacoes: TransacaoOfx[] = []): ExtratoOcrPort {
  return { async extrairTransacoes() { return transacoes; } };
}

describe('extratoService.importarArquivo', () => {
  it('detecta e processa um arquivo OFX pelo parser local', async () => {
    const resultado = { totalNoArquivo: 1, importadas: 1, ignoradasDuplicadas: 0 };
    const service = criarExtratoService(fakeRepo(resultado), fakeOcr());
    const saida = await service.importarArquivo('11111111-1111-4111-8111-111111111111', 1, Buffer.from(OFX_MINIMO), 'text/plain', 'extrato.ofx');
    expect(saida.via).toBe('ofx');
    expect(saida.resultado).toEqual(resultado);
  });

  it('usa OCR para PDF e retorna via=pdf', async () => {
    const resultado = { totalNoArquivo: 2, importadas: 2, ignoradasDuplicadas: 0 };
    const transacao: TransacaoOfx = { data: new Date(), valor: -10, descricao: 'X', fitid: null };
    const service = criarExtratoService(fakeRepo(resultado), fakeOcr([transacao]));
    const saida = await service.importarArquivo('11111111-1111-4111-8111-111111111111', 1, Buffer.from('%PDF'), 'application/pdf', 'extrato.pdf');
    expect(saida.via).toBe('pdf');
  });

  it('rejeita formato não suportado (415)', async () => {
    const service = criarExtratoService(fakeRepo({ totalNoArquivo: 0, importadas: 0, ignoradasDuplicadas: 0 }), fakeOcr());
    await expect(
      service.importarArquivo('11111111-1111-4111-8111-111111111111', 1, Buffer.from('lixo'), 'application/zip', 'arquivo.zip')
    ).rejects.toMatchObject({ status: 415 });
  });

  it('rejeita reenvio do mesmo arquivo com 409 e detalhes do envio anterior (409)', async () => {
    const anterior = { nomeArquivo: 'extrato.ofx', enviadoEm: new Date('2026-01-01T12:00:00Z') };
    const repo = fakeRepo(
      { totalNoArquivo: 1, importadas: 1, ignoradasDuplicadas: 0 },
      { async buscarArquivoImportado() { return anterior; } }
    );
    const service = criarExtratoService(repo, fakeOcr());
    await expect(
      service.importarArquivo('11111111-1111-4111-8111-111111111111', 1, Buffer.from(OFX_MINIMO), 'text/plain', 'extrato.ofx')
    ).rejects.toMatchObject({ status: 409, details: { duplicado: true } });
  });

  it('processa normalmente reenvio do mesmo arquivo quando forcar=true', async () => {
    const resultado = { totalNoArquivo: 1, importadas: 1, ignoradasDuplicadas: 0 };
    let registrou = false;
    const repo = fakeRepo(resultado, {
      async buscarArquivoImportado() { return { nomeArquivo: 'extrato.ofx', enviadoEm: new Date() }; },
      async registrarArquivoImportado() { registrou = true; },
    });
    const service = criarExtratoService(repo, fakeOcr());
    const saida = await service.importarArquivo(
      '11111111-1111-4111-8111-111111111111', 1, Buffer.from(OFX_MINIMO), 'text/plain', 'extrato.ofx', { forcar: true }
    );
    expect(saida.resultado).toEqual(resultado);
    expect(registrou).toBe(true);
  });
});
