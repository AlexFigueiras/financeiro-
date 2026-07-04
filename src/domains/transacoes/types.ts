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
