/**
 * Identidade de arquivos enviados por upload, para detectar reenvio do mesmo
 * arquivo por conteúdo (não por nome — arquivo renomeado continua o mesmo).
 */
import { createHash } from 'crypto';

/** SHA-256 (hex) do conteúdo de um arquivo. */
export function sha256Hex(conteudo: Buffer): string {
  return createHash('sha256').update(conteudo).digest('hex');
}

/**
 * Hash estável de uma coleção de arquivos: sha256 dos hashes individuais
 * ordenados — a mesma coleção de fotos enviada em qualquer ordem gera o
 * mesmo hash (caso do cupom longo fotografado em partes).
 */
export function hashConjuntoArquivos(conteudos: Buffer[]): string {
  const hashes = conteudos.map(sha256Hex).sort();
  return sha256Hex(Buffer.from(hashes.join('|')));
}
