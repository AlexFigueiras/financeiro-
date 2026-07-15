export type TipoConta =
  | 'corrente'
  | 'poupanca'
  | 'pagamento'
  | 'carteira_digital'
  | 'vale_alimentacao'
  | 'vale_refeicao'
  | 'cartao_credito'
  | 'outro';

export const TIPOS_CONTA_VALIDOS: TipoConta[] = [
  'corrente',
  'poupanca',
  'pagamento',
  'carteira_digital',
  'vale_alimentacao',
  'vale_refeicao',
  'cartao_credito',
  'outro',
];

export interface ContaBancaria {
  id: number;
  nome: string;
  tipo: TipoConta;
  saldoAtual: number;
  atualizadoEm: string;
}
