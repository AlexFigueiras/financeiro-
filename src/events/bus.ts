/**
 * Event bus in-process (fase 1 da estratégia de evolução do §6.2).
 * O contrato versionado do registry permite trocar por SQS/Kafka/NATS na
 * fase 2 sem tocar nos domínios: apenas este arquivo muda.
 *
 * Semântica: publish valida o payload (fail-fast) e executa os assinantes em
 * sequência; falha de assinante é logada e NÃO propaga ao publicador
 * (um consumidor quebrado não pode derrubar o fluxo de negócio).
 */
import { NomeEvento, PayloadDe, registroEventos } from './registry';
import { loggerDe } from '../shared/observability/logger';
import { incrementar } from '../shared/observability/metrics';

const log = loggerDe('events');

type Handler<N extends NomeEvento> = (payload: PayloadDe<N>) => Promise<void> | void;

const assinantes = new Map<NomeEvento, Handler<NomeEvento>[]>();

export function assinar<N extends NomeEvento>(nome: N, handler: Handler<N>): void {
  const lista = assinantes.get(nome) ?? [];
  lista.push(handler as Handler<NomeEvento>);
  assinantes.set(nome, lista);
}

export async function publicar<N extends NomeEvento>(
  nome: N,
  payload: PayloadDe<N>
): Promise<void> {
  const parsed = registroEventos[nome].safeParse(payload);
  if (!parsed.success) {
    // Contrato violado é bug do publicador: falha alto e cedo.
    throw new Error(`Evento ${nome} com payload inválido: ${parsed.error.message}`);
  }

  incrementar('eventos_publicados_total', { evento: nome });
  log.info({ evento: nome, payload }, 'evento publicado');

  for (const handler of assinantes.get(nome) ?? []) {
    try {
      await handler(parsed.data as PayloadDe<N>);
    } catch (err) {
      incrementar('eventos_falhas_consumo_total', { evento: nome });
      log.error({ evento: nome, err: (err as Error).message }, 'assinante de evento falhou');
    }
  }
}

/** Usado apenas em testes para isolar cenários. */
export function limparAssinantes(): void {
  assinantes.clear();
}
