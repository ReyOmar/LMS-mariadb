import {
  DEFAULT_UPLOAD_CEILING_MB,
  MAX_UPLOAD_CEILING_MB,
  MIB,
  formatMb,
  readUploadCeiling,
  uploadLimit,
} from './upload-limits';

/**
 * Qué límite se aplica a cada subida y cómo se explica al rechazarla.
 *
 * Lo que se defiende: que una tarea de 1 GB admita 1 GB y una de 10 MB sólo 10 MB, que
 * nada supere el tope técnico y que el mensaje diga el límite que de verdad se aplicó.
 */
describe('tope técnico (MAX_UPLOAD_MB)', () => {
  it('sin definir, admite 2 GB', () => {
    expect(readUploadCeiling(undefined)).toEqual({ mb: DEFAULT_UPLOAD_CEILING_MB, warning: null });
    expect(readUploadCeiling('  ')).toEqual({ mb: DEFAULT_UPLOAD_CEILING_MB, warning: null });
    expect(DEFAULT_UPLOAD_CEILING_MB).toBe(2048);
  });

  it('respeta un valor válido', () => {
    expect(readUploadCeiling('1024')).toEqual({ mb: 1024, warning: null });
  });

  it.each(['2GB', '0', '-5', '1.5', 'abc'])('ignora con aviso el valor no válido «%s»', (raw) => {
    const { mb, warning } = readUploadCeiling(raw);

    expect(mb).toBe(DEFAULT_UPLOAD_CEILING_MB);
    expect(warning).toMatch(/MAX_UPLOAD_MB/);
  });

  it('no pasa del máximo que R2 admite en una sola subida', () => {
    const { mb, warning } = readUploadCeiling('100000');

    expect(mb).toBe(MAX_UPLOAD_CEILING_MB);
    expect(warning).toMatch(/supera el máximo/);
  });
});

describe('límite de cada subida', () => {
  const CEILING = 2048;

  it('una tarea de 10 MB admite exactamente 10 MB', () => {
    const limit = uploadLimit('entregas', 10, CEILING);

    expect(limit.mb).toBe(10);
    expect(limit.bytes).toBe(10 * MIB);
    expect(limit.message).toBe('El archivo supera el límite de 10 MB de esta tarea.');
  });

  it('una tarea de 1 GB admite 1 GB, por encima del límite general de la sede', () => {
    const limit = uploadLimit('entregas', 1024, CEILING);

    expect(limit.bytes).toBe(1024 * MIB);
    expect(limit.message).toBe('El archivo supera el límite de 1 GB de esta tarea.');
  });

  it('recorta al tope técnico un límite guardado antes de bajarlo, y lo dice', () => {
    const limit = uploadLimit('entregas', 3000, CEILING);

    expect(limit.mb).toBe(CEILING);
    expect(limit.message).toBe('El archivo supera el límite de 2 GB de esta tarea.');
  });

  it('el material de curso usa el límite general de la sede', () => {
    expect(uploadLimit('recursos', 25, CEILING).message).toBe(
      'El archivo supera el límite de 25 MB configurado para la sede.',
    );
  });

  it.each([
    ['logos', 5],
    ['portadas', 5],
    ['fondos', 10],
    ['avatars', 5],
    ['firmas', 2],
  ] as const)('las imágenes de %s tienen un tope fijo de %i MB aunque la sede admita más', (folder, mb) => {
    const limit = uploadLimit(folder, 500, CEILING);

    expect(limit.mb).toBe(mb);
    expect(limit.message).toBe(`La imagen supera el límite de ${mb} MB.`);
  });

  it('sin límite configurado rige el tope técnico', () => {
    const limit = uploadLimit(undefined, undefined, CEILING);

    expect(limit.bytes).toBe(CEILING * MIB);
    expect(limit.message).toBe('El archivo supera el límite de 2 GB que admite la plataforma.');
  });

  it('ignora un límite configurado que no sea positivo', () => {
    expect(uploadLimit('entregas', 0, CEILING).mb).toBe(CEILING);
    expect(uploadLimit('entregas', null, CEILING).mb).toBe(CEILING);
  });
});

describe('formatMb', () => {
  it('expresa en GB los múltiplos exactos y en MB lo demás', () => {
    expect(formatMb(10)).toBe('10 MB');
    expect(formatMb(1024)).toBe('1 GB');
    expect(formatMb(2048)).toBe('2 GB');
    expect(formatMb(1500)).toBe('1500 MB');
  });
});
