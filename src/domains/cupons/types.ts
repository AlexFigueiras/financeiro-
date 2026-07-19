export interface ItemGemini {
  produto: string;
  qtd: number;
  valor_uni: number;
  subtotal: number;
  categoria?: string;
}

export interface CupomGemini {
  estabelecimento: string;
  data: string;
  valor_total: number;
  itens: ItemGemini[];
}

export interface ResultadoCupom {
  cupomId: number;
  estabelecimento: string;
  dataEmissao: string;
  valorTotal: number;
  itens: number;
}

export interface ItemCupom {
  id: number;
  cupomId: number;
  nomeProduto: string;
  quantidade: number;
  precoUnitario: number;
  valorTotal: number;
  categoria: string;
}

export interface CupomComItens {
  id: number;
  dataEmissao: string;
  valorTotal: number;
  estabelecimento: string;
  itens: ItemCupom[];
}

/** Registro de um envio anterior dos mesmos arquivos — base do aviso de reenvio duplicado. */
export interface ArquivoImportado {
  nomeArquivo: string;
  enviadoEm: Date;
}

/** Campos editáveis de um item de cupom — edição parcial (nunca inclui categoria, que tem fluxo próprio). */
export interface DadosItemCupom {
  nomeProduto?: string;
  quantidade?: number;
  precoUnitario?: number;
  valorTotal?: number;
}
