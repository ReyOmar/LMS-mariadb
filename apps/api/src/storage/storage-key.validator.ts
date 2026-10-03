import { ValidateBy, ValidationOptions } from 'class-validator';
import { Folder, isStorageKey } from './folders';

/**
 * Valida que un campo sea una clave de almacenamiento de las carpetas indicadas, tal como
 * la devuelve la subida. Sin esto, quien guarda la clave podría apuntar a un archivo ajeno
 * y la API lo firmaría, lo serviría o lo borraría al reemplazarlo.
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
