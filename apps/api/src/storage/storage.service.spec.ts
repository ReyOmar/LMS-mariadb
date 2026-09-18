import { ConfigService } from '@nestjs/config';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { StorageService } from './storage.service';
import { esClavePublica } from './storage.carpetas';

/** Configuración mínima: sin R2, para que el servicio use el disco local. */
function crearServicio(valores: Record<string, string> = {}): StorageService {
  const config = {
    get: (clave: string) => ({ JWT_SECRET: 'secreto-de-pruebas-suficientemente-largo', ...valores })[clave],
  } as unknown as ConfigService;

  return new StorageService(config);
}

describe('StorageService', () => {
  describe('clasificación de archivos', () => {
    it('trata como público sólo el material de marca', () => {
      expect(esClavePublica('logos/abc.png')).toBe(true);
      expect(esClavePublica('portadas/abc.png')).toBe(true);
      expect(esClavePublica('fondos/abc.jpg')).toBe(true);
      expect(esClavePublica('avatars/abc.png')).toBe(true);
    });

    it('trata como reservado todo lo que documenta a una persona', () => {
      // Entregas, certificados y firmas identifican a alguien: no pueden quedar accesibles
      // por conocer la URL.
      expect(esClavePublica('entregas/abc.pdf')).toBe(false);
      expect(esClavePublica('certificados/abc.pdf')).toBe(false);
      expect(esClavePublica('firmas/abc.png')).toBe(false);
      expect(esClavePublica('recursos/abc.pdf')).toBe(false);
    });
  });

  describe('URLs de descarga', () => {
    it('sirve el material de marca sin firma', () => {
      const url = crearServicio().urlDeDescarga('logos/marca.png');

      expect(url).toBe('/api/storage/download/logos/marca.png');
      expect(url).not.toContain('sig=');
    });

    it('firma el material reservado y le pone caducidad', () => {
      const url = crearServicio().urlDeDescarga('entregas/tarea.pdf');

      expect(url).toContain('/api/storage/download/entregas/tarea.pdf');
      expect(url).toMatch(/exp=\d+/);
      expect(url).toMatch(/sig=[0-9a-f]{64}/);
    });
  });

  describe('verificación de la firma', () => {
    const servicio = crearServicio();

    /** Extrae los parámetros de una URL firmada. */
    const partes = (url: string) => {
      const query = new URLSearchParams(url.split('?')[1]);
      return { exp: query.get('exp') ?? undefined, sig: query.get('sig') ?? undefined };
    };

    it('acepta una firma recién emitida', () => {
      const { exp, sig } = partes(servicio.urlDeDescarga('entregas/tarea.pdf'));

      expect(servicio.firmaValida('entregas/tarea.pdf', exp, sig)).toBe(true);
    });

    it('rechaza la firma de otro archivo', () => {
      // Sin esta comprobación, una URL legítima valdría para descargar cualquier cosa.
      const { exp, sig } = partes(servicio.urlDeDescarga('entregas/mia.pdf'));

      expect(servicio.firmaValida('entregas/de-otro.pdf', exp, sig)).toBe(false);
    });

    it('rechaza una firma caducada', () => {
      const { sig } = partes(servicio.urlDeDescarga('entregas/tarea.pdf'));
      const ayer = String(Math.floor(Date.now() / 1000) - 60);

      expect(servicio.firmaValida('entregas/tarea.pdf', ayer, sig)).toBe(false);
    });

    it('rechaza una caducidad alargada a mano', () => {
      const { sig } = partes(servicio.urlDeDescarga('entregas/tarea.pdf'));
      const dentroDeUnAno = String(Math.floor(Date.now() / 1000) + 31_536_000);

      // La caducidad forma parte de lo firmado, así que cambiarla invalida la firma.
      expect(servicio.firmaValida('entregas/tarea.pdf', dentroDeUnAno, sig)).toBe(false);
    });

    it('rechaza una firma ausente o manipulada', () => {
      const { exp } = partes(servicio.urlDeDescarga('entregas/tarea.pdf'));

      expect(servicio.firmaValida('entregas/tarea.pdf', exp, undefined)).toBe(false);
      expect(servicio.firmaValida('entregas/tarea.pdf', exp, 'a'.repeat(64))).toBe(false);
      expect(servicio.firmaValida('entregas/tarea.pdf', undefined, 'x')).toBe(false);
    });

    it('no valida firmas emitidas con otro secreto', () => {
      const otroServicio = crearServicio({ STORAGE_SECRET: 'otro-secreto-distinto-y-largo' });
      const { exp, sig } = partes(otroServicio.urlDeDescarga('entregas/tarea.pdf'));

      expect(servicio.firmaValida('entregas/tarea.pdf', exp, sig)).toBe(false);
    });
  });

  describe('subida de archivos', () => {
    const servicio = crearServicio();
    const pdf = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.alloc(100)]);

    it('rechaza una extensión no admitida', async () => {
      await expect(servicio.uploadFromBuffer(pdf, 'programa.exe', 'recursos')).rejects.toThrow(BadRequestException);
    });

    it('rechaza un archivo cuyo contenido no corresponde a su extensión', async () => {
      // Un ejecutable renombrado a .pdf: la extensión pasa, la firma del archivo no.
      const falso = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(100)]);

      await expect(servicio.uploadFromBuffer(falso, 'informe.pdf', 'recursos')).rejects.toThrow(/no corresponde/);
    });

    it('rechaza un archivo que supera el límite indicado', async () => {
      const grande = Buffer.concat([pdf, Buffer.alloc(2 * 1024 * 1024)]);

      await expect(servicio.uploadFromBuffer(grande, 'informe.pdf', 'entregas', 1024 * 1024)).rejects.toThrow(
        PayloadTooLargeException,
      );
    });
  });
});
