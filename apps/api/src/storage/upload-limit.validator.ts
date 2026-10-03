import { ValidateBy, ValidationOptions } from 'class-validator';
import { uploadCeilingMb } from './upload-limits';

/**
 * Valida un límite de subida en MB: un entero entre 1 y el tope técnico (`MAX_UPLOAD_MB`).
 *
 * El tope se consulta al validar y no al declarar el DTO, porque éste se carga antes que
 * las variables de entorno del `.env`.
 *
 * @param subject Cómo se nombra el campo en el mensaje: «El límite de subida».
 */
export function IsUploadLimitMb(subject: string, options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isUploadLimitMb',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= uploadCeilingMb(),
        defaultMessage: () => `${subject} debe ser un número entero entre 1 y ${uploadCeilingMb()} MB.`,
      },
    },
    options,
  );
}
