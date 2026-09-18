/**
 * Aplicación del tema de la sede al documento.
 *
 * La marca (color, tipografía, redondeo, favicon) es configurable por sede desde el panel
 * de administración, así que se aplica en tiempo de ejecución sobre variables CSS. Esta
 * lógica estaba mezclada dentro del contexto de configuración; separada, el contexto se
 * ocupa sólo de traer los datos y esto de pintarlos.
 */

import { urlAbsoluta } from './env';

export interface TemaSede {
  nombre_plataforma?: string;
  color_primario?: string;
  color_secundario?: string;
  fuente?: string;
  border_radius?: number;
  favicon_url?: string | null;
}

/** Tipografías admitidas en el selector del panel. */
export const FUENTES = ['Inter', 'Roboto', 'Montserrat', 'Poppins', 'Outfit', 'Open Sans', 'Lato'] as const;

const ID_ESTILOS = 'lms-tema';
const ID_FAVICON = 'lms-favicon';

/** Convierte `#RRGGBB` al triplete HSL que esperan las variables de Tailwind. */
export function hexAHsl(hex: string): string | null {
  const limpio = hex.replace(/^#/, '');
  const completo = limpio.length === 3 ? [...limpio].map((c) => c + c).join('') : limpio;
  if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null;

  const r = parseInt(completo.slice(0, 2), 16) / 255;
  const g = parseInt(completo.slice(2, 4), 16) / 255;
  const b = parseInt(completo.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return `0 0% ${Math.round(l * 100)}%`;

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Carga una tipografía de Google una sola vez por nombre. */
function cargarFuente(nombre: string): void {
  const id = `fuente-${nombre.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;

  const enlace = document.createElement('link');
  enlace.id = id;
  enlace.rel = 'stylesheet';
  enlace.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(nombre)}:wght@300;400;500;600;700;800;900&display=swap`;
  document.head.appendChild(enlace);
}

/**
 * Escribe las variables del tema en un único bloque de estilos.
 *
 * Tailwind v4 resuelve `--radius` en tiempo de compilación, de modo que fijar la variable
 * desde JavaScript no basta; hace falta una regla con la misma especificidad que la
 * sobrescriba. Por eso el bloque `<style>` y no sólo `style.setProperty`.
 */
export function aplicarTema(tema: TemaSede): void {
  if (typeof document === 'undefined') return;

  const raiz = document.documentElement;

  const primario = tema.color_primario ? hexAHsl(tema.color_primario) : null;
  if (primario) {
    raiz.style.setProperty('--primary', primario);
    raiz.style.setProperty('--ring', primario);
  }

  const secundario = tema.color_secundario ? hexAHsl(tema.color_secundario) : null;
  if (secundario) raiz.style.setProperty('--secondary', secundario);

  const familia = tema.fuente ? `"${tema.fuente}", ui-sans-serif, system-ui, sans-serif` : null;
  if (tema.fuente) {
    cargarFuente(tema.fuente);
    raiz.style.setProperty('--font-sans', familia!);
  }

  const radio = tema.border_radius ?? 12;
  const escalar = (delta: number) => `${Math.max(0, radio + delta)}px`;

  let estilos = document.getElementById(ID_ESTILOS) as HTMLStyleElement | null;
  if (!estilos) {
    estilos = document.createElement('style');
    estilos.id = ID_ESTILOS;
    document.head.appendChild(estilos);
  }

  estilos.textContent = `
    :root {
      --radius: ${radio}px;
      --radius-sm: ${escalar(-4)};
      --radius-md: ${escalar(-2)};
      --radius-lg: ${radio}px;
      --radius-xl: ${escalar(4)};
      --radius-2xl: ${escalar(8)};
      --radius-3xl: ${escalar(12)};
      --radius-4xl: ${escalar(16)};
    }
    ${familia ? `body { font-family: ${familia}; }` : ''}
  `;

  aplicarFavicon(tema.favicon_url);

  if (tema.nombre_plataforma) document.title = tema.nombre_plataforma;
}

/**
 * Sustituye el favicon por el de la sede.
 * Next.js genera el suyo en el HTML del servidor, así que hay que retirarlo para que el
 * navegador no se quede con el primero que encuentra.
 */
function aplicarFavicon(clave: string | null | undefined): void {
  const propio = document.getElementById(ID_FAVICON) as HTMLLinkElement | null;

  if (!clave) {
    propio?.remove();
    return;
  }

  document
    .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
    .forEach((elemento) => {
      if (elemento.id !== ID_FAVICON) elemento.remove();
    });

  const enlace = propio ?? document.createElement('link');
  enlace.id = ID_FAVICON;
  enlace.rel = 'icon';
  enlace.href = urlAbsoluta(clave.startsWith('/') ? clave : `/api/storage/download/${clave}`);
  if (!propio) document.head.appendChild(enlace);
}
