import type { Resource } from '@/types/models';

/**
 * Convenciones de los recursos de un módulo, en un único sitio.
 *
 * Las comparte todo el que pinta un recurso: el constructor, su vista previa, el temario y
 * la pantalla del alumno, para que todos interpreten igual un mismo recurso.
 */

/** Un cuestionario no tiene tipo propio: es un `ASSIGNMENT` cuyo título lleva esta marca. */
const QUIZ_MARKER = '[QUIZ]';

/** La marca al principio del título con lo que la separa de él; la API la quita igual. */
const LEADING_QUIZ_MARKER = /^\[QUIZ\]\s*/;

type IdentifiableResource = Pick<Resource, 'type' | 'title'>;

export function isQuiz(resource?: IdentifiableResource | null): boolean {
  return resource?.type === 'ASSIGNMENT' && Boolean(resource.title?.startsWith(QUIZ_MARKER));
}

/** El título con la marca interna puesta, tal y como se guarda. */
export function quizTitleOf(title: string): string {
  return `${QUIZ_MARKER} ${title}`;
}

/** Título sin la marca interna: es el que se enseña en pantalla. */
export function displayTitle(resource: IdentifiableResource): string {
  return isQuiz(resource) ? resource.title.replace(LEADING_QUIZ_MARKER, '') : resource.title;
}

/**
 * Completa el esquema de una dirección escrita a mano.
 * Sin esto, `www.ejemplo.com` se interpretaría como una ruta dentro del campus.
 */
export function externalUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith('//')) return url;
  return `https://${url}`;
}

/** Identificador de vídeo de YouTube, o `null` si la URL no es de YouTube. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('youtube.com/watch?v=')) {
    try {
      return new URL(url).searchParams.get('v');
    } catch {
      return null;
    }
  }
  if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].split('?')[0] || null;
  return null;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;

/** Una imagen puede venir incrustada como `data:` o subida al almacenamiento con su extensión. */
export function isImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('data:image') || IMAGE_EXTENSIONS.test(url);
}

/**
 * Qué hay realmente detrás de un recurso `LINK`.
 *
 * El constructor guarda la dirección en `contentHtml`. Los bloques antiguos la tienen en
 * `fileUrl`, a veces como imagen incrustada (`data:image/…`) y a veces como archivo del
 * almacenamiento, que sólo se abre con la URL firmada que manda la API (`fileDownloadUrl`).
 */
export type LinkTarget =
  | { kind: 'empty' }
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string; video: string }
  | { kind: 'link'; url: string };

export function linkTarget(resource: Pick<Resource, 'contentHtml' | 'fileUrl' | 'fileDownloadUrl'>): LinkTarget {
  const url = (resource.contentHtml || resource.fileDownloadUrl || resource.fileUrl || '').trim();
  if (!url) return { kind: 'empty' };

  if (isImage(url)) return { kind: 'image', url };

  const video = youtubeVideoId(url);
  if (video) return { kind: 'video', url, video };

  return { kind: 'link', url: externalUrl(url) };
}
