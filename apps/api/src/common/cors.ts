import { ConfigService } from '@nestjs/config';

/**
 * Orígenes admitidos por CORS — fuente única.
 *
 * `CORS_ORIGIN` acepta varias URLs separadas por comas, porque las dos sedes pueden
 * servirse desde dominios distintos contra la misma API.
 *
 * Vive aquí y no en `main.ts` porque hay un segundo sitio que necesita la misma lista: el
 * flujo de eventos en tiempo real toma el socket con `hijack()` y se salta el CORS del
 * marco de trabajo, así que escribe la cabecera a mano. Con dos listas separadas bastaría
 * con añadir un dominio en una para que el tiempo real dejara de funcionar sin más aviso.
 */

const DEFAULT_URL = 'http://localhost:3100';

export function allowedOrigins(config: ConfigService): string[] {
  return (config.get<string>('CORS_ORIGIN') ?? DEFAULT_URL)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Devuelve el origen de la petición si está admitido, o `null` si no.
 * Se responde con el origen exacto —no con `*`— porque la petición lleva credenciales.
 */
export function allowedOrigin(config: ConfigService, origin: string | undefined): string | null {
  if (!origin) return null;
  const cleaned = origin.replace(/\/+$/, '');
  return allowedOrigins(config).includes(cleaned) ? origin : null;
}
