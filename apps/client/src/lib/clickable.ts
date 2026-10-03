import type { KeyboardEvent } from 'react';

/**
 * Props para que un elemento pulsable que no es un botón —una tarjeta, una fila— responda
 * también al teclado: se puede alcanzar con el tabulador y se activa con Intro o Espacio.
 *
 * @param role `button` por defecto. En una fila de tabla se pasa `row` para no romper la
 *        estructura de la tabla que leen los lectores de pantalla.
 */
export function clickable(onActivate: () => void, role: 'button' | 'link' | 'row' = 'button') {
  return {
    role,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
