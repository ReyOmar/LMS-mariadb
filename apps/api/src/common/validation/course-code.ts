import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Código con el que otro sistema nombra un curso al pedir una matrícula, como `MANEJO-DEFENSIVO`.
 *
 * Las dos partes lo acuerdan antes de que el curso exista: por eso no sirve el título, que se
 * escribe a mano y cambia, ni el identificador interno, que no se conoce hasta crearlo.
 */
export const MAX_COURSE_CODE_LENGTH = 50;

/** Letras sin tilde y cifras, en tramos separados por un guion, un guion bajo o un punto. */
export const COURSE_CODE_PATTERN = /^[A-Z0-9]+(?:[-_.][A-Z0-9]+)*$/;

/** Se compara sin espacios en los extremos y en mayúsculas: `manejo-defensivo` es el mismo código. */
export function normalizeCourseCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export const CourseCode = () =>
  applyDecorators(
    IsString({ message: 'El código del curso debe ser texto.' }),
    Matches(COURSE_CODE_PATTERN, {
      message:
        'El código del curso sólo admite letras sin tilde y cifras, separadas por guiones, como MANEJO-DEFENSIVO.',
    }),
    MaxLength(MAX_COURSE_CODE_LENGTH, {
      message: `El código del curso no puede superar los ${MAX_COURSE_CODE_LENGTH} caracteres.`,
    }),
    Transform(({ value }) => normalizeCourseCode(value)),
  );
