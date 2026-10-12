/**
 * Lo guardado contra lo que se mide el borrador. La vista previa en vivo escribe sobre la configuración
 * cargada, así que mientras se edita vale la copia tomada antes del primer cambio.
 */
export function savedBaseline<T>(snapshot: T | null, loaded: T | null): T | null {
  return snapshot ?? loaded;
}
