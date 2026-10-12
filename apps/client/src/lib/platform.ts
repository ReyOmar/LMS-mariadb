/** El nombre con el que la API crea cada sede. */
export const DEFAULT_PLATFORM_NAME = 'PESV Education';

/** Nombre de la plataforma de la sede; vacío o sin cargar, el de serie. */
export function platformNameOf(config: { platformName?: string | null } | null | undefined): string {
  return config?.platformName?.trim() || DEFAULT_PLATFORM_NAME;
}
