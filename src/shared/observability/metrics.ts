/**
 * Métricas em memória (contadores e histogramas estilo Prometheus).
 * Em serverless cada instância mantém as suas; a exposição via /api/metrics
 * serve para diagnóstico. Quando um backend de métricas for plugado
 * (Prometheus/OTel), este módulo é a única costura a trocar.
 */

const contadores = new Map<string, number>();
const histogramas = new Map<string, number[]>();

function chave(nome: string, labels?: Record<string, string>): string {
  if (!labels) return nome;
  const pares = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`);
  return `${nome}{${pares.join(',')}}`;
}

export function incrementar(nome: string, labels?: Record<string, string>, valor = 1): void {
  const k = chave(nome, labels);
  contadores.set(k, (contadores.get(k) ?? 0) + valor);
}

export function observarDuracao(nome: string, ms: number, labels?: Record<string, string>): void {
  const k = chave(nome, labels);
  const arr = histogramas.get(k) ?? [];
  arr.push(ms);
  if (arr.length > 1000) arr.shift(); // janela deslizante — memória limitada
  histogramas.set(k, arr);
}

function percentil(valores: number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const idx = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, idx)];
}

/** Snapshot legível das métricas correntes desta instância. */
export function snapshot(): Record<string, unknown> {
  const counters: Record<string, number> = {};
  for (const [k, v] of contadores) counters[k] = v;
  const durations: Record<string, { count: number; p50: number; p95: number; max: number }> = {};
  for (const [k, arr] of histogramas) {
    durations[k] = {
      count: arr.length,
      p50: percentil(arr, 50),
      p95: percentil(arr, 95),
      max: Math.max(...arr),
    };
  }
  return { counters, durations };
}
