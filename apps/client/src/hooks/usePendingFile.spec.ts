import { AxiosError } from 'axios';
import { pendingAfterSave, saveWithUpload } from './usePendingFile';

/**
 * Un archivo se sube justo antes de guardar la fila que lo usa. Si ese guardado falla, la subida
 * no la usa nadie y se retira: no queda en el disco un archivo sin dueño.
 */
describe('saveWithUpload', () => {
  const upload = async () => 'portadas/nueva.png';

  it('guarda con la clave de la subida y no retira nada', async () => {
    const discard = jest.fn(async () => undefined);
    const save = jest.fn(async (key: string) => `curso con ${key}`);

    await expect(saveWithUpload(upload, save, discard)).resolves.toBe('curso con portadas/nueva.png');
    expect(discard).not.toHaveBeenCalled();
  });

  it('si el guardado falla, retira la subida y deja pasar el error', async () => {
    const discard = jest.fn(async () => undefined);
    const failingSave = async () => {
      throw new Error('El curso está publicado');
    };

    await expect(saveWithUpload(upload, failingSave, discard)).rejects.toThrow('El curso está publicado');
    expect(discard).toHaveBeenCalledWith('portadas/nueva.png');
  });

  it('si el guardado se queda sin respuesta, no retira la subida que el servidor aún puede usar', async () => {
    const discard = jest.fn(async () => undefined);
    const timedOutSave = async () => {
      throw new AxiosError('timeout of 30000ms exceeded', AxiosError.ECONNABORTED);
    };

    await expect(saveWithUpload(upload, timedOutSave, discard)).rejects.toThrow('timeout');
    expect(discard).not.toHaveBeenCalled();
  });

  it('si la subida falla, no hay nada que guardar ni que retirar', async () => {
    const discard = jest.fn(async () => undefined);
    const save = jest.fn(async () => undefined);
    const failingUpload = async (): Promise<string> => {
      throw new Error('Sin espacio');
    };

    await expect(saveWithUpload(failingUpload, save, discard)).rejects.toThrow('Sin espacio');
    expect(save).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });
});

describe('pendingAfterSave', () => {
  const uploaded = { name: 'firma.png' };

  it('al guardarse, el archivo subido deja de estar pendiente', () => {
    expect(pendingAfterSave(uploaded, uploaded)).toBeNull();
  });

  it('otro elegido mientras se subía sigue pendiente, aunque se llame igual', () => {
    const chosenLater = { name: 'firma.png' };

    expect(pendingAfterSave(chosenLater, uploaded)).toBe(chosenLater);
  });
});
