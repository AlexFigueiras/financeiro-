/** MÓDULO PURO — reduz o HTML bruto da página da SEFAZ a texto plano antes de enviar ao Gemini. Zero I/O. */

const LIMITE_CHARS = 60_000;

const ENTIDADES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

export function htmlParaTexto(html: string): string {
  const semScriptEstiloComentario = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const comQuebras = semScriptEstiloComentario
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const decodificado = comQuebras.replace(
    /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g,
    (entidade) => ENTIDADES[entidade] ?? entidade
  );

  const colapsado = decodificado
    .split('\n')
    .map((linha) => linha.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  return colapsado.slice(0, LIMITE_CHARS);
}
