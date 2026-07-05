import { createHmac, generateKeyPairSync, sign, KeyObject } from 'crypto';
import { describe, expect, it } from 'vitest';
import { extrairAlgKid, verificarJwtEs256, verificarJwtHs256 } from '../jwt';

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

describe('verificarJwtEs256', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

  function assinarEs256(payload: Record<string, unknown>, chave: KeyObject = privateKey): string {
    const header = base64Url({ alg: 'ES256', typ: 'JWT', kid: 'kid-teste' });
    const body = base64Url(payload);
    const assinatura = sign('sha256', Buffer.from(`${header}.${body}`), {
      key: chave,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
    return `${header}.${body}.${assinatura}`;
  }

  it('aceita um token válido e retorna o payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = assinarEs256({ sub: 'user-2', email: 'c@d.com', exp });
    const payload = verificarJwtEs256(token, publicKey);
    expect(payload.sub).toBe('user-2');
    expect(payload.email).toBe('c@d.com');
  });

  it('rejeita token assinado por outra chave', () => {
    const { privateKey: outraChave } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = assinarEs256({ sub: 'user-2', exp }, outraChave);
    expect(() => verificarJwtEs256(token, publicKey)).toThrow('Assinatura do token inválida');
  });

  it('rejeita token expirado', () => {
    const exp = Math.floor(Date.now() / 1000) - 3600;
    const token = assinarEs256({ sub: 'user-2', exp });
    expect(() => verificarJwtEs256(token, publicKey)).toThrow('Sessão expirada');
  });

  it('rejeita token HS256 no verificador ES256 (confusão de algoritmo)', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = assinar({ sub: 'user-2', exp });
    expect(() => verificarJwtEs256(token, publicKey)).toThrow('Algoritmo de token não suportado');
  });
});

describe('extrairAlgKid', () => {
  it('retorna alg e kid do header sem validar assinatura', () => {
    const header = base64Url({ alg: 'ES256', kid: 'abc-123', typ: 'JWT' });
    const token = `${header}.${base64Url({ sub: 'x' })}.assinatura-qualquer`;
    expect(extrairAlgKid(token)).toEqual({ alg: 'ES256', kid: 'abc-123' });
  });

  it('rejeita token malformado', () => {
    expect(() => extrairAlgKid('abc.def')).toThrow('Token malformado');
  });
});
