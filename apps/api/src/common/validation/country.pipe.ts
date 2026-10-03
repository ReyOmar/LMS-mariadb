import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { COUNTRIES, DEFAULT_COUNTRY, Country, normalizeCountry } from '../domain/country';

/**
 * Resuelve el parámetro `country` de las rutas públicas (portada, login, textos legales),
 * donde todavía no hay sesión de la que deducirlo.
 *
 * Un valor ausente cae en la sede por defecto para que una carga sin parámetro siga
 * sirviendo algo coherente; un valor presente pero desconocido se rechaza en lugar de
 * ignorarse, porque significa que el cliente está pidiendo una sede que no existe y
 * devolverle otra sería exactamente el cruce de datos que hay que evitar.
 *
 * En rutas autenticadas **no se usa**: allí el país sale de la sesión y no del cliente.
 */
@Injectable()
export class CountryPipe implements PipeTransform<unknown, Country> {
  transform(value: unknown): Country {
    if (value === undefined || value === null || value === '') return DEFAULT_COUNTRY;

    const country = normalizeCountry(value);
    if (!country) {
      throw new BadRequestException(`El país indicado no es válido. Debe ser uno de: ${COUNTRIES.join(', ')}.`);
    }
    return country;
  }
}
