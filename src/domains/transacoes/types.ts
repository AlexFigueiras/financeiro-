export interface ItemCupomResumo {
  id: number;
  nome_produto: string;
  quantidade: number;
  preco_unitario: number;
  valor_total: number;
  categoria: string;
}

export interface TransacaoListada {
  id: number;
  data_transacao: string;
  descricao_bruta: string;
  valor: number;
  status_reconciliado: boolean;
  origem: string;
  cupom_id: number | null;
  categoria: string;
  conta_id: number;
  conta_nome: string;
  estabelecimento: string | null;
  cupom_data_emissao: string | null;
  itens_cupom: ItemCupomResumo[] | null;
}

export interface ListaTransacoes {
  pagina: number;
  limite: number;
  total: number;
  transacoes: TransacaoListada[];
}

export interface FiltroTransacoes {
  mes?: string;
  contaId?: number;
  pagina: number;
  limite: number;
}

/** Campos editáveis de um lançamento — usado tanto na criação manual quanto na edição parcial. */
export interface DadosTransacao {
  contaId: number;
  dataTransacao: string; // ISO 8601
  descricaoBruta: string;
  valor: number;
  categoria: string;
  cupomId?: number | null;
  statusReconciliado?: boolean;
}
