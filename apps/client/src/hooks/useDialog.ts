'use client';

import { useEffect, useId, useRef } from 'react';

/**
 * Ventanas modales accesibles.
 *
 * Mientras una ventana está abierta: el foco entra en ella, Tab y Mayús+Tab dan la vuelta
 * sin salir, Escape la cierra (salvo que sea obligatoria), el resto de la página queda
 * inerte y sin desplazamiento y, al cerrarla, el foco vuelve a quien la abrió. Si se abre
 * una sobre otra, sólo manda la de arriba.
 *
 * El hook no pinta nada: se aplica sobre el marcado que ya tiene cada ventana.
 *
 * ```tsx
 * const { dialogProps, titleId } = useDialog({ onClose });
 * <div {...dialogProps} className="…"><h2 id={titleId}>…</h2>…</div>
 * ```
 *
 * Lo que deba seguir activo detrás de las ventanas (el fondo que cierra el menú al pulsarlo,
 * los avisos pasajeros) lleva el atributo `data-keep-active`.
 */

const KEEP_ACTIVE = 'data-keep-active';

/** Lo que el navegador puede enfocar; `tabbableIn` descarta después lo que Tab no alcanza. */
const FOCUSABLE =
  'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable="true"], [tabindex]';

/** Ventanas abiertas, de la más antigua a la de arriba. */
const openDialogs: HTMLElement[] = [];
/** Lo que se volvió inerte por la ventana de arriba, para devolverlo luego tal como estaba. */
let inertElements: HTMLElement[] = [];
/** Estilos del `body` antes de bloquear el desplazamiento; `null` si no está bloqueado. */
let bodyStyle: { overflow: string; paddingRight: string } | null = null;

interface DialogOptions {
  /** Si la ventana está abierta. Por defecto, mientras el componente esté montado. */
  open?: boolean;
  /** Cierre con Escape. Sin él la ventana es obligatoria: Escape no hace nada. */
  onClose?: () => void;
  role?: 'dialog' | 'alertdialog';
  /** Nombre accesible para las ventanas sin un título visible al que apuntar con `titleId`. */
  label?: string;
}

export function useDialog<T extends HTMLElement = HTMLDivElement>({
  open = true,
  onClose,
  role = 'dialog',
  label,
}: DialogOptions = {}) {
  const ref = useRef<T>(null);
  const titleId = useId();
  // El cierre se lee al pulsar Escape: así cambiar de función no vuelve a abrir la ventana.
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;

    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;

    openDialogs.push(dialog);
    isolateTopDialog();
    if (!dialog.contains(document.activeElement)) focusInitial(dialog);

    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== dialog || event.defaultPrevented || event.isComposing) return;

      if (event.key === 'Escape') {
        if (!closeRef.current) return;
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const tabbable = tabbableIn(dialog);
      if (tabbable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const current = tabbable.indexOf(document.activeElement as HTMLElement);
      const next = wrapFocusIndex(tabbable.length, current, event.shiftKey);
      if (next === null) return;
      event.preventDefault();
      tabbable[next].focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      isolateTopDialog();

      const top = openDialogs.at(-1);
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus();
      else if (top && !top.contains(document.activeElement)) focusInitial(top);
    };
  }, [open]);

  const naming = label ? { 'aria-label': label } : { 'aria-labelledby': titleId };
  const dialogProps = open ? { ref, role, 'aria-modal': true as const, tabIndex: -1, ...naming } : { ref };

  return { dialogProps, titleId };
}

/** Deja activa sólo la ventana de arriba y bloquea el desplazamiento mientras haya alguna. */
function isolateTopDialog() {
  for (const element of inertElements) element.inert = false;

  const top = openDialogs.at(-1);
  inertElements = top
    ? elementsOutside(top, document.body).filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && !element.inert && !element.hasAttribute(KEEP_ACTIVE),
      )
    : [];
  for (const element of inertElements) element.inert = true;

  const { body } = document;
  if (top && !bodyStyle) {
    bodyStyle = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    // Sin la barra de desplazamiento la página se ensancharía y el contenido daría un salto.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  } else if (!top && bodyStyle) {
    body.style.overflow = bodyStyle.overflow;
    body.style.paddingRight = bodyStyle.paddingRight;
    bodyStyle = null;
  }
}

function focusInitial(dialog: HTMLElement) {
  (tabbableIn(dialog)[0] ?? dialog).focus();
}

/** Elementos que Tab alcanza dentro de la ventana, en el orden del documento. */
function tabbableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      !element.closest('[inert]') &&
      element.getClientRects().length > 0,
  );
}

/**
 * Adónde lleva Tab dentro de una ventana con `count` elementos alcanzables, estando el foco
 * en la posición `current` (-1 si no está en ninguno de ellos).
 *
 * Devuelve la posición a la que saltar, o `null` si el navegador puede seguir su orden
 * normal sin salirse de la ventana.
 */
export function wrapFocusIndex(count: number, current: number, backwards: boolean): number | null {
  if (count === 0) return null;
  const last = count - 1;
  if (current < 0) return backwards ? last : 0;
  if (backwards) return current === 0 ? last : null;
  return current === last ? 0 : null;
}

/**
 * Todo lo que queda fuera de la ventana: los hermanos de ella y de cada uno de sus
 * antecesores hasta `root`. Los antecesores no se incluyen, porque contienen la ventana.
 */
export function elementsOutside(dialog: Element, root: Element): Element[] {
  const outside: Element[] = [];
  for (let node: Element = dialog; node !== root && node.parentElement; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling !== node) outside.push(sibling);
    }
  }
  return outside;
}
