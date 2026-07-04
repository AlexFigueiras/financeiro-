import { ExtratoRepository } from '../ports/extrato-repository';
import { ExtratoOcrPort } from '../ports/extrato-ocr-port';
import { parseOfx, pareceOfx, detectarEncodingOfx } from '../domain/ofx-parser';
import { ResultadoImportExtrato } from '../types';
import { AppError } from '../../../shared/errors/app-error';
import { publicar } from '../../../events/bus';

export function criarExtratoService(repo: ExtratoRepository, ocr: ExtratoOcrPort) {
  return {
    async importarArquivo(
      tenantId: string,
      contaId: number,
      arquivo: Buffer,
      mimetype: string,
      originalname: string
    ): Promise<{ resultado: ResultadoImportExtrato; via: 'ofx' | 'pdf' }> {
      let resultado: ResultadoImportExtrato;
      let via: 'ofx' | 'pdf';

      if (pareceOfx(mimetype, originalname ?? '', arquivo)) {
        const encoding = detectarEncodingOfx(arquivo);
        const transacoes = parseOfx(arquivo.toString(encoding));
        resultado = await repo.inserirTransacoes(tenantId, contaId, transacoes);
        via = 'ofx';
      } else if (mimetype === 'application/pdf' || mimetype.startsWith('image/')) {
        const transacoes = await ocr.extrairTransacoes(arquivo, mimetype);
        resultado = await repo.inserirTransacoes(tenantId, contaId, transacoes);
        via = 'pdf';
      } else {
        throw new AppError(
          `Formato não suportado (${mimetype}). Envie um arquivo OFX, um PDF ou uma foto do extrato.`,
          415
        );
      }

      await publicar('extrato.importado.v1', {
        tenantId,
        contaId,
        via,
        totalNoArquivo: resultado.totalNoArquivo,
        importadas: resultado.importadas,
        ignoradasDuplicadas: resultado.ignoradasDuplicadas,
      });

      return { resultado, via };
    },
  };
}
