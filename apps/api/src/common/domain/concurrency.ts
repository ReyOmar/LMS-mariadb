/**
 * Ejecuta `task` sobre cada elemento con, como mucho, `limit` tareas en curso a la vez.
 *
 * Es `Promise.allSettled` con tope: un fallo no detiene a los demás y cada resultado queda
 * en la posición de su elemento. Nunca rechaza.
 *
 * Sirve para los envíos en bloque: lanzar a la vez un correo por cada matriculado abre
 * cientos de peticiones contra el proveedor, que empieza a rechazarlas por exceso.
 */
export async function settleWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  const workers = Math.min(Math.max(1, Math.floor(limit)), items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

/** Cuántos de los resultados fallaron. */
export function countRejected(results: readonly PromiseSettledResult<unknown>[]): number {
  return results.filter((result) => result.status === 'rejected').length;
}
