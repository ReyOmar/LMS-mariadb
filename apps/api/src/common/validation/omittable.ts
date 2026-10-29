import { ValidateIf } from 'class-validator';

/**
 * El campo puede faltar; si llega, se valida, también cuando llega `null`.
 *
 * `IsOptional` se salta la validación tanto si falta como si es `null`: un `null` en un campo que
 * la base no admite vacío llegaría hasta ella y acabaría en un error 500 en lugar de explicarse.
 * `IsOptional` queda para los campos que de verdad pueden quedar vacíos.
 */
export const Omittable = () => ValidateIf((_object, value: unknown) => value !== undefined);
