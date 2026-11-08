/**
 * Acceso al almacenamiento del navegador que nunca lanza.
 *
 * En modo privado, con el almacenamiento lleno o bloqueado, `localStorage` y `sessionStorage`
 * lanzan al leer o escribir. Nada de lo que se guarda aquí es imprescindible —sesión,
 * preferencias, cachés, borradores—, así que un fallo se trata como «no hay nada guardado».
 */

type Area = 'localStorage' | 'sessionStorage';

function browserStorage(area: Area) {
  const read = (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window[area].getItem(key);
    } catch {
      return null;
    }
  };

  return {
    read,
    write(key: string, value: string): void {
      try {
        window[area].setItem(key, value);
      } catch {
        // Sin almacenamiento el dato dura lo que la página.
      }
    },
    remove(key: string): void {
      try {
        window[area].removeItem(key);
      } catch {
        // Nada que limpiar.
      }
    },
    /** Lee un valor guardado como JSON; si falta o está dañado devuelve null. */
    readJson<T>(key: string): T | null {
      const raw = read(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
  };
}

/** Lo que se conserva en el navegador hasta que se borra: preferencias, cachés y borradores. */
export const {
  read: readLocal,
  write: writeLocal,
  remove: removeLocal,
  readJson: readLocalJson,
} = browserStorage('localStorage');

/** Lo que dura lo que la pestaña: cada una tiene lo suyo, sobrevive a recargarla y se borra al cerrarla. */
export const tabStorage = browserStorage('sessionStorage');
