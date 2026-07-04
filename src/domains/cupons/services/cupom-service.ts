import { CupomOcrPort } from '../ports/cupom-ocr-port';
import { CupomRepository } from '../ports/cupom-repository';
import { validarCupom, normalizarDataEmissao } from '../domain/validacao-cupom';
import { ResultadoCupom } from '../types';
import { AppError } from '../../../shared/errors/app-error';
import { publicar } from '../../../events/bus';

export function criarCupomService(ocr: CupomOcrPort, repo: CupomRepository) {
  return {
    /** Processa o arquivo do cupom: OCR via Gemini + persistência transacional. */
    async processar(tenantId: string, arquivo: Buffer, mimeType: string): Promise<ResultadoCupom> {
      const dados = await ocr.extrairCupom(arquivo, mimeType);
      validarCupom(dados);
      const dataEmissao = normalizarDataEmissao(dados.data);

      const cupomId = await repo.salvar(tenantId, dados, dataEmissao);

      const resultado: ResultadoCupom = {
        cupomId,
        estabelecimento: dados.estabelecimento,
        dataEmissao,
        valorTotal: dados.valor_total,
        itens: dados.itens.length,
      };

      await publicar('cupom.processado.v1', {
        tenantId,
        cupomId,
        estabelecimento: resultado.estabelecimento,
        valorTotal: resultado.valorTotal,
        itens: resultado.itens,
      });

      return resultado;
    },

    async obterComItens(tenantId: string, cupomId: number) {
      const cupom = await repo.buscarComItens(tenantId, cupomId);
      if (!cupom) throw new AppError(`Cupom ${cupomId} não encontrado.`, 404);
      return cupom;
    },

    async atualizarCategoriaItem(tenantId: string, itemId: number, categoriaBruta: unknown): Promise<void> {
      if (!categoriaBruta || typeof categoriaBruta !== 'string') {
        throw new AppError('O campo categoria é obrigatório.', 400);
      }
      const categoriaChave = categoriaBruta.toLowerCase().trim();
      if (!(await repo.categoriaExiste(tenantId, categoriaChave))) {
        throw new AppError(`A categoria "${categoriaChave}" não é válida.`, 400);
      }
      await repo.atualizarCategoriaItem(tenantId, itemId, categoriaChave);
    },
  };
}
