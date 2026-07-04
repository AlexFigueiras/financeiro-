export type TipoConta = 'corrente' | 'poupanca' | 'pagamento' | 'carteira_digital' | 'outro';

export const TIPOS_CONTA_VALIDOS: TipoConta[] = [
  'corrente',
  'poupanca',
  'pagamento',
  'carteira_digital',
  'outro',
];

export interface ContaBancaria {
  id: number;
  nome: string;
  tipo: TipoConta;
  saldoAtual: number;
  atualizadoEm: string;
}
