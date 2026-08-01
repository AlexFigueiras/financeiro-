/** MÓDULO PURO — interpretação e validação de URL de QR Code de NFC-e. Zero I/O. */
import { AppError } from '../../../shared/errors/app-error';

const UFS_VALIDAS = new Set([
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg',
  'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to',
]);

/**
 * Allowlist de host — guard de SSRF (AGENTS §5, menor privilégio): o servidor passa a
 * buscar uma URL vinda do usuário, então só domínios oficiais da SEFAZ são aceitos
 * (qualquer subdomínio de fazenda.<uf>.gov.br / sefaz.<uf>.gov.br, ex.: nfce.fazenda.sp.gov.br).
 */
export function hostPermitidoNfce(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const m = host.match(/^(?:[a-z0-9-]+\.)*(fazenda|sefaz)\.([a-z]{2})\.gov\.br$/);
  return !!m && UFS_VALIDAS.has(m[2]);
}

export interface UrlNfceInterpretada {
  url: string;
  chaveAcesso: string;
}

function extrairChaveAcesso(parsed: URL): string | null {
  // QR Code versão 2.0: ?p=<chave44>|<versao>|<tpAmb>|<hash...>
  const p = parsed.searchParams.get('p');
  if (p) {
    const chave = p.split('|')[0];
    if (/^\d{44}$/.test(chave)) return chave;
  }

  // QR Code versão 1.0: ?chNFe=<chave44>&...
  const chNFe = parsed.searchParams.get('chNFe');
  if (chNFe && /^\d{44}$/.test(chNFe)) return chNFe;

  // Fallback: primeiro bloco de 44 dígitos consecutivos em qualquer lugar da URL.
  const fallback = parsed.toString().match(/\d{44}/);
  return fallback ? fallback[0] : null;
}

export function interpretarUrlNfce(bruto: string): UrlNfceInterpretada {
  const valor = typeof bruto === 'string' ? bruto.trim() : '';
  if (!valor) {
    throw new AppError('URL do QR Code é obrigatória.', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(valor);
  } catch {
    throw new AppError('URL do QR Code inválida.', 400);
  }

  if (parsed.protocol !== 'https:') {
    throw new AppError('Apenas URLs https são aceitas.', 400);
  }
  if (!hostPermitidoNfce(parsed.hostname)) {
    throw new AppError(
      `"${parsed.hostname}" não é um domínio conhecido da SEFAZ. Aponte a câmera para o QR Code ` +
        'oficial impresso no cupom da NFC-e.',
      400
    );
  }

  const chaveAcesso = extrairChaveAcesso(parsed);
  if (!chaveAcesso) {
    throw new AppError('Não foi possível localizar a chave de acesso (44 dígitos) nesta URL.', 400);
  }

  return { url: parsed.toString(), chaveAcesso };
}
