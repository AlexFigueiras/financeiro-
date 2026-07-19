export interface TransacaoOfx {
  data: Date;
  valor: number;
  descricao: string;
  fitid: string | null;
}

export interface ResultadoImportExtrato {
  totalNoArquivo: number;
  importadas: number;
  ignoradasDuplicadas: number;
}

/** Registro de um arquivo já importado antes — base do aviso de reenvio duplicado. */
export interface ArquivoImportado {
  nomeArquivo: string;
  enviadoEm: Date;
}
