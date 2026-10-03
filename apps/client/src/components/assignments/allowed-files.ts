/** Formatos que un alumno puede entregar en una tarea. */
export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.zip',
  '.rar',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp4',
  '.mp3',
];

/** Extensión en minúsculas y con su punto (`.pdf`), o cadena vacía si el nombre no tiene. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot).toLowerCase();
}

/**
 * Aviso para el alumno si el archivo no es de un formato admitido, o `null` si lo es.
 * Se comprueba antes de subir para no hacerle esperar una subida que se va a rechazar.
 */
export function fileTypeWarning(fileName: string): string | null {
  const extension = extensionOf(fileName);
  if (extension && ALLOWED_EXTENSIONS.includes(extension)) return null;

  const readableList = ALLOWED_EXTENSIONS.map((e) => e.slice(1).toUpperCase()).join(', ');
  return `El tipo de archivo "${extension || 'desconocido'}" no es compatible. Formatos permitidos: ${readableList}.`;
}
