/**
 * Acceso al almacenamiento del navegador que nunca lanza.
 *
 * En modo privado, con el almacenamiento lleno o bloqueado, `localStorage` lanza al leer o
 * escribir. Nada de lo que se guarda aquí es imprescindible —sesión, preferencias, cachés,
 * borradores—, así que un fallo se trata como «no hay nada guardado».
 */

export function readLocal(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento el dato dura lo que la pestaña.
  }
}

export function removeLocal(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nada que limpiar.
  }
}

/** Lee un valor guardado como JSON; si falta o está dañado devuelve null. */
export function readLocalJson<T>(key: string): T | null {
  const raw = readLocal(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
