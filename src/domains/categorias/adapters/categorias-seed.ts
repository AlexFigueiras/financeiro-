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
  { chave: 'outros', nome: 'Outros', cor: '#898781' },
];

/** Popula o catálogo padrão de categorias para um tenant novo. Idempotente. */
export async function seedCategoriasPadrao(tenantId: string): Promise<void> {
  for (const c of CATEGORIAS_PADRAO) {
    await pool.query(
      `INSERT INTO categorias (tenant_id, chave, nome, cor) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, chave) DO NOTHING`,
      [tenantId, c.chave, c.nome, c.cor]
    );
  }
}
