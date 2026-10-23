import type { FocusEvent } from 'react';

/** Títulos de cursos, módulos y recursos: lo que admite la API. */
export const MAX_TITLE_LENGTH = 191;

/**
 * Guarda un nombre al salir del campo. Uno vacío no se envía —el servidor lo rechazaría y el
 * campo se quedaría en blanco—, y si el servidor rechaza el nuevo, vuelve el que tenía.
 */
export function saveNameOnBlur(saved: string, save: (name: string) => Promise<boolean>) {
  return async (event: FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const name = input.value.trim();
    if (!name || !(await save(name))) input.value = saved;
  };
}
