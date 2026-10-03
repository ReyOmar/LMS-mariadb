'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Aparición suave al entrar en pantalla.
 *
 * Respeta `prefers-reduced-motion`: quien haya pedido menos animación en su sistema ve el
 * contenido directamente, sin desplazamiento ni transición.
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Retraso en segundos, para escalonar una rejilla de tarjetas. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setAnimate(false);
      setVisible(true);
      return;
    }

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        // Una vez mostrado no hace falta seguir observando.
        observer.disconnect();
      },
      { threshold: 0.15 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        animate
          ? {
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(40px)',
              transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
