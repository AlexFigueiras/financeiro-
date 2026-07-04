import { PoolClient } from 'pg';
import { ContaBancaria, TipoConta } from '../types';

export interface ContasRepository {
  listar(tenantId: string): Promise<ContaBancaria[]>;
  criar(tenantId: string, nome: string, tipo: TipoConta): Promise<ContaBancaria | null>;
  existe(tenantId: string, contaId: number, client?: PoolClient): Promise<boolean>;
  buscarIdPorNome(tenantId: string, nome: string): Promise<number | null>;
}
