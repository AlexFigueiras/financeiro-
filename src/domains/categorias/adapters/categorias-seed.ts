import { pool } from '../../../infra/db/pool';

/** Mesmo catálogo padrão do seed original (infra/db/migrations/0001_schema_base.sql). */
const CATEGORIAS_PADRAO: Array<{ chave: string; nome: string; cor: string }> = [
  { chave: 'alimentacao', nome: 'Alimentação', cor: 'var(--cat-2)' },
  { chave: 'bebidas', nome: 'Bebidas', cor: 'var(--cat-1)' },
  { chave: 'limpeza', nome: 'Limpeza', cor: 'var(--cat-3)' },
  { chave: 'higiene', nome: 'Higiene', cor: 'var(--cat-4)' },
  { chave: 'hortifruti', nome: 'Hortifruti', cor: 'var(--cat-5)' },
  { chave: 'padaria', nome: 'Padaria', cor: 'var(--cat-6)' },
  { chave: 'carnes', nome: 'Carnes', cor: 'var(--cat-7)' },
  { chave: 'farmacia', nome: 'Farmácia', cor: 'var(--cat-8)' },
  { chave: 'transporte', nome: 'Transporte', cor: '#eb6834' },
  { chave: 'lazer', nome: 'Lazer', cor: '#4a3aa7' },
  { chave: 'vestuario', nome: 'Vestuário', cor: '#e87ba4' },
  { chave: 'eletronicos', nome: 'Eletrônicos', cor: '#2a78d6' },
  { chave: 'moradia', nome: 'Moradia', cor: '#eda100' },
  { chave: 'combustivel', nome: 'Combustível de Veículo', cor: '#a855f7' },
  { chave: 'transferencia', nome: 'Transferência', cor: '#94a3b8' },
  { chave: 'outros', nome: 'Outros', cor: '#898781' },
];

const REGRAS_PADRAO: Array<{ termo: string; categoria_chave: string }> = [
  { termo: 'mercado', categoria_chave: 'alimentacao' },
  { termo: 'supermercado', categoria_chave: 'alimentacao' },
  { termo: 'padaria', categoria_chave: 'padaria' },
  { termo: 'panificadora', categoria_chave: 'padaria' },
  { termo: 'posto', categoria_chave: 'combustivel' },
  { termo: 'combustivel', categoria_chave: 'combustivel' },
  { termo: 'uber', categoria_chave: 'transporte' },
  { termo: 'taxi', categoria_chave: 'transporte' },
  { termo: 'farmacia', categoria_chave: 'farmacia' },
  { termo: 'drogaria', categoria_chave: 'farmacia' },
  { termo: 'netflix', categoria_chave: 'lazer' },
  { termo: 'spotify', categoria_chave: 'lazer' },
  { termo: 'aluguel', categoria_chave: 'moradia' },
  { termo: 'energia', categoria_chave: 'moradia' },
  { termo: 'saneamento', categoria_chave: 'moradia' },
];

/** Popula o catálogo padrão de categorias e regras iniciais para um tenant novo. Idempotente. */
export async function seedCategoriasPadrao(tenantId: string): Promise<void> {
  for (const c of CATEGORIAS_PADRAO) {
    await pool.query(
      `INSERT INTO categorias (tenant_id, chave, nome, cor) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, chave) DO NOTHING`,
      [tenantId, c.chave, c.nome, c.cor]
    );
  }
  for (const r of REGRAS_PADRAO) {
    await pool.query(
      `INSERT INTO regras_categorizacao (tenant_id, termo, categoria_chave) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, termo) DO NOTHING`,
      [tenantId, r.termo, r.categoria_chave]
    );
  }
}
