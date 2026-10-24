import { clientSource, entriesIn, numberIn, textsIn } from './common/testing/client-source';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './common/domain/password';
import { DEFAULT_PASSING_SCORE, MAX_SCORE, MIN_SCORE } from './common/domain/grading';
import { COUNTRY_METADATA } from './common/domain/country';
import { IMAGE_LIMITS_MB } from './storage/upload-limits';
import { FORMATS_BY_FOLDER } from './storage/folders';
import { MAX_ATTEMPTS, MAX_OPTIONS, MAX_QUESTIONS, MAX_TIME_LIMIT_MINUTES, MIN_OPTIONS } from './courses/quiz-config';
import { CERTIFICATE_TEXT, MAX_LEGAL_TEXT_LENGTH } from './certificates/certificate-pdf';
import { REALTIME_EVENTS } from './realtime/events';
import { MAX_DURATION_HOURS, MAX_TITLE_LENGTH } from './courses/dto/courses.dto';
import { RESOURCE_TYPES } from './courses/dto/resources.dto';
import { UpdateSettingsDto } from './settings/dto/update-settings.dto';
import { maxLengthOf } from './common/testing/validation-metadata';

/**
 * Reglas que el cliente repite para avisar antes de enviar nada. Quien decide es la API; si
 * una copia se separa, la pantalla promete lo que el servidor rechaza, o al revés.
 *
 * Sin el cliente junto a la API (se puede desplegar sola) no hay nada que comparar.
 */
function mirror(path: string, compare: (source: string) => void) {
  return () => {
    const source = clientSource(path);
    if (source === null) {
      console.warn(`No está el cliente (${path}); se omite la comparación.`);
      return;
    }
    compare(source);
  };
}

/** Tipos MIME de cada extensión de imagen que admite la API. */
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

describe('Reglas que repite el cliente', () => {
  it(
    'catálogo de eventos en tiempo real',
    mirror('src/lib/realtime/events.ts', (source) => {
      expect(textsIn(source, 'REALTIME_EVENTS').sort()).toEqual([...REALTIME_EVENTS].sort());
    }),
  );

  it(
    'formatos que puede entregar un alumno',
    mirror('src/components/assignments/allowed-files.ts', (source) => {
      expect(textsIn(source, 'ALLOWED_EXTENSIONS').sort()).toEqual([...(FORMATS_BY_FOLDER.entregas ?? [])].sort());
    }),
  );

  it(
    'política de contraseñas',
    mirror('src/lib/password.ts', (source) => {
      expect(numberIn(source, 'MIN_PASSWORD_LENGTH')).toBe(MIN_PASSWORD_LENGTH);
      expect(numberIn(source, 'MAX_PASSWORD_LENGTH')).toBe(MAX_PASSWORD_LENGTH);
    }),
  );

  it(
    'escala de notas',
    mirror('src/lib/grading.ts', (source) => {
      expect(numberIn(source, 'MIN_SCORE')).toBe(MIN_SCORE);
      expect(numberIn(source, 'MAX_SCORE')).toBe(MAX_SCORE);
      expect(numberIn(source, 'DEFAULT_PASSING_SCORE')).toBe(DEFAULT_PASSING_SCORE);
    }),
  );

  it(
    'topes de las imágenes',
    mirror('src/lib/upload-limits.ts', (source) => {
      const fromClient = Object.entries(entriesIn(source, 'IMAGE_LIMITS_MB')).map(([folder, mb]) => [
        folder,
        Number(mb),
      ]);
      expect(Object.fromEntries(fromClient)).toEqual(IMAGE_LIMITS_MB);
    }),
  );

  it(
    'formatos de imagen de cada carpeta',
    mirror('src/lib/image-formats.ts', (source) => {
      // El cliente las nombra por su tipo MIME, agrupadas en listas que se componen entre sí.
      const typesOf = (list: string): string[] =>
        source
          .match(new RegExp(`const ${list} = \\[([^\\]]*)\\]`))![1]
          .split(',')
          .map((item) => item.trim())
          .flatMap((item) => (item.startsWith('...') ? typesOf(item.slice(3)) : [item.replace(/'/g, '')]));

      for (const [folder, list] of Object.entries(entriesIn(source, 'FORMATS_BY_FOLDER'))) {
        const expected = (FORMATS_BY_FOLDER[folder as keyof typeof FORMATS_BY_FOLDER] ?? []).map(
          (ext) => IMAGE_TYPES[ext],
        );
        expect([...new Set(typesOf(list))].sort()).toEqual([...new Set(expected)].sort());
      }
    }),
  );

  it(
    'topes de un cuestionario',
    mirror('src/app/dashboard/course-builder/components/quiz-editing.ts', (source) => {
      expect(entriesIn(source, 'QUIZ_LIMITS')).toEqual({
        maxQuestions: String(MAX_QUESTIONS),
        minOptions: String(MIN_OPTIONS),
        maxOptions: String(MAX_OPTIONS),
        maxAttempts: String(MAX_ATTEMPTS),
        maxTimeLimitMinutes: String(MAX_TIME_LIMIT_MINUTES),
      });
    }),
  );

  it(
    'textos fijos y tope del texto legal del certificado',
    mirror('src/app/dashboard/admin/certificate-settings/certificate.ts', (source) => {
      expect(entriesIn(source, 'CERTIFICATE_TEXT')).toEqual(CERTIFICATE_TEXT);
      expect(numberIn(source, 'MAX_LEGAL_TEXT_LENGTH')).toBe(MAX_LEGAL_TEXT_LENGTH);
    }),
  );

  it(
    'tipos de recurso',
    mirror('src/types/models.ts', (source) => {
      const union = /type ResourceType = ([^;]+);/.exec(source)![1];
      expect([...union.matchAll(/'(\w+)'/g)].map(([, type]) => type).sort()).toEqual([...RESOURCE_TYPES].sort());
    }),
  );

  it(
    'títulos y duración de los cursos',
    mirror('src/app/dashboard/course-builder/components/names.ts', (source) => {
      expect(numberIn(source, 'MAX_TITLE_LENGTH')).toBe(MAX_TITLE_LENGTH);
    }),
  );

  it(
    'horas que acredita un certificado',
    mirror('src/app/dashboard/course-builder/components/course-fields.ts', (source) => {
      expect(numberIn(source, 'MAX_DURATION_HOURS')).toBe(MAX_DURATION_HOURS);
    }),
  );

  it(
    'topes de los textos de la portada y de los textos legales',
    mirror('src/app/dashboard/admin/landing-settings/landing-fields.ts', (source) => {
      const limits = [...source.matchAll(/field: '(\w+)'[^}]*?limit: (\w+)/g)];
      expect(limits.length).toBeGreaterThan(0);
      for (const [, field, limit] of limits) {
        const value = /^\d+$/.test(limit) ? Number(limit) : numberIn(source, limit);
        expect({ field, limit: value }).toEqual({ field, limit: maxLengthOf(UpdateSettingsDto, field) });
      }
    }),
  );

  it(
    'color de cada sede antes de cargar su configuración',
    mirror('public/theme-preload.js', (source) => {
      const brands = source.match(/BRANDS = (\{.*\});/)![1];
      for (const [country, { primaryColor }] of Object.entries(COUNTRY_METADATA)) {
        expect(brands).toContain(`${country}: { primaryColor: '${primaryColor}' }`);
      }
    }),
  );
});
