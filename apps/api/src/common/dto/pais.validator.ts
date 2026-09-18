import { IsIn } from 'class-validator';
import { PAISES } from '../domain/pais';

/**
 * Valida que un campo sea un país operativo del LMS.
 * Centralizado para que añadir una tercera sede sea un solo cambio en `PAISES`.
 */
export const EsPais = () =>
  IsIn(PAISES as unknown as string[], {
    message: `El país debe ser uno de: ${PAISES.join(', ')}.`,
  });
