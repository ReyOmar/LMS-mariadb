import { FileOwnershipService } from '../../storage/file-ownership.service';

/**
 * `FileOwnershipService` con sus reglas de sustitución reales y sin base de datos: admite
 * cualquier clave nueva (`assertCanUse`) y anota lo que retiraría (`deleteUnreferenced`) o
 * descartaría tras un fallo al guardar (`discarded`).
 */
export function fileOwnershipDouble() {
  const storage = { deleteFiles: jest.fn(async (_keys: (string | null | undefined)[]) => undefined) };
  const files = new FileOwnershipService({} as never, storage as never);
  const assertCanUse = jest.spyOn(files, 'assertCanUse').mockResolvedValue(undefined);
  const deleteUnreferenced = jest.spyOn(files, 'deleteUnreferenced').mockResolvedValue(undefined);

  return {
    files,
    assertCanUse,
    deleteUnreferenced,
    discarded: storage.deleteFiles,
    /** Claves que retiró, sin los campos que no cambiaban. */
    retired: () => deleteUnreferenced.mock.calls.flatMap(([keys]) => keys).filter(Boolean),
  };
}
