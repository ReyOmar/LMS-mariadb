'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Aparición suave al entrar en pantalla.
 *
 * Respeta `prefers-reduced-motion`: quien haya pedido menos animación en su sistema ve el
 * contenido directamente, sin desplazamiento ni transición.
 */
export function FadeIn({
  children,
  className = '',
  retraso = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Retraso en segundos, para escalonar una rejilla de tarjetas. */
  retraso?: number;
}) {
  const referencia = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [animar, setAnimar] = useState(true);

  useEffect(() => {
    const prefiereMenosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefiereMenosMovimiento) {
      setAnimar(false);
      setVisible(true);
      return;
    }

    const elemento = referencia.current;
    if (!elemento) return;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        setVisible(true);
        // Una vez mostrado no hace falta seguir observando.
        observador.disconnect();
      },
      { threshold: 0.15 },
    );

    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={referencia}
      className={className}
      style={
        animar
          ? {
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(40px)',
              transition: `opacity 0.7s ease ${retraso}s, transform 0.7s ease ${retraso}s`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
