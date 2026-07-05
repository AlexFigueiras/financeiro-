import { types } from 'pg';
import { describe, expect, it } from 'vitest';
import '../pool';

describe('parser de tipo BIGINT (OID 20)', () => {
  it('devolve number em vez do string default do driver', () => {
    const parser = types.getTypeParser(20);
    expect(parser('42')).toBe(42);
    expect(typeof parser('42')).toBe('number');
  });
});
