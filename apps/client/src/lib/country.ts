/**
 * Sedes del LMS en el cliente.
 *
 * El campus opera dos sedes independientes y los datos no se mezclan nunca. El navegador
 * sólo decide **qué sede mostrar antes de iniciar sesión** (portada, marca y formulario de
 * acceso); en cuanto hay sesión, la sede la manda el servidor a través del token y lo que
 * haya aquí deja de importar.
 *
 * Es decir: esto es una preferencia de presentación, no un control de acceso. Cambiar el
 * valor guardado no da acceso a nada de la otra sede.
 */

import { readLocal, writeLocal } from './local-storage';

export const COUNTRIES = ['COLOMBIA', 'MEXICO'] as const;

export type Country = (typeof COUNTRIES)[number];

interface CountryData {
  readonly name: string;
  readonly demonym: string;
  readonly iso: string;
  /**
   * Franjas de la bandera como degradado CSS, para dibujarla sin imágenes ni emoji.
   * Los emoji de bandera no existen en la fuente de Windows, que los muestra como las
   * letras del código de país; un degradado se ve igual en todos los sistemas.
   */
  readonly stripes: string;
}

export const COUNTRY_INFO: Readonly<Record<Country, CountryData>> = {
  COLOMBIA: {
    name: 'Colombia',
    demonym: 'colombiana',
    iso: 'CO',
    stripes: 'linear-gradient(to bottom, #FCD116 0 50%, #003893 50% 75%, #CE1126 75% 100%)',
  },
  MEXICO: {
    name: 'México',
    demonym: 'mexicana',
    iso: 'MX',
    stripes: 'linear-gradient(to right, #006847 0 33.33%, #FFFFFF 33.33% 66.66%, #CE1126 66.66% 100%)',
  },
};

const STORAGE_KEY = 'lms_country';

export function isCountry(value: unknown): value is Country {
  return typeof value === 'string' && (COUNTRIES as readonly string[]).includes(value);
}

export function countryName(country: Country): string {
  return COUNTRY_INFO[country].name;
}

/**
 * Cifra escrita como se lee en la sede: separador de miles y, como mucho, un decimal.
 * Colombia agrupa con punto (2.069) y México con coma (2,069).
 */
export function formatNumber(value: number, country: Country): string {
  return value.toLocaleString(`es-${COUNTRY_INFO[country].iso}`, { maximumFractionDigits: 1 });
}

/** Sede de partida de quien llega sin haber elegido nunca. */
export const DEFAULT_COUNTRY: Country = 'COLOMBIA';

/**
 * Sede elegida la última vez, o la de partida.
 *
 * Siempre hay una: se entra directamente a una sede y se cambia desde el selector que está
 * a la vista en la portada y en el acceso. `public/theme-preload.js` repite esta regla.
 */
export function savedCountry(): Country {
  const saved = readLocal(STORAGE_KEY);
  return isCountry(saved) ? saved : DEFAULT_COUNTRY;
}

export function saveCountry(country: Country): void {
  writeLocal(STORAGE_KEY, country);
}
