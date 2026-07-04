/**
 * MÓDULO PURO — parser de arquivos OFX (Caixa Econômica). Zero I/O, zero
 * dependência de framework: testável em memória.
 *
 * Arquivos OFX de bancos brasileiros costumam vir em SGML (tags sem
 * fechamento) e charset latin-1 — bibliotecas XML estritas quebram com eles.
 * Este parser lê os blocos <STMTTRN> de forma tolerante, cobrindo tanto a
 * variante SGML (OFX 1.x) quanto a XML (OFX 2.x).
 */
import { createHash } from 'crypto';
import { AppError } from '../../../shared/errors/app-error';
import { TransacaoOfx } from '../types';

/** Extrai o valor de uma tag OFX (SGML ou XML) dentro de um bloco. */
function tagValue(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const match = block.match(re);
  return match ? match[1].trim() : null;
}

/**
 * Converte datas OFX (YYYYMMDD, YYYYMMDDHHMMSS, com [-3:BRT] etc.) em Date.
 * Sem indicação de fuso, assume America/Sao_Paulo (-03:00) — extratos da
 * Caixa são emitidos em horário de Brasília.
 */
export function parseOfxDate(raw: string): Date {
  const cleaned = raw.trim();
  const m = cleaned.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?(?:\.\d+)?(?:\[([+-]?\d+(?:\.\d+)?)(?::\w+)?\])?/);
  if (!m) throw new AppError(`Data OFX inválida: "${raw}"`, 422);
  const [, y, mo, d, h = '12', mi = '00', s = '00', tz] = m;
  const offsetHours = tz !== undefined ? parseFloat(tz) : -3;
  const sign = offsetHours < 0 ? '-' : '+';
  const abs = Math.abs(offsetHours);
  const offH = String(Math.trunc(abs)).padStart(2, '0');
  const offM = String(Math.round((abs - Math.trunc(abs)) * 60)).padStart(2, '0');
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${offH}:${offM}`;
  const date = new Date(iso);
  if (isNaN(date.getTime())) throw new AppError(`Data OFX inválida: "${raw}"`, 422);
  return date;
}

/** Converte "-1.234,56", "-1234.56" ou "-1234,56" em número. */
export function parseOfxAmount(raw: string): number {
  let cleaned = raw.trim().replace(/\s/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // formato brasileiro 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const value = Number(cleaned);
  if (isNaN(value)) throw new AppError(`Valor OFX inválido: "${raw}"`, 422);
  return Math.round(value * 100) / 100;
}

/** Faz o parse do conteúdo bruto de um arquivo OFX e retorna as transações. */
export function parseOfx(conteudo: string): TransacaoOfx[] {
  if (!/<OFX>/i.test(conteudo)) {
    throw new AppError('Arquivo não parece ser um OFX válido (tag <OFX> ausente).', 422);
  }
  const blocks = conteudo.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi) ?? [];
  if (blocks.length === 0) {
    throw new AppError('Nenhuma transação (<STMTTRN>) encontrada no arquivo OFX.', 422);
  }

  const transacoes: TransacaoOfx[] = [];
  for (const block of blocks) {
    const dtposted = tagValue(block, 'DTPOSTED');
    const trnamt = tagValue(block, 'TRNAMT');
    if (!dtposted || !trnamt) continue; // bloco truncado — ignora com segurança

    const memo = tagValue(block, 'MEMO') ?? tagValue(block, 'NAME') ?? 'Transação sem descrição';
    transacoes.push({
      data: parseOfxDate(dtposted),
      valor: parseOfxAmount(trnamt),
      descricao: memo,
      fitid: tagValue(block, 'FITID'),
    });
  }

  if (transacoes.length === 0) {
    throw new AppError('Arquivo OFX sem transações válidas (DTPOSTED/TRNAMT ausentes).', 422);
  }
  return transacoes;
}

/** Decide se o arquivo é um OFX (texto) analisando mime, extensão e conteúdo. */
export function pareceOfx(mimetype: string, nome: string, buffer: Buffer): boolean {
  if (/ofx/i.test(mimetype)) return true;
  if (/\.ofx$/i.test(nome)) return true;
  const head = buffer.subarray(0, 400).toString('latin1');
  return /<OFX>|OFXHEADER/i.test(head);
}

/** Detecta o charset (latin1/utf8) do header OFX 1.x da Caixa. */
export function detectarEncodingOfx(buffer: Buffer): BufferEncoding {
  const head = buffer.subarray(0, 400).toString('ascii');
  return /CHARSET:\s*1252|ENCODING:\s*USASCII/i.test(head) ? 'latin1' : 'utf8';
}

/** Hash antitransbordamento: data + valor + descricao (+ conta). Escopo por tenant é aplicado no repository (tenant_id, hash_ofx). */
export function hashOfx(t: TransacaoOfx, contaId: number): string {
  return createHash('sha256')
    .update(`${t.data.toISOString()}|${t.valor.toFixed(2)}|${t.descricao}|conta:${contaId}`)
    .digest('hex');
}
