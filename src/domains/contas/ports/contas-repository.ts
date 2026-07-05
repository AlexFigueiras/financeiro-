import { PoolClient } from 'pg';
import { ContaBancaria, TipoConta } from '../types';

export interface ContasRepository {
  listar(tenantId: string): Promise<ContaBancaria[]>;
  criar(tenantId: string, nome: string, tipo: TipoConta): Promise<ContaBancaria | null>;
  existe(tenantId: string, contaId: number, client?: PoolClient): Promise<boolean>;
  buscarIdPorNome(tenantId: string, nome: string): Promise<number | null>;
  /** null quando o novo nome colide com outra conta do mesmo tenant. */
  atualizar(tenantId: string, contaId: number, nome: string, tipo: TipoConta): Promise<ContaBancaria | null>;
  contarTransacoes(tenantId: string, contaId: number): Promise<number>;
  excluir(tenantId: string, contaId: number): Promise<void>;
}
