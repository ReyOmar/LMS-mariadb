/**
 * Separación por país (tenancy) — fuente única de verdad.
 *
 * El LMS opera dos sedes independientes, Colombia y México. La regla del sistema es que
 * **ningún dato cruza de una a otra**: usuarios, cursos, matrículas, entregas, certificados,
 * mensajes, notificaciones y configuración de marca pertenecen a un único país.
 *
 * El país se decide en dos momentos y en ninguno más:
 *  1. Al crear la cuenta (solicitud de acceso o alta por administrador).
 *  2. Al iniciar sesión, donde se comprueba que coincide con el de la cuenta.
 *
 * A partir de ahí lo lee `JwtGuard` de la cuenta en cada petición —no del token— y los
 * servicios lo reciben como argumento explícito: no se deduce de cabeceras, del dominio ni
 * de ningún dato que el cliente pueda manipular.
 */

/** Códigos de país admitidos. Coincide con el enum `Country` de Prisma. */
export const COUNTRIES = ['COLOMBIA', 'MEXICO'] as const;

export type Country = (typeof COUNTRIES)[number];

/** Sede que se usa cuando una ruta pública no indica ninguna. */
export const DEFAULT_COUNTRY: Country = 'COLOMBIA';

interface CountryMetadata {
  /** Nombre para mostrar en la interfaz. */
  readonly name: string;
  /** Código ISO 3166-1 alfa-2. */
  readonly iso: string;
  /** Zona horaria por defecto de la sede. */
  readonly timeZone: string;
}

export const COUNTRY_METADATA: Readonly<Record<Country, CountryMetadata>> = {
  COLOMBIA: {
    name: 'Colombia',
    iso: 'CO',
    timeZone: 'America/Bogota',
  },
  MEXICO: {
    name: 'México',
    iso: 'MX',
    timeZone: 'America/Mexico_City',
  },
};

/** Comprueba si un valor arbitrario es un país válido. */
export function isCountry(value: unknown): value is Country {
  return typeof value === 'string' && (COUNTRIES as readonly string[]).includes(value);
}

/**
 * Convierte una entrada externa en un país válido, o `null` si no lo es.
 * Acepta el código en cualquier capitalización para tolerar query params escritos a mano,
 * pero no adivina: una entrada desconocida devuelve `null` y quien llama decide qué hacer.
 */
export function normalizeCountry(value: unknown): Country | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toUpperCase();
  return isCountry(candidate) ? candidate : null;
}

/** Nombre legible del país, para mensajes de error y correos. */
export function countryName(country: Country): string {
  return COUNTRY_METADATA[country].name;
}
