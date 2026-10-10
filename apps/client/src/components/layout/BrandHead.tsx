'use client';

import { fileUrlFor } from '@/lib/api';
import { useConfig } from '@/contexts/ConfigContext';

const DEFAULT_TITLE = 'Campus Virtual PESV';

const DEFAULT_ICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
  "<circle cx='50' cy='50' r='50' fill='%231e3a8a'/>" +
  "<text x='50' y='68' font-family='Arial' font-size='42' font-weight='bold' fill='white' text-anchor='middle'>P</text></svg>";

/**
 * Título de la pestaña e icono de la sede activa.
 *
 * Dependen de la sede que elija el visitante, que sólo se conoce en el navegador, así que no
 * pueden ir en los metadatos del servidor: Next.js los vuelve a escribir en cada navegación
 * y taparía la marca de la sede. Pintados desde aquí, React los coloca en el `<head>` y los
 * mantiene al día con la configuración, con un valor genérico mientras no ha llegado.
 */
export function BrandHead() {
  const { config } = useConfig();

  return (
    <>
      <title>{config?.platformName || DEFAULT_TITLE}</title>
      <link rel="icon" href={fileUrlFor(config?.faviconUrl) ?? DEFAULT_ICON} />
    </>
  );
}
