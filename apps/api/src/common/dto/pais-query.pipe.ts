import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { PAISES, PAIS_POR_DEFECTO, Pais, normalizarPais } from '../domain/pais';

/**
 * Resuelve el parámetro `pais` de las rutas públicas (portada, login, textos legales),
 * donde todavía no hay sesión de la que deducirlo.
 *
 * Un valor ausente cae en la sede por defecto para que una carga sin parámetro siga
 * sirviendo algo coherente; un valor presente pero desconocido se rechaza en lugar de
 * ignorarse, porque significa que el cliente está pidiendo una sede que no existe y
 * devolverle otra sería exactamente el cruce de datos que hay que evitar.
 *
 * En rutas autenticadas **no se usa**: allí el país sale del JWT y no del cliente.
 */
@Injectable()
export class PaisQueryPipe implements PipeTransform<unknown, Pais> {
  transform(valor: unknown): Pais {
    if (valor === undefined || valor === null || valor === '') return PAIS_POR_DEFECTO;

    const pais = normalizarPais(valor);
    if (!pais) {
      throw new BadRequestException(`El país indicado no es válido. Debe ser uno de: ${PAISES.join(', ')}.`);
    }
    return pais;
  }
}
