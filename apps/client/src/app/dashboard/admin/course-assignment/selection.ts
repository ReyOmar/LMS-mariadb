/** Elegidos para matricular de una vez, por `guid`; se conservan aunque cambie la búsqueda. */
export type Selection<T extends { guid: string }> = ReadonlyMap<string, T>;

export function toggled<T extends { guid: string }>(selection: Selection<T>, item: T): Selection<T> {
  const next = new Map(selection);
  if (next.has(item.guid)) next.delete(item.guid);
  else next.set(item.guid, item);
  return next;
}

export function allSelected<T extends { guid: string }>(selection: Selection<T>, visible: readonly T[]): boolean {
  return visible.length > 0 && visible.every((item) => selection.has(item.guid));
}

/** Marca todos los visibles o, si ya lo estaban, los desmarca; los elegidos fuera de la vista no cambian. */
export function toggledVisible<T extends { guid: string }>(
  selection: Selection<T>,
  visible: readonly T[],
): Selection<T> {
  const unselect = allSelected(selection, visible);
  const next = new Map(selection);
  for (const item of visible) {
    if (unselect) next.delete(item.guid);
    else next.set(item.guid, item);
  }
  return next;
}

export function without<T extends { guid: string }>(selection: Selection<T>, guids: readonly string[]): Selection<T> {
  if (!guids.some((guid) => selection.has(guid))) return selection;
  const next = new Map(selection);
  for (const guid of guids) next.delete(guid);
  return next;
}
