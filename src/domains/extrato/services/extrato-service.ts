import { ExtratoRepository } from '../ports/extrato-repository';
import { ExtratoOcrPort } from '../ports/extrato-ocr-port';
import { parseOfx, pareceOfx, detectarEncodingOfx } from '../domain/ofx-parser';
import { ResultadoImportExtrato } from '../types';
import { AppError } from '../../../shared/errors/app-error';
import { sha256Hex } from '../../../shared/arquivos/hash-arquivo';
import { publicar } from '../../../events/bus';

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function criarExtratoService(repo: ExtratoRepository, ocr: ExtratoOcrPort) {
  return {
    async importarArquivo(
      tenantId: string,
      contaId: number,
      arquivo: Buffer,
      mimetype: string,
      originalname: string,
      opcoes: { forcar?: boolean } = {}
    ): Promise<{ resultado: ResultadoImportExtrato; via: 'ofx' | 'pdf' }> {
      // Reenvio do mesmo arquivo (hash de conteúdo): avisa ANTES de processar —
      // e antes de pagar OCR no caminho PDF/imagem. `forcar` pula o aviso.
      const hashArquivo = sha256Hex(arquivo);
      if (!opcoes.forcar) {
        const anterior = await repo.buscarArquivoImportado(tenantId, hashArquivo);
        if (anterior) {
          const nome = anterior.nomeArquivo ? ` (${anterior.nomeArquivo})` : '';
          throw new AppError(
            `Este arquivo já foi enviado em ${fmtDataHora.format(anterior.enviadoEm)}${nome}. ` +
              'Nada foi importado de novo.',
            409,
            {
              duplicado: true,
              nomeArquivo: anterior.nomeArquivo,
              enviadoEm: anterior.enviadoEm.toISOString(),
            }
          );
        }
      }

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

      await repo.registrarArquivoImportado(tenantId, {
        hashArquivo,
        nomeArquivo: originalname ?? '',
        tamanhoBytes: arquivo.length,
      });

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
