import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { pool, withTenantTransaction } from '../../../infra/db/pool';
import { AppError } from '../../../shared/errors/app-error';
import { TransacoesRepository } from '../ports/transacoes-repository';
import { DadosTransacao, FiltroTransacoes, ListaTransacoes, TransacaoListada } from '../types';

const TZ = 'America/Sao_Paulo';

const CAMPOS_TRANSACAO = `
  t.id,
  t.data_transacao,
  t.descricao_bruta,
  t.valor,
  t.status_reconciliado,
  t.origem,
  t.cupom_id,
  t.categoria,
  t.conta_id,
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
  END AS itens_cupom
`;

const FROM_TRANSACAO = `
  FROM transacoes_banco t
  JOIN contas_bancarias c ON c.id = t.conta_id
  LEFT JOIN cupons_fiscais cf ON cf.id = t.cupom_id
`;

async function buscarPorId(
  client: PoolClient,
  tenantId: string,
  transacaoId: number
): Promise<TransacaoListada> {
  const { rows } = await client.query<TransacaoListada>(
    `SELECT ${CAMPOS_TRANSACAO} ${FROM_TRANSACAO} WHERE t.id = $1 AND t.tenant_id = $2`,
    [transacaoId, tenantId]
  );
  if (rows.length === 0) throw new AppError('Transação não encontrada.', 404);
  return rows[0];
}

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
      `SELECT ${CAMPOS_TRANSACAO}, COUNT(*) OVER() AS total_registros
         ${FROM_TRANSACAO}
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

  async criar(tenantId, dados: DadosTransacao): Promise<TransacaoListada> {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO transacoes_banco
           (tenant_id, conta_id, data_transacao, descricao_bruta, valor, categoria, origem, hash_ofx)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)
         RETURNING id`,
        [
          tenantId,
          dados.contaId,
          dados.dataTransacao,
          dados.descricaoBruta,
          dados.valor,
          dados.categoria,
          `manual:${randomUUID()}`,
        ]
      );
      return buscarPorId(client, tenantId, rows[0].id);
    });
  },

  async atualizar(tenantId, transacaoId, dados: Partial<DadosTransacao>): Promise<TransacaoListada> {
    return withTenantTransaction(tenantId, async (client) => {
      const atual = await client.query<{ cupom_id: number | null }>(
        'SELECT cupom_id FROM transacoes_banco WHERE id = $1 AND tenant_id = $2',
        [transacaoId, tenantId]
      );
      if (atual.rowCount === 0) throw new AppError('Transação não encontrada.', 404);

      const sets: string[] = [];
      const params: unknown[] = [];
      const add = (coluna: string, valor: unknown) => {
        params.push(valor);
        sets.push(`${coluna} = $${params.length}`);
      };
      if (dados.contaId !== undefined) add('conta_id', dados.contaId);
      if (dados.dataTransacao !== undefined) add('data_transacao', dados.dataTransacao);
      if (dados.descricaoBruta !== undefined) add('descricao_bruta', dados.descricaoBruta);
      if (dados.valor !== undefined) add('valor', dados.valor);
      if (dados.categoria !== undefined) add('categoria', dados.categoria);

      // Mudar data/valor invalida o match feito pelo motor de reconciliação
      // (baseado em valor exato + janela de 48h) — desvincula em vez de deixar
      // uma transação "detalhada" mostrando um cupom que não corresponde mais.
      if (atual.rows[0].cupom_id !== null && (dados.dataTransacao !== undefined || dados.valor !== undefined)) {
        add('cupom_id', null);
        add('status_reconciliado', false);
      }

      if (sets.length > 0) {
        params.push(transacaoId, tenantId);
        await client.query(
          `UPDATE transacoes_banco SET ${sets.join(', ')}
            WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
          params
        );
      }
      return buscarPorId(client, tenantId, transacaoId);
    });
  },

  async excluir(tenantId, transacaoId) {
    await withTenantTransaction(tenantId, async (client) => {
      const { rowCount } = await client.query(
        'DELETE FROM transacoes_banco WHERE id = $1 AND tenant_id = $2',
        [transacaoId, tenantId]
      );
      if (rowCount === 0) throw new AppError('Transação não encontrada.', 404);
    });
  },

  async recategorizarTodas(tenantId: string): Promise<number> {
    return withTenantTransaction(tenantId, async (client) => {
      const regrasRes = await client.query<{ termo: string; categoria_chave: string }>(
        'SELECT termo, categoria_chave FROM regras_categorizacao WHERE tenant_id = $1',
        [tenantId]
      );
      
      let total = 0;
      for (const r of regrasRes.rows) {
        const res = await client.query(
          `UPDATE transacoes_banco
              SET categoria = $1
            WHERE tenant_id = $2
              AND LOWER(descricao_bruta) LIKE '%' || $3 || '%'
              AND cupom_id IS NULL
              AND (categoria IS NULL OR categoria != $1)`,
          [r.categoria_chave, tenantId, r.termo.toLowerCase()]
        );
        if (res.rowCount) {
          total += res.rowCount;
        }
      }
      return total;
    });
  },
};
