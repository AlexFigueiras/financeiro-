import { requisitarGeminiJson } from '../../../shared/ia/gemini-client';
import { AppError } from '../../../shared/errors/app-error';
import { ExtratoOcrPort } from '../ports/extrato-ocr-port';
import { TransacaoOfx } from '../types';

const SYSTEM_PROMPT_EXTRATO =
  'Atue como um extrator de extratos bancários. Analise o extrato (PDF ou imagem) ' +
  'e extraia TODOS os lançamentos/transações. Para cada lançamento extraia: a data ' +
  '(formato YYYY-MM-DD), a descrição/histórico e o valor. REGRA DE SINAL OBRIGATÓRIA: ' +
  'valor NEGATIVO para débitos/saídas/pagamentos/compras/saques/transferências enviadas; ' +
  'valor POSITIVO para créditos/entradas/depósitos/recebimentos/transferências recebidas. ' +
  'IGNORE linhas de saldo (SALDO ANTERIOR, SALDO DO DIA, SALDO ATUAL, SALDO FINAL, ' +
  'SALDO DISPONÍVEL, SALDO BLOQUEADO) — não são transações. Ignore cabeçalhos e rodapés. ' +
  'Retorne estritamente um JSON limpo no formato: ' +
  '{"transacoes": [{"data": "YYYY-MM-DD", "descricao": string, "valor": float}]} ' +
  'Sem markdown, sem comentários, sem texto fora do JSON.';

interface LancamentoGemini {
  data: string;
  descricao: string;
  valor: number;
}

interface ExtratoGemini {
  transacoes: LancamentoGemini[];
}

const ehLinhaSaldo = (desc: string) => /\bsaldo\b/i.test(desc);

export const extratoOcrGemini: ExtratoOcrPort = {
  /**
   * Extrai as transações de um extrato em PDF/imagem via Gemini, normaliza e
   * valida. Datas sem hora são fixadas ao meio-dia de Brasília (evita virada
   * de dia por fuso). Retorna no formato TransacaoOfx para reusar hash e importador.
   */
  async extrairTransacoes(arquivo: Buffer, mimeType: string): Promise<TransacaoOfx[]> {
    const dados = await requisitarGeminiJson<ExtratoGemini>(
      arquivo,
      mimeType,
      SYSTEM_PROMPT_EXTRATO,
      'Extraia todos os lançamentos deste extrato bancário conforme instruído.'
    );

    if (!dados || !Array.isArray(dados.transacoes)) {
      throw new AppError(
        'Não foi possível ler lançamentos neste arquivo. Confirme que é um extrato bancário legível.',
        422,
        dados
      );
    }

    // Reforço no código: descarta linhas de saldo mesmo que o modelo as inclua.
    const transacoes: TransacaoOfx[] = [];
    for (const l of dados.transacoes) {
      const valor = Number(l.valor);
      if (!l.data || typeof l.data !== 'string' || isNaN(valor) || valor === 0) continue;
      if (typeof l.descricao === 'string' && ehLinhaSaldo(l.descricao)) continue;
      const iso = /[T ]/.test(l.data) ? l.data.trim().replace(' ', 'T') : `${l.data.trim()}T12:00:00-03:00`;
      const data = new Date(/[zZ]|[+-]\d{2}:?\d{2}/.test(iso) ? iso : `${iso}-03:00`);
      if (isNaN(data.getTime())) continue;
      transacoes.push({
        data,
        valor: Math.round(valor * 100) / 100,
        descricao: String(l.descricao ?? 'Lançamento sem descrição').trim() || 'Lançamento sem descrição',
        fitid: null,
      });
    }

    if (transacoes.length === 0) {
      throw new AppError(
        'Nenhum lançamento válido foi identificado no extrato. Tente um PDF/foto mais nítido ou use o arquivo OFX.',
        422
      );
    }
    return transacoes;
  },
};
