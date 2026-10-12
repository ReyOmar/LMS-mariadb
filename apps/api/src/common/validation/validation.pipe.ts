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

/**
 * Nombre con el que el usuario conoce cada campo. Los DTO usan nombres en inglés y el
 * mensaje no debe enseñarlos («El campo «search» es demasiado largo»).
 *
 * Un campo que no esté aquí se nombra tal como llegó: sólo ocurre con peticiones hechas a
 * mano o con campos que el DTO no declara, y entonces el nombre recibido es lo que sirve.
 */
const FIELD_LABELS: Record<string, string> = {
  // Cuentas y acceso
  email: 'correo electrónico',
  password: 'contraseña',
  currentPassword: 'contraseña actual',
  newPassword: 'nueva contraseña',
  temporaryPassword: 'contraseña temporal',
  firstName: 'nombre',
  lastName: 'apellido',
  role: 'rol',
  requestedRole: 'rol solicitado',
  country: 'sede',
  code: 'código',
  token: 'enlace de recuperación',
  reason: 'motivo',
  acceptsDataPolicy: 'aceptación de la política de datos',
  // Búsquedas y listados
  search: 'búsqueda',
  q: 'búsqueda',
  limit: 'límite',
  cursor: 'página',
  status: 'estado',
  result: 'resultado',
  course: 'curso',
  year: 'año',
  month: 'mes',
  // Cursos, módulos y recursos
  title: 'título',
  description: 'descripción',
  shortDescription: 'descripción corta',
  coverImage: 'portada',
  level: 'nivel',
  durationHours: 'duración',
  passingScore: 'nota de aprobación',
  strictOrder: 'orden estricto',
  issuesCertificate: 'emisión de certificado',
  requiresPrevious: 'requisito del módulo anterior',
  maxStudents: 'cupo',
  accessCode: 'código de acceso',
  startDate: 'fecha de inicio',
  endDate: 'fecha de fin',
  position: 'posición',
  guids: 'identificadores',
  type: 'tipo',
  content: 'contenido',
  contentHtml: 'contenido',
  referenceUrl: 'enlace de referencia',
  readingMinutes: 'minutos de lectura',
  quizConfig: 'configuración del cuestionario',
  answers: 'respuestas',
  // Personas y referencias
  courseGuid: 'curso',
  teacherGuid: 'examinador',
  userGuid: 'usuario',
  resourceGuid: 'recurso',
  recipientGuid: 'destinatario',
  receiverGuid: 'destinatario',
  refType: 'tipo de referencia',
  refGuid: 'referencia',
  // Calificaciones y mensajes
  score: 'calificación',
  feedback: 'comentario',
  subject: 'asunto',
  bodyHtml: 'cuerpo del correo',
  active: 'activa',
  accept: 'respuesta a la solicitud',
  attachmentKey: 'archivo adjunto',
  attachmentName: 'nombre del adjunto',
  // Configuración de la sede
  platformName: 'nombre de la plataforma',
  welcomeMessage: 'mensaje de bienvenida',
  primaryColor: 'color principal',
  secondaryColor: 'color secundario',
  font: 'tipografía',
  borderRadius: 'redondeo de bordes',
  logoUrl: 'logotipo',
  faviconUrl: 'icono de la pestaña',
  loginBackgroundUrl: 'fondo del acceso',
  timeZone: 'zona horaria',
  maxUploadMb: 'tamaño máximo de subida',
  maxFileMb: 'tamaño máximo de archivo',
  landingHeroSubtitle: 'subtítulo de la portada',
  landingFooterText: 'texto del pie de página',
  landingPhone: 'teléfono',
  landingPhoneSub: 'detalle del teléfono',
  landingEmail: 'correo de contacto',
  landingEmailSub: 'detalle del correo de contacto',
  landingOffice: 'oficina',
  landingOfficeSub: 'detalle de la oficina',
  legalEntityName: 'razón social',
  legalEntityTaxId: 'identificación tributaria',
  legalAddress: 'domicilio',
  privacyEmail: 'correo de privacidad',
  legalTerms: 'términos y condiciones',
  legalPrivacy: 'política de privacidad',
  legalData: 'tratamiento de datos',
  // Certificados y firma
  certCustomTitle: 'título del certificado',
  certSubtitle: 'subtítulo del certificado',
  certLegalText: 'texto legal del certificado',
  certShowModules: 'mostrar módulos',
  certShowResources: 'mostrar recursos',
  certShowScore: 'mostrar calificación',
  certShowSignature: 'mostrar firma',
  certShowEnrollmentDate: 'mostrar fecha de matrícula',
  certValidityMonths: 'vigencia',
  signatureUrl: 'firma',
  signatureName: 'nombre del firmante',
  signatureTitle: 'cargo del firmante',
};

/** Los mensajes por defecto están en inglés; los propios del proyecto, en español. */
const isDefaultMessage = (message: string) => /\b(must|should)\b/.test(message);

function messagesOf(error: ValidationError, parent?: string): string[] {
  const label = FIELD_LABELS[error.property] ?? error.property;
  const field = parent ? `${parent}.${label}` : label;
  const own = Object.entries(error.constraints ?? {}).map(([constraint, message]) => {
    if (!isDefaultMessage(message)) return message;
    // Un campo que el DTO no declara se nombra tal como lo envió el cliente.
    if (constraint === 'whitelistValidation') {
      return DEFAULT_MESSAGES.whitelistValidation.replace('{field}', error.property);
    }
    return (DEFAULT_MESSAGES[constraint] ?? 'El campo «{field}» no es válido.').replace('{field}', field);
  });
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
