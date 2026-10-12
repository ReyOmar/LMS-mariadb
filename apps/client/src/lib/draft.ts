/** En un formulario, un campo vacío y uno sin configurar (`null`) valen lo mismo. */
function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? '') === (b ?? '');
}

/** Los cambios que difieren de lo guardado: tocar un campo y dejarlo como estaba no cuenta. */
export function pendingChanges<T extends object>(saved: T, changes: Partial<T>): Partial<T> {
  const differing = Object.entries(changes).filter(([key, value]) => !sameValue(value, saved[key as keyof T]));
  return Object.fromEntries(differing) as Partial<T>;
}
