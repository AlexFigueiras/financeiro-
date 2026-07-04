import { pool, withTenantTransaction } from '../../../infra/db/pool';
import { AppError } from '../../../shared/errors/app-error';
import { TransacoesRepository } from '../ports/transacoes-repository';
import { FiltroTransacoes, ListaTransacoes, TransacaoListada } from '../types';

const TZ = 'America/Sao_Paulo';

export const transacoesRepositoryPg: TransacoesRepository = {
  async listar(tenantId, filtro: FiltroTransacoes): Promise<ListaTransacoes> {
    const filtros: string[] = ['t.tenant_id = $1'];
    const params: unknown[] = [tenantId];

    if (filtro.mes) {
      params.push(`${filtro.mes}-01`);
      filtros.push(
        `t.data_transacao >= ($${params.length}::date AT TIME ZONE '${TZ}')
         AND t.data_transacao < (($${params.length}::date + INTERVAL '1 month') AT TIME ZONE '${TZ}')`
      );
    }
    if (filtro.contaId !== undefined) {
      params.push(filtro.contaId);
      filtros.push(`t.conta_id = $${params.length}`);
    }
    const where = `WHERE ${filtros.join(' AND ')}`;

    const offset = (filtro.pagina - 1) * filtro.limite;
    params.push(filtro.limite, offset);

    const { rows } = await pool.query<TransacaoListada & { total_registros: string }>(
      `SELECT t.id,
              t.data_transacao,
              t.descricao_bruta,
              t.valor,
              t.status_reconciliado,
              t.origem,
              t.cupom_id,
              t.categoria,
              c.nome  AS conta_nome,
              cf.estabelecimento,
              cf.data_emissao AS cupom_data_emissao,
              CASE WHEN t.cupom_id IS NULL THEN NULL
                   ELSE (SELECT json_agg(json_build_object(
                            'id',            i.id,
                            'nome_produto',  i.nome_produto,
                            'quantidade',    i.quantidade,
                            'preco_unitario',i.preco_unitario,
                            'valor_total',   i.valor_total,
                            'categoria',     i.categoria
                          ) ORDER BY i.id)
                           FROM itens_cupom i WHERE i.cupom_id = t.cupom_id AND i.tenant_id = t.tenant_id)
              END AS itens_cupom,
              COUNT(*) OVER() AS total_registros
         FROM transacoes_banco t
         JOIN contas_bancarias c ON c.id = t.conta_id
         LEFT JOIN cupons_fiscais cf ON cf.id = t.cupom_id
         ${where}
        ORDER BY t.data_transacao DESC, t.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? Number(rows[0].total_registros) : 0;
    return {
      pagina: filtro.pagina,
      limite: filtro.limite,
      total,
      transacoes: rows.map(({ total_registros: _ignorado, ...t }) => t),
    };
  },

  async atualizarCategoria(tenantId, transacaoId, categoriaChave) {
    await withTenantTransaction(tenantId, async (client) => {
      const txRes = await client.query<{ descricao_bruta: string }>(
        'SELECT descricao_bruta FROM transacoes_banco WHERE id = $1 AND tenant_id = $2',
        [transacaoId, tenantId]
      );
      if (txRes.rowCount === 0) {
        throw new AppError('Transação não encontrada.', 404);
      }
      const termoRegra = txRes.rows[0].descricao_bruta.toLowerCase().trim();

      await client.query(
        'UPDATE transacoes_banco SET categoria = $1 WHERE id = $2 AND tenant_id = $3',
        [categoriaChave, transacaoId, tenantId]
      );

      await client.query(
        `INSERT INTO regras_categorizacao (tenant_id, termo, categoria_chave)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, termo) DO UPDATE SET categoria_chave = EXCLUDED.categoria_chave`,
        [tenantId, termoRegra, categoriaChave]
      );

      await client.query(
        `UPDATE transacoes_banco
            SET categoria = $1
          WHERE tenant_id = $2
            AND LOWER(descricao_bruta) = $3
            AND cupom_id IS NULL`,
        [categoriaChave, tenantId, termoRegra]
      );
    });
  },
};
