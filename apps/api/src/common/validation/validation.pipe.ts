import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

/**
 * Mensajes por defecto de `class-validator`, en español.
 *
 * Los validadores con mensaje propio lo conservan; éstos cubren los que no lo declaran,
 * que de otro modo llegarían al usuario en inglés («course must be a string»).
 */
const DEFAULT_MESSAGES: Record<string, string> = {
  isString: 'El campo «{field}» debe ser texto.',
  isNotEmpty: 'El campo «{field}» es obligatorio.',
  maxLength: 'El campo «{field}» es demasiado largo.',
  length: 'El campo «{field}» no tiene la longitud permitida.',
  isInt: 'El campo «{field}» debe ser un número entero.',
  isNumber: 'El campo «{field}» debe ser un número.',
  min: 'El campo «{field}» es menor que el mínimo permitido.',
  max: 'El campo «{field}» supera el máximo permitido.',
  isBoolean: 'El campo «{field}» debe ser verdadero o falso.',
  isEmail: 'El campo «{field}» debe ser un correo electrónico válido.',
  isIn: 'El valor de «{field}» no es válido.',
  isHexColor: 'El campo «{field}» debe ser un color hexadecimal.',
  isDateString: 'El campo «{field}» debe ser una fecha válida.',
  isUrl: 'El campo «{field}» debe ser una dirección web válida.',
  isObject: 'El campo «{field}» debe ser un objeto.',
  whitelistValidation: 'El campo «{field}» no está permitido.',
};

/** Los mensajes por defecto están en inglés; los propios del proyecto, en español. */
const isDefaultMessage = (message: string) => /\b(must|should)\b/.test(message);

function messagesOf(error: ValidationError, parent = ''): string[] {
  const field = parent ? `${parent}.${error.property}` : error.property;
  const own = Object.entries(error.constraints ?? {}).map(([constraint, message]) =>
    isDefaultMessage(message)
      ? (DEFAULT_MESSAGES[constraint] ?? 'El campo «{field}» no es válido.').replace('{field}', field)
      : message,
  );
  return [...own, ...(error.children ?? []).flatMap((child) => messagesOf(child, field))];
}

/** Validación global de los cuerpos y parámetros de entrada. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    // Descarta lo que no declare el DTO y rechaza la petición si trae campos de más:
    // un campo mal escrito da error en lugar de guardarse a medias sin avisar.
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors) => new BadRequestException(errors.flatMap((error) => messagesOf(error))),
  });
}
