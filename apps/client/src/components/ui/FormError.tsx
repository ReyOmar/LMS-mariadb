'use client';

import { useEffect, useRef } from 'react';

/**
 * Por qué no se pudo enviar un formulario. Sin mensaje no ocupa sitio. Va encima del formulario,
 * así que al aparecer se lleva a la vista: en un móvil, quien envió desde abajo no lo vería.
 */
export function FormError({ message, className = '' }: { message: string; className?: string }) {
  const box = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [message]);

  if (!message) return null;

  return (
    <p
      ref={box}
      role="alert"
      className={`rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400 ${className}`}
    >
      {message}
    </p>
  );
}
