import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { verificarJwtHs256 } from '../jwt';

const SEGREDO = 'segredo-de-teste-com-mais-de-vinte-chars';

function base64Url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function assinar(payload: Record<string, unknown>, segredo = SEGREDO, alg = 'HS256'): string {
  const header = base64Url({ alg, typ: 'JWT' });
  const body = base64Url(payload);
  const assinatura = createHmac('sha256', segredo).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${assinatura}`;
}

describe('verificarJwtHs256', () => {
  it('aceita um token válido e retorna o payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = assinar({ sub: 'user-1', email: 'a@b.com', exp });
    const payload = verificarJwtHs256(token, SEGREDO);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@b.com');
  });

  it('rejeita token com assinatura de outro segredo', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = assinar({ sub: 'user-1', exp }, 'outro-segredo-bem-diferente-aqui');
    expect(() => verificarJwtHs256(token, SEGREDO)).toThrow('Assinatura do token inválida');
  });

  it('rejeita token expirado', () => {
    const exp = Math.floor(Date.now() / 1000) - 3600;
    const token = assinar({ sub: 'user-1', exp });
    expect(() => verificarJwtHs256(token, SEGREDO)).toThrow('Sessão expirada');
  });

  it('rejeita algoritmo diferente de HS256 (ex.: "none")', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = assinar({ sub: 'user-1', exp }, SEGREDO, 'none');
    expect(() => verificarJwtHs256(token, SEGREDO)).toThrow('Algoritmo de token não suportado');
  });

  it('rejeita token malformado (menos de 3 partes)', () => {
    expect(() => verificarJwtHs256('abc.def', SEGREDO)).toThrow('Token malformado');
  });

  it('rejeita token sem sub', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = assinar({ exp });
    expect(() => verificarJwtHs256(token, SEGREDO)).toThrow('sem identificação de usuário');
  });
});
