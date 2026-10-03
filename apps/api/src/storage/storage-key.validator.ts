import { ValidateBy, ValidationOptions } from 'class-validator';
import { Folder, isStorageKey } from './folders';

/**
 * Valida que un campo tenga la forma de una clave de almacenamiento de las carpetas
 * indicadas, tal como la devuelve la subida. Que el archivo lo subiera quien guarda la clave
 * lo comprueba después `FileOwnershipService`, que necesita la base de datos.
 */
export function IsStorageKey(folders: readonly Folder[], options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStorageKey',
      validator: { validate: (value: unknown) => isStorageKey(value, folders) },
    },
    { message: 'El archivo indicado no es válido. Súbelo de nuevo.', ...options },
  );
}
