import { CupomOcrPort, ArquivoOcr } from '../ports/cupom-ocr-port';
import { CupomRepository } from '../ports/cupom-repository';
import { validarCupom, normalizarDataEmissao } from '../domain/validacao-cupom';
import { DadosItemCupom, ResultadoCupom } from '../types';
import { AppError } from '../../../shared/errors/app-error';
import { publicar } from '../../../events/bus';

export function criarCupomService(ocr: CupomOcrPort, repo: CupomRepository) {
  return {
    /** Processa os arquivos do cupom: OCR via Gemini + persistência transacional. */
    async processar(tenantId: string, arquivos: ArquivoOcr[]): Promise<ResultadoCupom> {
      const dados = await ocr.extrairCupom(arquivos);
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

    /** Edição parcial: nome, quantidade, preço unitário e/ou valor total do item. */
    async atualizarItem(
      tenantId: string,
      itemId: number,
      corpo: { nome_produto?: unknown; quantidade?: unknown; preco_unitario?: unknown; valor_total?: unknown }
    ): Promise<void> {
      const dados: DadosItemCupom = {};

      if (corpo.nome_produto !== undefined) {
        if (typeof corpo.nome_produto !== 'string' || !corpo.nome_produto.trim()) {
          throw new AppError('Nome do produto inválido.', 400);
        }
        dados.nomeProduto = corpo.nome_produto.trim();
      }
      if (corpo.quantidade !== undefined) {
        const quantidade = Number(corpo.quantidade);
        if (isNaN(quantidade) || quantidade <= 0) throw new AppError('Quantidade inválida (deve ser positiva).', 400);
        dados.quantidade = quantidade;
      }
      if (corpo.preco_unitario !== undefined) {
        const precoUnitario = Number(corpo.preco_unitario);
        if (isNaN(precoUnitario) || precoUnitario < 0) throw new AppError('Preço unitário inválido.', 400);
        dados.precoUnitario = Math.round(precoUnitario * 100) / 100;
      }
      if (corpo.valor_total !== undefined) {
        const valorTotal = Number(corpo.valor_total);
        if (isNaN(valorTotal) || valorTotal < 0) throw new AppError('Valor total inválido.', 400);
        dados.valorTotal = Math.round(valorTotal * 100) / 100;
      }

      if (Object.keys(dados).length === 0) {
        throw new AppError('Informe ao menos um campo para atualizar.', 400);
      }
      await repo.atualizarItem(tenantId, itemId, dados);
    },

    async excluirItem(tenantId: string, itemId: number): Promise<void> {
      await repo.excluirItem(tenantId, itemId);
    },

    async listarPendentes(tenantId: string) {
      return repo.listarPendentes(tenantId);
    },
  };
}
