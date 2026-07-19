import { CupomOcrPort, ArquivoOcr } from '../ports/cupom-ocr-port';
import { CupomRepository } from '../ports/cupom-repository';
import { validarCupom, normalizarDataEmissao } from '../domain/validacao-cupom';
import { DadosItemCupom, ResultadoCupom } from '../types';
import { AppError } from '../../../shared/errors/app-error';
import { hashConjuntoArquivos } from '../../../shared/arquivos/hash-arquivo';
import { publicar } from '../../../events/bus';

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function criarCupomService(ocr: CupomOcrPort, repo: CupomRepository) {
  return {
    /** Processa os arquivos do cupom: OCR via Gemini + persistência transacional. */
    async processar(
      tenantId: string,
      arquivos: ArquivoOcr[],
      opcoes: { forcar?: boolean } = {}
    ): Promise<ResultadoCupom> {
      // Reenvio do(s) mesmo(s) arquivo(s) (hash de conteúdo): avisa ANTES de
      // gastar OCR/Gemini. `forcar` pula o aviso (ex.: cupom idêntico legítimo).
      const hashArquivo = hashConjuntoArquivos(arquivos.map((a) => a.buffer));
      if (!opcoes.forcar) {
        const anterior = await repo.buscarArquivoImportado(tenantId, hashArquivo);
        if (anterior) {
          const nome = anterior.nomeArquivo ? ` (${anterior.nomeArquivo})` : '';
          throw new AppError(
            `Este cupom já foi enviado em ${fmtDataHora.format(anterior.enviadoEm)}${nome}. ` +
              'Nada foi processado de novo.',
            409,
            {
              duplicado: true,
              nomeArquivo: anterior.nomeArquivo,
              enviadoEm: anterior.enviadoEm.toISOString(),
            }
          );
        }
      }

      const dados = await ocr.extrairCupom(arquivos);
      validarCupom(dados);
      const dataEmissao = normalizarDataEmissao(dados.data);

      const cupomId = await repo.salvar(tenantId, dados, dataEmissao);

      const nomeArquivo = arquivos.map((a) => a.nome).filter(Boolean).join(', ');
      const tamanhoBytes = arquivos.reduce((soma, a) => soma + a.buffer.length, 0);
      await repo.registrarArquivoImportado(tenantId, { hashArquivo, nomeArquivo, tamanhoBytes });

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
