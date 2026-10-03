import { parseByteRange } from './byte-range';

describe('parseByteRange', () => {
  const SIZE = 1000;

  it('entiende un fragmento con principio y fin', () => {
    expect(parseByteRange('bytes=0-499', SIZE)).toEqual({ start: 0, end: 499 });
  });

  it('entiende «desde aquí hasta el final», que es lo que pide un vídeo al saltar', () => {
    expect(parseByteRange('bytes=600-', SIZE)).toEqual({ start: 600, end: 999 });
  });

  it('entiende «los últimos N bytes»', () => {
    expect(parseByteRange('bytes=-100', SIZE)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('recorta un final que pasa del archivo', () => {
    expect(parseByteRange('bytes=900-5000', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('declara insatisfacible un fragmento que empieza fuera del archivo', () => {
    expect(parseByteRange('bytes=1000-', SIZE)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=-0', SIZE)).toBe('unsatisfiable');
  });

  it.each([
    ['sin cabecera', undefined],
    ['otra unidad', 'items=0-10'],
    ['varios fragmentos', 'bytes=0-10,20-30'],
    ['un fin anterior al principio', 'bytes=500-100'],
    ['sin números', 'bytes=-'],
  ])('ignora %s y envía el archivo entero', (_case, header) => {
    expect(parseByteRange(header, SIZE)).toBeNull();
  });
});
