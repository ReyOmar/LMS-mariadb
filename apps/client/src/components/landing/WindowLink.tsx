import type { MouseEvent, ReactNode } from 'react';
import Link from 'next/link';

/** Un clic normal; con una tecla o la rueda, quien pulsa quiere el enlace en otra pestaña. */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Enlace a una página que en la portada se abre como ventana: el acceso (`/login`) o los
 * textos legales (`/legal#…`). Con un clic normal abre la ventana; en otra pestaña, o si la
 * ventana no puede abrirse, sigue llevando a su página.
 */
export function WindowLink({
  href,
  onOpen,
  className,
  children,
}: {
  href: string;
  onOpen: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onOpen();
      }}
    >
      {children}
    </Link>
  );
}
