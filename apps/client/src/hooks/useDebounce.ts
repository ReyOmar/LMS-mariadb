import { useState, useEffect } from 'react';

/**
 * Retrasa un valor hasta que deja de cambiar durante `delay` milisegundos.
 *
 * Se usa en los buscadores: sin esto, cada tecla dispara una consulta y la pantalla
 * parpadea con resultados que ya no interesan.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
