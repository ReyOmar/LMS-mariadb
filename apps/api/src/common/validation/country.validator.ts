import { IsIn } from 'class-validator';
import { COUNTRIES } from '../domain/country';

/** Valida que un campo sea un país operativo del LMS. */
export const IsCountry = () =>
  IsIn(COUNTRIES, {
    message: `El país debe ser uno de: ${COUNTRIES.join(', ')}.`,
  });
