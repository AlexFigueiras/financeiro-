import { generateKeyPairSync } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({ env: { supabaseUrl: 'https://exemplo.supabase.co' } }));

import { limparCacheJwks, obterChavePublica } from '../jwks';

const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'chave-1', use: 'sig', alg: 'ES256' };

function fetchComChaves() {
  return vi.fn(async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }));
}

beforeEach(() => limparCacheJwks());
afterEach(() => vi.unstubAllGlobals());

describe('obterChavePublica', () => {
  it('busca o JWKS e devolve a chave pública do kid', async () => {
    const fetchMock = fetchComChaves();
    vi.stubGlobal('fetch', fetchMock);
    const chave = await obterChavePublica('chave-1');
    expect(chave.asymmetricKeyType).toBe('ec');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exemplo.supabase.co/auth/v1/.well-known/jwks.json',
      expect.anything()
    );
  });

  it('usa o cache em chamadas seguintes (uma busca só)', async () => {
    const fetchMock = fetchComChaves();
    vi.stubGlobal('fetch', fetchMock);
    await obterChavePublica('chave-1');
    await obterChavePublica('chave-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejeita kid desconhecido com 401 sem refetch imediato', async () => {
    const fetchMock = fetchComChaves();
    vi.stubGlobal('fetch', fetchMock);
    await expect(obterChavePublica('kid-inexistente')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falha fechado (503) quando o endpoint está inacessível', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('rede fora');
      })
    );
    await expect(obterChavePublica('chave-1')).rejects.toMatchObject({ status: 503 });
  });

  it('falha fechado (503) quando o endpoint responde erro HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(obterChavePublica('chave-1')).rejects.toMatchObject({ status: 503 });
  });

  it('rejeita token sem kid com 401', async () => {
    vi.stubGlobal('fetch', fetchComChaves());
    await expect(obterChavePublica(undefined)).rejects.toMatchObject({ status: 401 });
  });
});
