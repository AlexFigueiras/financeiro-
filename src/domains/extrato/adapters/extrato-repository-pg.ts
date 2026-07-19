import { pool, withTenantTransaction } from '../../../infra/db/pool';
import { ExtratoRepository } from '../ports/extrato-repository';
import { hashOfx } from '../domain/ofx-parser';

export const extratoRepositoryPg: ExtratoRepository = {
  async inserirTransacoes(tenantId, contaId, transacoes) {
    return withTenantTransaction(tenantId, async (client) => {
      let importadas = 0;
      let ignoradasDuplicadas = 0;
      for (const t of transacoes) {
        // Busca regra de categorização baseada na descrição (case-insensitive contains)
        const regraRes = await client.query<{ categoria_chave: string }>(
          `SELECT categoria_chave FROM regras_categorizacao
            WHERE tenant_id = $1 AND $2 ILIKE '%' || termo || '%' LIMIT 1`,
          [tenantId, t.descricao]
        );
        const categoria = regraRes.rowCount && regraRes.rowCount > 0 ? regraRes.rows[0].categoria_chave : 'outros';

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
