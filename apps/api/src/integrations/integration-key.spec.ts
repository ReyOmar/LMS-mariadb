import { hashKey, issueKey } from './integration-key';

describe('claves de integración', () => {
  it('cada clave es distinta, empieza por lms_ y no se adivina por su comienzo', () => {
    const first = issueKey();
    const second = issueKey();

    expect(first.key).not.toBe(second.key);
    expect(first.key).toMatch(/^lms_[A-Za-z0-9_-]{43}$/);
    expect(first.prefix).toBe(first.key.slice(0, 12));
  });

  it('se guarda su resumen, que es siempre el mismo para la misma clave y nunca la clave', () => {
    const { key, hash } = issueKey();

    expect(hash).toBe(hashKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key.slice(4));
  });
});
