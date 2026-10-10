import type { FocusEvent } from 'react';

/**
 * Guarda un nombre al salir del campo. Uno vacío no se envía —el servidor lo rechazaría y el
 * campo se quedaría en blanco—: vuelve el que tenía.
 */
export function saveNameOnBlur(saved: string, save: (name: string) => void) {
  return (event: FocusEvent<HTMLInputElement>) => {
    const name = event.target.value.trim();
    if (!name) {
      event.target.value = saved;
      return;
    }
    save(name);
  };
}
