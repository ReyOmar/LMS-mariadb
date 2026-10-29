import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Lo que admiten las columnas de nombre y apellido. */
const MAX_NAME_LENGTH = 100;

/** Palabras que van en minúscula dentro de un nombre: «María de la Cruz». */
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

/**
 * Un nombre tal como se guarda: sin espacios de sobra y, si llega todo en mayúsculas o todo en
 * minúsculas —como lo exportan muchos sistemas—, con mayúscula inicial en cada palabra. Lo que ya
 * combina mayúsculas y minúsculas se respeta: «McDonald» lo sabe quien lo escribió.
 */
export function normalizePersonName(typed: string): string {
  const name = typed.trim().replace(/\s+/g, ' ');
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) return name;
  return name
    .toLowerCase()
    .split(' ')
    .map((word, index) => (index > 0 && PARTICLES.has(word) ? word : capitalized(word)))
    .join(' ');
}

/** Mayúscula al principio de cada tramo de la palabra: «Jean-Pierre», «O'Neill». */
function capitalized(word: string): string {
  return word.replace(
    /(^|[-'’])(\p{L})/gu,
    (_match, separator: string, letter: string) => separator + letter.toUpperCase(),
  );
}

/** Nombre o apellido de una persona. Con `Omittable`, puede faltar en una edición. */
export const PersonName = () =>
  applyDecorators(
    IsString(),
    IsNotEmpty(),
    MaxLength(MAX_NAME_LENGTH),
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? normalizePersonName(value) : value)),
  );
