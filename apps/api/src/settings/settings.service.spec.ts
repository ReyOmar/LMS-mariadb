import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BASE_LEGAL_VERSION, SettingsService } from './settings.service';
import { uploadCeilingMb } from '../storage/upload-limits';

/**
 * Qué sale de la sede sin haber iniciado sesión.
 *
 * La portada y el acceso son anónimos, así que todo lo que devuelva esa ruta lo puede leer
 * cualquiera. Lo que se fija aquí es que la lista sea de lo que **se publica**, y que lo
 * demás no aparezca por mucho que crezca la tabla.
 */
describe('SettingsService — qué se publica sin sesión', () => {
  /** Una fila de configuración con lo público, lo interno y una columna inventada. */
  const row = {
    id: 1,
    country: 'COLOMBIA',
    platformName: 'PESV Education',
    logoUrl: 'logos/a.png',
    faviconUrl: null,
    loginBackgroundUrl: null,
    primaryColor: '#0F766E',
    secondaryColor: '#65a30d',
    font: 'Inter',
    borderRadius: 20,
    welcomeMessage: 'Bienvenido',
    maxFileMb: 10,
    landingHeroTitle1: 'Transporte',
    landingHeroTitle2: 'Seguro',
    landingHeroSubtitle: 'Sub',
    landingPhone: '600',
    landingPhoneSub: 'Lun a Vie',
    landingEmail: 'hola@pesv.com',
    landingEmailSub: 'Respuesta en 24h',
    landingOffice: 'Bogotá',
    landingOfficeSub: 'Calle 1',
    landingFooterText: 'Pie',
    legalTerms: 'Términos',
    legalPrivacy: 'Privacidad',
    legalData: 'Datos',
    timeZone: 'America/Bogota',

    // Nada de lo siguiente puede salir sin sesión.
    certCustomTitle: 'Certificado',
    certSubtitle: 'de aprovechamiento',
    certLegalText: 'Legal',
    certShowModules: true,
    certShowResources: true,
    certShowScore: true,
    certShowSignature: true,
    certShowEnrollmentDate: true,
    certValidityMonths: 24,
    updatedAt: new Date(),
    futureNewColumn: 'no debería salir',
  };

  function service() {
    const prisma = { countrySettings: { findUnique: async () => row } };
    return new SettingsService(prisma as never, {} as never, {} as never, {} as never);
  }

  it('devuelve lo que la portada necesita', async () => {
    const publicSettings = await service().getPublicSettings('COLOMBIA');

    expect(publicSettings).toMatchObject({
      country: 'COLOMBIA',
      platformName: 'PESV Education',
      primaryColor: '#0F766E',
      landingHeroTitle1: 'Transporte',
      legalTerms: 'Términos',
    });
  });

  it('publica el límite general de subida y el tope técnico, con los que se validan los formularios', async () => {
    const publicSettings = await service().getPublicSettings('COLOMBIA');

    expect(publicSettings.maxFileMb).toBe(10);
    expect(publicSettings.uploadCeilingMb).toBe(uploadCeilingMb());
  });

  it('publica la zona horaria de la sede, con la que se escriben las fechas', async () => {
    const publicSettings = await service().getPublicSettings('COLOMBIA');

    expect(publicSettings.timeZone).toBe('America/Bogota');
  });

  // Cada campo tiene que existir en la fila de prueba: si no, la prueba pasaría sin
  // comprobar nada.
  it.each(['certCustomTitle', 'certShowScore', 'certValidityMonths', 'futureNewColumn'])(
    'no publica %s',
    async (field) => {
      expect(row).toHaveProperty(field);

      const publicSettings = await service().getPublicSettings('COLOMBIA');

      expect(publicSettings).not.toHaveProperty(field);
    },
  );

  it('el servidor sí ve la fila entera: la usa para la hora de la sede y el certificado', async () => {
    const full = await service().getSettings('COLOMBIA');

    expect(full.timeZone).toBe('America/Bogota');
    expect(full.certValidityMonths).toBe(24);
  });
});

/**
 * Registro de las versiones de los textos legales.
 *
 * Es la prueba de lo que aceptó cada persona: el consentimiento guarda una versión, y esa
 * versión tiene que poder leerse después aunque la sede haya cambiado los textos. Las
 * pruebas usan una base en memoria que interpreta el `where`: si la consulta dejara de
 * filtrar por sede, la de aislamiento fallaría.
 */
describe('SettingsService — versiones de los textos legales', () => {
  interface NewVersion {
    country: string;
    version: string;
    legalTerms?: string | null;
    [field: string]: unknown;
  }
  type VersionRow = NewVersion & { id: number };

  const LEGAL_NULLS = {
    legalEntityName: null,
    legalEntityTaxId: null,
    legalAddress: null,
    privacyEmail: null,
    legalUpdatedAt: null as Date | null,
    legalTerms: null as string | null,
    legalPrivacy: null,
    legalData: null,
  };

  function campus(initialVersions: NewVersion[] = []) {
    const settings: Record<string, Record<string, unknown>> = {
      COLOMBIA: { country: 'COLOMBIA', primaryColor: '#0F766E', logoUrl: null, ...LEGAL_NULLS },
      MEXICO: { country: 'MEXICO', primaryColor: '#1e3a8a', logoUrl: null, ...LEGAL_NULLS },
    };
    const versions: VersionRow[] = initialVersions.map((row, index) => ({ id: index + 1, ...row }));

    const matches = (row: VersionRow, where: Record<string, unknown>) =>
      Object.entries(where).every(([key, value]) => row[key] === value);

    const prisma = {
      countrySettings: {
        findUnique: async ({ where }: { where: { country: string } }) => ({ ...settings[where.country] }),
        update: async ({ where, data }: { where: { country: string }; data: Record<string, unknown> }) => {
          settings[where.country] = { ...settings[where.country], ...data };
          return { ...settings[where.country] };
        },
      },
      legalVersion: {
        create: async ({ data }: { data: NewVersion }) => {
          if (versions.some((row) => row.country === data.country && row.version === data.version)) {
            throw new Error('Versión duplicada');
          }
          const row = { id: versions.length + 1, ...data };
          versions.push(row);
          return row;
        },
        upsert: async ({
          where,
          create,
        }: {
          where: { country_version: { country: string; version: string } };
          create: NewVersion;
        }) => {
          const existing = versions.find((row) => matches(row, where.country_version));
          return existing ?? prisma.legalVersion.create({ data: create });
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          versions.filter((row) => matches(row, where)).sort((a, b) => b.id - a.id),
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          versions.find((row) => matches(row, where)) ?? null,
      },
      $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
    };

    const realtime = { emitToCountry: () => undefined };
    const files = { assertCanUse: jest.fn(async () => undefined), deleteUnreferenced: jest.fn(async () => undefined) };
    const service = new SettingsService(prisma as never, {} as never, realtime as never, files as never);
    return { service, versions };
  }

  it('al cambiar un texto legal registra la versión nueva con lo que dice', async () => {
    const { service, versions } = campus();

    await service.updateSettings('COLOMBIA', { legalTerms: 'Términos propios' });

    const published = versions.find((row) => row.legalTerms === 'Términos propios');
    expect(published).toMatchObject({ country: 'COLOMBIA', legalPrivacy: null });
  });

  it('la versión registrada es la misma que queda en el consentimiento', async () => {
    const { service, versions } = campus();

    await service.updateSettings('COLOMBIA', { legalTerms: 'Términos propios' });

    const current = await service.legalVersion('COLOMBIA');
    expect(versions.find((row) => row.version === current)?.legalTerms).toBe('Términos propios');
  });

  it('guarda también la versión sustituida si no constaba, para no perder lo que alguien aceptó', async () => {
    const { service, versions } = campus();

    await service.updateSettings('COLOMBIA', { legalTerms: 'Términos propios' });

    expect(versions.find((row) => row.version === BASE_LEGAL_VERSION)).toMatchObject({
      country: 'COLOMBIA',
      legalTerms: null,
    });
    expect(versions).toHaveLength(2);
  });

  it('no reescribe una versión que ya constaba', async () => {
    const { service, versions } = campus([
      { country: 'COLOMBIA', version: BASE_LEGAL_VERSION, legalTerms: 'Original' },
    ]);

    await service.updateSettings('COLOMBIA', { legalTerms: 'Términos propios' });

    expect(versions.filter((row) => row.version === BASE_LEGAL_VERSION)).toEqual([
      expect.objectContaining({ legalTerms: 'Original' }),
    ]);
  });

  it('no registra nada si el cambio no toca los textos legales', async () => {
    const { service, versions } = campus();

    await service.updateSettings('COLOMBIA', { primaryColor: '#000000' });

    expect(versions).toHaveLength(0);
  });

  it('no registra nada si se guarda un texto legal sin cambiarlo', async () => {
    const { service, versions } = campus();
    await service.updateSettings('COLOMBIA', { legalTerms: 'Términos propios' });
    const before = versions.length;

    await service.updateSettings('COLOMBIA', { legalTerms: 'Términos propios', primaryColor: '#000000' });

    expect(versions).toHaveLength(before);
  });

  it('cada sede registra y ve sólo sus versiones', async () => {
    const { service, versions } = campus();

    await service.updateSettings('COLOMBIA', { legalTerms: 'Términos de Colombia' });

    expect(versions.every((row) => row.country === 'COLOMBIA')).toBe(true);
    await expect(service.getLegalVersions('MEXICO')).resolves.toEqual([]);

    const colombian = await service.getLegalVersions('COLOMBIA');
    expect(colombian).toHaveLength(2);
    expect(colombian[0]).toMatchObject({ current: true });
    expect(colombian[1]).toMatchObject({ version: BASE_LEGAL_VERSION, current: false });
  });

  it('no entrega el texto de una versión de otra sede', async () => {
    const { service, versions } = campus();
    await service.updateSettings('COLOMBIA', { legalTerms: 'Términos de Colombia' });
    const colombianId = versions[0].id;

    await expect(service.getLegalVersion(colombianId, 'MEXICO')).rejects.toThrow(NotFoundException);
    await expect(service.getLegalVersion(colombianId, 'COLOMBIA')).resolves.toMatchObject({ country: 'COLOMBIA' });
  });
});

/**
 * Archivos de la configuración: un logotipo o un fondo nuevo tiene que venir de la misma sede,
 * y la firma, de quien la guarda.
 */
describe('SettingsService · archivos', () => {
  function serviceFor(current: Record<string, unknown>) {
    const prisma = {
      countrySettings: {
        findUnique: async () => ({ country: 'MEXICO', ...current }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({ country: 'MEXICO', ...current, ...data }),
      },
      user: {
        findUnique: async () => ({ signatureUrl: 'firmas/vieja.png' }),
        update: async ({ data }: { data: Record<string, unknown> }) => data,
      },
      $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
    };
    const storage = { downloadUrl: (key: string) => `/firmada/${key}` };
    const realtime = { emitToCountry: () => undefined };
    const files = { assertCanUse: jest.fn(async () => undefined), deleteUnreferenced: jest.fn(async () => undefined) };
    const service = new SettingsService(prisma as never, storage as never, realtime as never, files as never);
    return { service, files };
  }

  it('cada campo de imagen se valida contra su carpeta y la sede, y lo sustituido se retira', async () => {
    const { service, files } = serviceFor({ logoUrl: 'logos/viejo.png', faviconUrl: null, loginBackgroundUrl: null });

    await service.updateSettings('MEXICO', { logoUrl: 'logos/nuevo.png', loginBackgroundUrl: 'fondos/campo.jpg' });

    expect(files.assertCanUse).toHaveBeenCalledWith('logos/nuevo.png', 'logos/viejo.png', 'logos', {
      country: 'MEXICO',
    });
    expect(files.assertCanUse).toHaveBeenCalledWith('fondos/campo.jpg', null, 'fondos', { country: 'MEXICO' });
    expect(files.deleteUnreferenced).toHaveBeenCalledWith(['logos/viejo.png', null, null]);
  });

  it('un logotipo de la otra sede no se guarda', async () => {
    const { service, files } = serviceFor({ logoUrl: null });
    files.assertCanUse.mockRejectedValueOnce(new ForbiddenException('otra sede'));

    await expect(service.updateSettings('MEXICO', { logoUrl: 'logos/de-colombia.png' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(files.deleteUnreferenced).not.toHaveBeenCalled();
  });

  it('la firma nueva tiene que haberla subido quien la guarda', async () => {
    const { service, files } = serviceFor({});

    await service.updateSignature('profe-1', { signatureUrl: 'firmas/nueva.png' });

    expect(files.assertCanUse).toHaveBeenCalledWith('firmas/nueva.png', 'firmas/vieja.png', 'firmas', {
      uploader: 'profe-1',
    });
    expect(files.deleteUnreferenced).toHaveBeenCalledWith(['firmas/vieja.png']);
  });
});

describe('SettingsService — configuración inicial de cada sede', () => {
  it('crea cada sede con su propio color de marca', async () => {
    const created: { country: string; primaryColor: string }[] = [];
    const prisma = {
      countrySettings: {
        findUnique: async () => null,
        create: async ({ data }: { data: { country: string; primaryColor: string } }) => created.push(data),
      },
    };
    const service = new SettingsService(prisma as never, {} as never, {} as never, {} as never);

    await service.onModuleInit();

    expect(created.map(({ country, primaryColor }) => ({ country, primaryColor }))).toEqual([
      { country: 'COLOMBIA', primaryColor: '#0F766E' },
      { country: 'MEXICO', primaryColor: '#1f2937' },
    ]);
  });
});
