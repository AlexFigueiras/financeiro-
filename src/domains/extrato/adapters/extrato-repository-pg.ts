import { pool, withTenantTransaction } from '../../../infra/db/pool';
import { ExtratoRepository } from '../ports/extrato-repository';
import { hashOfx } from '../domain/ofx-parser';
import { categorizarTransacoesComIA } from '../../../shared/ia/categorizador-transacoes';

export const extratoRepositoryPg: ExtratoRepository = {
  async inserirTransacoes(tenantId, contaId, transacoes) {
    return withTenantTransaction(tenantId, async (client) => {
      // 1. Busca catálogo de categorias do tenant
      const catRes = await client.query<{ chave: string; nome: string }>(
        'SELECT chave, nome FROM categorias WHERE tenant_id = $1',
        [tenantId]
      );
      const categorias = catRes.rows;

      // 2. Busca regras manuais/aprendidas existentes do tenant
      const regrasRes = await client.query<{ termo: string; categoria_chave: string }>(
        'SELECT termo, categoria_chave FROM regras_categorizacao WHERE tenant_id = $1',
        [tenantId]
      );
      const regras = regrasRes.rows;

      // 3. Associa regras manuais ou identifica transações para IA
      const categoriasPredefinidas = new Map<number, string>();
      const paraIa: Array<{ id: number; descricao: string }> = [];

      transacoes.forEach((t, index) => {
        const descLower = t.descricao.toLowerCase();
        const regraEncontrada = regras.find((r) => descLower.includes(r.termo.toLowerCase()));
        if (regraEncontrada) {
          categoriasPredefinidas.set(index, regraEncontrada.categoria_chave);
        } else {
          paraIa.push({ id: index, descricao: t.descricao });
        }
      });

      // 4. Executa categorização semântica com Gemini IA para as transações sem regra manual
      const categoriasIa = await categorizarTransacoesComIA(categorias, paraIa);

      let importadas = 0;
      let ignoradasDuplicadas = 0;

      for (let i = 0; i < transacoes.length; i++) {
        const t = transacoes[i];
        const categoria =
          categoriasPredefinidas.get(i) ??
          categoriasIa.get(i) ??
          'outros';

        const result = await client.query(
          `INSERT INTO transacoes_banco (tenant_id, conta_id, data_transacao, descricao_bruta, valor, hash_ofx, origem, categoria)
           VALUES ($1, $2, $3, $4, $5, $6, 'ofx', $7)
           ON CONFLICT (tenant_id, hash_ofx) DO NOTHING`,
          [tenantId, contaId, t.data.toISOString(), t.descricao, t.valor, hashOfx(t, contaId), categoria]
        );
        if (result.rowCount === 1) importadas++;
        else ignoradasDuplicadas++;
      }
      return { totalNoArquivo: transacoes.length, importadas, ignoradasDuplicadas };
    });
  },

  async buscarArquivoImportado(tenantId, hashArquivo) {
    const { rows } = await pool.query<{ nome_arquivo: string; criado_em: Date }>(
      `SELECT nome_arquivo, criado_em FROM arquivos_importados
        WHERE tenant_id = $1 AND tipo = 'extrato' AND hash_arquivo = $2`,
      [tenantId, hashArquivo]
    );
    if (rows.length === 0) return null;
    return { nomeArquivo: rows[0].nome_arquivo, enviadoEm: rows[0].criado_em };
  },

  async registrarArquivoImportado(tenantId, arquivo) {
    await pool.query(
      `INSERT INTO arquivos_importados (tenant_id, tipo, hash_arquivo, nome_arquivo, tamanho_bytes)
       VALUES ($1, 'extrato', $2, $3, $4)
       ON CONFLICT (tenant_id, tipo, hash_arquivo) DO NOTHING`,
      [tenantId, arquivo.hashArquivo, arquivo.nomeArquivo, arquivo.tamanhoBytes]
    );
  },
};
