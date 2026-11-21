/**
 * De una edición, los campos indicados que traen valor.
 *
 * En una edición parcial lo que no llega no se toca: `undefined` es «no lo cambies», mientras
 * que `null` sí es un valor (vaciar el campo) y se conserva.
 */
export function definedFields<Source extends object, Field extends keyof Source>(
  source: Source,
  fields: readonly Field[],
): Partial<Pick<Source, Field>> {
  const defined: Partial<Pick<Source, Field>> = {};
  for (const field of fields) {
    if (source[field] !== undefined) defined[field] = source[field];
  }
  return defined;
}
