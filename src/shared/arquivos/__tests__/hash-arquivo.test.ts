import { describe, expect, it } from 'vitest';
import { sha256Hex, hashConjuntoArquivos } from '../hash-arquivo';

describe('sha256Hex', () => {
  it('gera o mesmo hash para o mesmo conteúdo', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(sha256Hex(Buffer.from('abc')));
  });

  it('gera hashes diferentes para conteúdos diferentes', () => {
    expect(sha256Hex(Buffer.from('abc'))).not.toBe(sha256Hex(Buffer.from('abd')));
  });
});

describe('hashConjuntoArquivos', () => {
  it('é estável independente da ordem dos arquivos', () => {
    const a = Buffer.from('foto-1');
    const b = Buffer.from('foto-2');
    expect(hashConjuntoArquivos([a, b])).toBe(hashConjuntoArquivos([b, a]));
  });

  it('muda se o conjunto de arquivos muda', () => {
    const a = Buffer.from('foto-1');
    const b = Buffer.from('foto-2');
    const c = Buffer.from('foto-3');
    expect(hashConjuntoArquivos([a, b])).not.toBe(hashConjuntoArquivos([a, c]));
  });
});
