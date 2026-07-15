import { PoolClient } from 'pg';
import { pool, withTenantTransaction } from '../../../infra/db/pool';
import { AppError } from '../../../shared/errors/app-error';
import { CupomRepository } from '../ports/cupom-repository';
import { CupomComItens, DadosItemCupom } from '../types';

/** Mantém cupons_fiscais.valor_total = soma dos itens após qualquer edição/exclusão de item. */
async function recalcularTotalCupom(client: PoolClient, tenantId: string, cupomId: number): Promise<void> {
  await client.query(
    `UPDATE cupons_fiscais
        SET valor_total = COALESCE(
              (SELECT SUM(valor_total) FROM itens_cupom WHERE cupom_id = $1 AND tenant_id = $2), 0)
      WHERE id = $1 AND tenant_id = $2`,
    [cupomId, tenantId]
  );
}

export const cupomRepositoryPg: CupomRepository = {
  async salvar(tenantId, dados, dataEmissaoIso) {
    return withTenantTransaction(tenantId, async (client) => {
      const cupom = await client.query<{ id: number }>(
        `INSERT INTO cupons_fiscais (tenant_id, data_emissao, valor_total, estabelecimento, json_bruto_ia)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [tenantId, dataEmissaoIso, dados.valor_total, dados.estabelecimento.trim(), JSON.stringify(dados)]
      );
      const cupomId = cupom.rows[0].id;

      for (const item of dados.itens) {
        await client.query(
          `INSERT INTO itens_cupom (tenant_id, cupom_id, nome_produto, quantidade, preco_unitario, valor_total, categoria)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenantId,
            cupomId,
            String(item.produto ?? 'Item sem descrição').trim(),
            Number(item.qtd) > 0 ? Number(item.qtd) : 1,
            Number(item.valor_uni) || 0,
            Number(item.subtotal) || 0,
            (item.categoria ?? 'outros').toLowerCase().trim() || 'outros',
          ]
        );
      }
      return cupomId;
    });
  },

  async buscarComItens(tenantId, cupomId): Promise<CupomComItens | null> {
    return withTenantTransaction(tenantId, async (client) => {
      const cupom = await client.query(
        'SELECT id, data_emissao, valor_total, estabelecimento FROM cupons_fiscais WHERE id = $1 AND tenant_id = $2',
        [cupomId, tenantId]
      );
      if (cupom.rowCount === 0) return null;
      const itens = await client.query(
        `SELECT id, cupom_id, nome_produto, quantidade, preco_unitario, valor_total, categoria
           FROM itens_cupom WHERE cupom_id = $1 AND tenant_id = $2 ORDER BY id`,
        [cupomId, tenantId]
      );
      const c = cupom.rows[0];
      return {
        id: c.id,
        dataEmissao: c.data_emissao,
        valorTotal: Number(c.valor_total),
        estabelecimento: c.estabelecimento,
        itens: itens.rows.map((i) => ({
          id: i.id,
          cupomId: i.cupom_id,
          nomeProduto: i.nome_produto,
          quantidade: Number(i.quantidade),
          precoUnitario: Number(i.preco_unitario),
          valorTotal: Number(i.valor_total),
          categoria: i.categoria,
        })),
      };
    });
  },

  async categoriaExiste(tenantId, categoriaChave) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM categorias WHERE tenant_id = $1 AND chave = $2',
      [tenantId, categoriaChave]
    );
    return (rowCount ?? 0) > 0;
  },

  async atualizarCategoriaItem(tenantId, itemId, categoriaChave) {
    await withTenantTransaction(tenantId, async (client) => {
      const itemRes = await client.query<{ nome_produto: string }>(
        'SELECT nome_produto FROM itens_cupom WHERE id = $1 AND tenant_id = $2',
        [itemId, tenantId]
      );
      if (itemRes.rowCount === 0) {
        throw new AppError('Item de cupom não encontrado.', 404);
      }
      const nomeProdutoLower = itemRes.rows[0].nome_produto.toLowerCase();

      await client.query(
        'UPDATE itens_cupom SET categoria = $1 WHERE id = $2 AND tenant_id = $3',
        [categoriaChave, itemId, tenantId]
      );

      await client.query(
        `INSERT INTO regras_categorizacao (tenant_id, termo, categoria_chave)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, termo) DO UPDATE SET categoria_chave = EXCLUDED.categoria_chave`,
        [tenantId, nomeProdutoLower, categoriaChave]
      );

      await client.query(
        'UPDATE itens_cupom SET categoria = $1 WHERE tenant_id = $2 AND LOWER(nome_produto) = $3',
        [categoriaChave, tenantId, nomeProdutoLower]
      );
    });
  },

  async atualizarItem(tenantId, itemId, dados: DadosItemCupom) {
    await withTenantTransaction(tenantId, async (client) => {
      const atual = await client.query<{ cupom_id: number; quantidade: string; preco_unitario: string }>(
        'SELECT cupom_id, quantidade, preco_unitario FROM itens_cupom WHERE id = $1 AND tenant_id = $2',
        [itemId, tenantId]
      );
      if (atual.rowCount === 0) throw new AppError('Item de cupom não encontrado.', 404);
      const { cupom_id: cupomId } = atual.rows[0];

      const quantidade = dados.quantidade ?? Number(atual.rows[0].quantidade);
      const precoUnitario = dados.precoUnitario ?? Number(atual.rows[0].preco_unitario);
      // Se o valor total não veio explícito mas qtd/preço mudou, recalcula a partir deles.
      const valorTotal =
        dados.valorTotal ??
        (dados.quantidade !== undefined || dados.precoUnitario !== undefined
          ? Math.round(quantidade * precoUnitario * 100) / 100
          : undefined);

      const sets: string[] = [];
      const params: unknown[] = [];
      const add = (coluna: string, valor: unknown) => {
        params.push(valor);
        sets.push(`${coluna} = $${params.length}`);
      };
      if (dados.nomeProduto !== undefined) add('nome_produto', dados.nomeProduto);
      if (dados.quantidade !== undefined) add('quantidade', dados.quantidade);
      if (dados.precoUnitario !== undefined) add('preco_unitario', dados.precoUnitario);
      if (valorTotal !== undefined) add('valor_total', valorTotal);

      if (sets.length > 0) {
        params.push(itemId, tenantId);
        await client.query(
          `UPDATE itens_cupom SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
          params
        );
      }
      await recalcularTotalCupom(client, tenantId, cupomId);
    });
  },

  async excluirItem(tenantId, itemId) {
    await withTenantTransaction(tenantId, async (client) => {
      const atual = await client.query<{ cupom_id: number }>(
        'SELECT cupom_id FROM itens_cupom WHERE id = $1 AND tenant_id = $2',
        [itemId, tenantId]
      );
      if (atual.rowCount === 0) throw new AppError('Item de cupom não encontrado.', 404);
      const { cupom_id: cupomId } = atual.rows[0];

      await client.query('DELETE FROM itens_cupom WHERE id = $1 AND tenant_id = $2', [itemId, tenantId]);
      await recalcularTotalCupom(client, tenantId, cupomId);
    });
  },

  async listarPendentes(tenantId) {
    const { rows } = await pool.query(
      `SELECT c.id, c.data_emissao AS "dataEmissao", c.valor_total AS "valorTotal", c.estabelecimento
         FROM cupons_fiscais c
        WHERE c.tenant_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM transacoes_banco t WHERE t.cupom_id = c.id
          )
        ORDER BY c.data_emissao DESC`,
      [tenantId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      dataEmissao: r.dataEmissao,
      valorTotal: Number(r.valorTotal),
      estabelecimento: r.estabelecimento,
    }));
  },
};
