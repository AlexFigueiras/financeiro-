export interface ResumoMensal {
  mes: string;
  saldoConsolidado: number;
  totalGanhosMes: number;
  totalGastosMes: number;
  balancoLiquidoMes: number;
}

export interface FluxoDiario {
  mes: string;
  dias: Array<{ dia: string; ganhos: number; gastos: number }>;
}

export interface GastosPorCategoria {
  mes: string;
  categorias: Array<{ categoria: string; total: number }>;
  gastosNaoDetalhados: number;
}
