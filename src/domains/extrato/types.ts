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
