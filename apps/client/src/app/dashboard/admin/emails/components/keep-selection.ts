import type { MouseEvent } from 'react';

/**
 * Props de un botón que actúa sobre el texto seleccionado sin quitarle el foco: con el ratón en
 * `mousedown`, antes de que el foco salte; con el teclado sólo llega `click`, con `detail` a cero.
 */
export function keepingSelection(action: () => void) {
  return {
    onMouseDown: (event: MouseEvent) => {
      event.preventDefault();
      action();
    },
    onClick: (event: MouseEvent) => {
      if (event.detail === 0) action();
    },
  };
}
