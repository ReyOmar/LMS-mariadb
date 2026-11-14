/**
 * Reparte las filas por la clave de cada una. Los grupos salen en el orden en que aparece su
 * primera fila, y dentro de cada grupo las filas conservan el suyo.
 */
export function groupBy<Item>(items: readonly Item[], keyOf: (item: Item) => string): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();

  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  return groups;
}
