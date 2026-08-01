import { CupomOcrPort, ArquivoOcr } from '../ports/cupom-ocr-port';
import { CupomRepository } from '../ports/cupom-repository';
import { NfcePort } from '../ports/nfce-port';
import { validarCupom, normalizarDataEmissao } from '../domain/validacao-cupom';
import { interpretarUrlNfce } from '../domain/nfce-url';
import { DadosItemCupom, ResultadoCupom } from '../types';
import { AppError } from '../../../shared/errors/app-error';
import { hashConjuntoArquivos } from '../../../shared/arquivos/hash-arquivo';
import { publicar } from '../../../events/bus';

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** Sem NfcePort real injetado (só ocorre se `index.ts` não vier a compor este service). */
const NFCE_NAO_CONFIGURADO: NfcePort = {
  async extrair() {
    throw new AppError('Importação de cupom via NFC-e não está configurada neste ambiente.', 501);
  },
};

export function criarCupomService(ocr: CupomOcrPort, repo: CupomRepository, nfce: NfcePort = NFCE_NAO_CONFIGURADO) {
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

    /** Importa um cupom a partir da URL do QR Code da NFC-e: scraping da SEFAZ + IA + reuso do pipeline. */
    async importarPorUrlNfce(
      tenantId: string,
      urlBruta: string,
      opcoes: { forcar?: boolean } = {}
    ): Promise<ResultadoCupom> {
      const { url, chaveAcesso } = interpretarUrlNfce(urlBruta);

      // Dedup pela chave de acesso da nota — identificador natural, mais preciso que hash de arquivo.
      if (!opcoes.forcar) {
        const anterior = await repo.buscarPorChaveAcesso(tenantId, chaveAcesso);
        if (anterior) {
          throw new AppError(
            `Esta nota fiscal já foi importada em ${fmtDataHora.format(anterior.criadoEm)}. ` +
              'Nada foi processado de novo.',
            409,
            { duplicado: true, cupomId: anterior.id, enviadoEm: anterior.criadoEm.toISOString() }
          );
        }
      }

      const dados = await nfce.extrair(url);
      validarCupom(dados);
      const dataEmissao = normalizarDataEmissao(dados.data);

      const cupomId = await repo.salvar(tenantId, dados, dataEmissao, chaveAcesso);

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

    async adicionarItem(
      tenantId: string,
      cupomId: number,
      corpo: { nome_produto?: unknown; quantidade?: unknown; preco_unitario?: unknown; categoria?: unknown }
    ): Promise<void> {
      if (!cupomId || isNaN(cupomId)) throw new AppError('ID de cupom inválido.', 400);

      const nomeProduto = typeof corpo.nome_produto === 'string' ? corpo.nome_produto.trim() : '';
      if (!nomeProduto || nomeProduto.length < 2) {
        throw new AppError('Nome do produto é obrigatório (mínimo 2 caracteres).', 400);
      }

      const quantidade = Number(corpo.quantidade);
      if (isNaN(quantidade) || quantidade <= 0) throw new AppError('Quantidade inválida (deve ser positiva).', 400);

      const precoUnitario = Number(corpo.preco_unitario);
      if (isNaN(precoUnitario) || precoUnitario < 0) throw new AppError('Preço unitário inválido.', 400);

      const categoria = typeof corpo.categoria === 'string' && corpo.categoria.trim() ? corpo.categoria.trim() : 'outros';

      await repo.adicionarItem(tenantId, cupomId, {
        nomeProduto,
        quantidade,
        precoUnitario: Math.round(precoUnitario * 100) / 100,
        categoria,
      });
    },

    async criarManual(
      tenantId: string,
      corpo: { estabelecimento?: unknown; data_emissao?: unknown; itens?: unknown }
    ): Promise<ResultadoCupom> {
      const estabelecimento = typeof corpo.estabelecimento === 'string' ? corpo.estabelecimento.trim() : '';
      if (!estabelecimento || estabelecimento.length < 2) {
        throw new AppError('Estabelecimento é obrigatório (mínimo 2 caracteres).', 400);
      }

      const dataEmissaoRaw = typeof corpo.data_emissao === 'string' ? corpo.data_emissao.trim() : '';
      const dataEmissao = normalizarDataEmissao(dataEmissaoRaw || new Date().toISOString());

      const itensRaw = Array.isArray(corpo.itens) ? corpo.itens : [];
      const itensValidados = itensRaw.map((i: any, idx: number) => {
        const nomeProduto = typeof i.nome_produto === 'string' ? i.nome_produto.trim() : '';
        if (!nomeProduto || nomeProduto.length < 2) {
          throw new AppError(`Item #${idx + 1}: nome do produto é obrigatório (mínimo 2 caracteres).`, 400);
        }
        const quantidade = Number(i.quantidade);
        if (isNaN(quantidade) || quantidade <= 0) {
          throw new AppError(`Item #${idx + 1}: quantidade inválida.`, 400);
        }
        const precoUnitario = Number(i.preco_unitario);
        if (isNaN(precoUnitario) || precoUnitario < 0) {
          throw new AppError(`Item #${idx + 1}: preço unitário inválido.`, 400);
        }
        const categoria = typeof i.categoria === 'string' && i.categoria.trim() ? i.categoria.trim() : 'outros';
        return {
          nomeProduto,
          quantidade,
          precoUnitario: Math.round(precoUnitario * 100) / 100,
          categoria,
        };
      });

      const cupomId = await repo.criarManual(tenantId, {
        estabelecimento,
        dataEmissao,
        itens: itensValidados,
      });

      const valorTotal = itensValidados.reduce(
        (soma, item) => soma + Math.round(item.quantidade * item.precoUnitario * 100) / 100,
        0
      );

      const resultado: ResultadoCupom = {
        cupomId,
        estabelecimento,
        dataEmissao,
        valorTotal,
        itens: itensValidados.length,
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

    async excluirCupom(tenantId: string, cupomId: number): Promise<void> {
      if (!cupomId || isNaN(cupomId)) throw new AppError('ID de cupom inválido.', 400);
      await repo.excluirCupom(tenantId, cupomId);
    },

    async listarPendentes(tenantId: string) {
      return repo.listarPendentes(tenantId);
    },
  };
}
