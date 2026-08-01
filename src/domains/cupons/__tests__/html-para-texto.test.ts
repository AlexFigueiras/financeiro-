import { describe, expect, it } from 'vitest';
import { htmlParaTexto } from '../domain/html-para-texto';

describe('htmlParaTexto', () => {
  it('remove tags <script> e <style> por completo (conteúdo incluso)', () => {
    const html = '<html><head><style>body{color:red}</style></head><body>' +
      '<script>alert("x")</script><p>Mercado X</p></body></html>';
    const texto = htmlParaTexto(html);
    expect(texto).not.toContain('color:red');
    expect(texto).not.toContain('alert');
    expect(texto).toContain('Mercado X');
  });

  it('remove comentários HTML', () => {
    const texto = htmlParaTexto('<p>Antes</p><!-- comentário oculto --><p>Depois</p>');
    expect(texto).not.toContain('comentário oculto');
    expect(texto).toContain('Antes');
    expect(texto).toContain('Depois');
  });

  it('decodifica entidades HTML básicas', () => {
    const texto = htmlParaTexto('<p>Arroz &amp; Feij&#39;ao &ndash;&nbsp;R$ 10,00</p>'.replace('&ndash;', '-'));
    expect(texto).toContain('Arroz & Feij\'ao');
    expect(texto).toContain('R$ 10,00');
  });

  it('converte quebras de linha/parágrafos em \\n e colapsa espaços repetidos', () => {
    const texto = htmlParaTexto('<tr><td>Item   1</td></tr><tr><td>Item 2</td></tr>');
    expect(texto).toBe('Item 1\nItem 2');
  });

  it('corta o texto em ~60000 caracteres', () => {
    const html = '<p>' + 'a'.repeat(100_000) + '</p>';
    const texto = htmlParaTexto(html);
    expect(texto.length).toBeLessThanOrEqual(60_000);
  });
});
