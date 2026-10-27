import { ConfigService } from '@nestjs/config';

/**
 * Dirección pública del campus, sin barra final. Lo que sale del servidor —el enlace de un correo,
 * la respuesta a otro sistema— tiene que llevarla completa.
 */
export function campusUrl(config: ConfigService): string {
  return (config.get<string>('APP_URL')?.trim() || 'http://localhost:3100').replace(/\/+$/, '');
}
