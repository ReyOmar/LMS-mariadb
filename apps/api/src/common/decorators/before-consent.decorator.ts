import { SetMetadata } from '@nestjs/common';

export const BEFORE_CONSENT = 'beforeConsent';

/**
 * Ruta que se puede usar sin haber aceptado la política de tratamiento de datos vigente: lo que
 * hace falta para aceptarla o rechazarla —saber quién es uno, aceptarla, cerrar la sesión— y
 * preguntar por el tiempo real. El resto lo rechaza `JwtGuard` hasta que se acepta.
 */
export const BeforeConsent = () => SetMetadata(BEFORE_CONSENT, true);
