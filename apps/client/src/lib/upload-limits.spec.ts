import api, { uploadFile } from './api';
import {
  IMAGE_LIMITS_MB,
  MIB,
  fileSizeWarning,
  formatMb,
  parseLimitMb,
  submissionLimit,
  uploadLimit,
} from './upload-limits';

/**
 * El aviso de tamaño que se da antes de subir.
 *
 * Tiene que coincidir con lo que hará el servidor: el mismo límite y el mismo mensaje. Si
 * avisara de menos, el alumno esperaría a subir el archivo entero para leer el rechazo; si
 * avisara de más, no podría entregar algo que la tarea sí admite.
 */
describe('límite de la entrega de una tarea', () => {
  it('usa el límite propio de la tarea aunque supere el general de la sede', () => {
    expect(submissionLimit(1024, 10, 2048)).toEqual({
      maxMb: 1024,
      message: 'El archivo supera el límite de 1 GB de esta tarea.',
    });
  });

  it('sin límite propio usa el general de la sede', () => {
    expect(submissionLimit(null, 10, 2048)).toEqual({
      maxMb: 10,
      message: 'El archivo supera el límite de 10 MB de esta tarea.',
    });
  });

  it('nunca pasa del tope técnico del servidor', () => {
    expect(submissionLimit(3000, 10, 2048)?.maxMb).toBe(2048);
  });

  it('no inventa un límite mientras no ha llegado la configuración de la sede', () => {
    expect(submissionLimit(null, undefined, undefined)).toBeNull();
  });
});

describe('otros límites', () => {
  it('el material de curso usa el general de la sede', () => {
    expect(uploadLimit('recursos', 25, 2048)?.message).toBe(
      'El archivo supera el límite de 25 MB configurado para la sede.',
    );
  });

  it('las imágenes tienen su tope fijo, el mismo que en el servidor', () => {
    expect(uploadLimit('firmas')).toEqual({ maxMb: 2, message: 'La imagen supera el límite de 2 MB.' });
    expect(uploadLimit('fondos')?.maxMb).toBe(IMAGE_LIMITS_MB.fondos);
    expect(uploadLimit('logos', 500, 2048)?.maxMb).toBe(5);
  });
});

describe('fileSizeWarning', () => {
  const limit = submissionLimit(10, 50, 2048);

  it('deja pasar un archivo que mide exactamente el límite', () => {
    expect(fileSizeWarning({ size: 10 * MIB }, limit)).toBeNull();
  });

  it('avisa con el mensaje del servidor en cuanto lo supera un byte', () => {
    expect(fileSizeWarning({ size: 10 * MIB + 1 }, limit)).toBe('El archivo supera el límite de 10 MB de esta tarea.');
  });

  it('sin límite conocido no avisa: decide el servidor', () => {
    expect(fileSizeWarning({ size: 5000 * MIB }, null)).toBeNull();
  });
});

describe('uploadFile', () => {
  it('rechaza el archivo que supera el límite sin enviar nada', async () => {
    const post = jest.spyOn(api, 'post');
    const file = new File([new Uint8Array(MIB + 1)], 'informe.pdf');

    await expect(
      uploadFile('/assessments/assignments/tarea/submissions', file, { limit: submissionLimit(1, 10, 2048) }),
    ).rejects.toThrow('El archivo supera el límite de 1 MB de esta tarea.');
    expect(post).not.toHaveBeenCalled();

    post.mockRestore();
  });

  it('no pone tiempo máximo a la subida', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    const file = new File([new Uint8Array(10)], 'informe.pdf');

    await uploadFile('/storage/upload?folder=recursos', file, { limit: uploadLimit('recursos', 10, 2048) });

    expect(post).toHaveBeenCalledWith(
      '/storage/upload?folder=recursos',
      expect.any(FormData),
      expect.objectContaining({ timeout: 0 }),
    );
    post.mockRestore();
  });
});

describe('parseLimitMb', () => {
  it('acepta un entero entre 1 y el tope técnico', () => {
    expect(parseLimitMb('1024', 2048)).toEqual({ value: 1024, error: null });
    expect(parseLimitMb('2048', 2048)).toEqual({ value: 2048, error: null });
  });

  it('en una tarea, vacío significa usar el límite general de la sede', () => {
    expect(parseLimitMb('  ', 2048)).toEqual({ value: null, error: null });
  });

  it('en la sede es obligatorio', () => {
    expect(parseLimitMb('', 2048, true).error).toBe('El límite debe ser un número entero entre 1 y 2048 MB.');
  });

  it.each(['0', '2049', '1.5', '-3', 'diez'])('rechaza «%s» diciendo el rango admitido', (text) => {
    expect(parseLimitMb(text, 2048)).toEqual({
      value: null,
      error: 'El límite debe ser un número entero entre 1 y 2048 MB.',
    });
  });
});

describe('formatMb', () => {
  it('expresa en GB los múltiplos exactos y en MB lo demás', () => {
    expect(formatMb(10)).toBe('10 MB');
    expect(formatMb(1024)).toBe('1 GB');
    expect(formatMb(1500)).toBe('1500 MB');
  });
});
