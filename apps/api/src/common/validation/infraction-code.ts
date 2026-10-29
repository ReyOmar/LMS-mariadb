import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Lo que admite la columna del código de una infracción. */
const MAX_INFRACTION_CODE_LENGTH = 50;

/**
 * El código de una infracción tal como se guarda y se compara: en mayúsculas, sin tildes y sin
 * espacios ni signos. Así `C29`, `c.29`, `C-29` y `C 29` son la misma infracción, la escriba como la
 * escriba el sistema que la envía. Vacío si el texto no tiene ninguna letra ni cifra.
 */
export function infractionCodeFrom(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Código de infracción recibido: se guarda ya normalizado (ver `infractionCodeFrom`). */
export const InfractionCode = () =>
  applyDecorators(
    IsString(),
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? infractionCodeFrom(value) : value)),
    IsNotEmpty({ message: 'El código de la infracción necesita al menos una letra o una cifra.' }),
    MaxLength(MAX_INFRACTION_CODE_LENGTH, {
      message: `El código de la infracción admite como mucho ${MAX_INFRACTION_CODE_LENGTH} letras y cifras.`,
    }),
  );
