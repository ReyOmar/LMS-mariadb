'use client';

import { useEffect, useState, useRef, ReactNode } from 'react';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';

type StatColor = 'primary' | 'accent' | 'success' | 'info' | 'warning' | 'destructive';

interface StatProps {
  label: string;
  value: number;
  suffix?: string;
  icon: ReactNode;
  color?: StatColor;
  /** Línea bajo la cifra que la explica; el tono sólo colorea el texto. */
  detail?: { text: string; tone?: 'neutral' | 'success' | 'warning' };
  href?: string;
  className?: string;
}

const COLOR_CLASSES: Record<StatColor, { bg: string; text: string; glow: string }> = {
  primary: {
    bg: 'from-primary/15 to-primary/5',
    text: 'text-primary',
    glow: 'group-hover:shadow-[var(--shadow-glow-primary)]',
  },
  accent: {
    bg: 'from-accent/15 to-accent/5',
    text: 'text-accent',
    glow: 'group-hover:shadow-[var(--shadow-glow-accent)]',
  },
  success: {
    bg: 'from-success/15 to-success/5',
    text: 'text-success',
    glow: 'group-hover:shadow-[var(--shadow-glow-success)]',
  },
  info: { bg: 'from-info/15 to-info/5', text: 'text-info', glow: 'group-hover:shadow-[var(--shadow-glow-primary)]' },
  warning: {
    bg: 'from-warning/15 to-warning/5',
    text: 'text-warning',
    glow: 'group-hover:shadow-[var(--shadow-glow-accent)]',
  },
  destructive: { bg: 'from-destructive/15 to-destructive/5', text: 'text-destructive', glow: '' },
};

/** ¿El sistema pide reducir las animaciones? */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * ¿Merece la pena animar la cuenta, o se enseña la cifra directamente?
 *
 * Está aparte del hook para poder comprobarse sin montar un navegador. Lo que decide no
 * es estético: si se anima cuando no se debe, el número se queda en cero.
 */
export function shouldAnimateCount(target: number, reducedMotion: boolean, tabHidden: boolean): boolean {
  if (target === 0) return false;
  if (reducedMotion) return false;
  // Una pestaña que no se pinta no avanza la cuenta; mejor la cifra sin animación.
  return !tabHidden;
}

/** Cada cuánto avanza la cuenta. A 16 ms el movimiento se ve continuo. */
const STEP_MS = 16;

/**
 * Cuenta desde cero hasta la cifra, para que el panel no aparezca de golpe.
 *
 * Tres detalles que no son cosméticos:
 *  - Se conserva el decimal cuando lo hay: una calificación media de 67,5 es una nota, no
 *    un recuento, y no puede verse como 67.
 *  - Quien pide menos movimiento ve la cifra final directamente, sin animación.
 *  - La cifra **nunca** depende de que la animación llegue a ejecutarse: se anima con un
 *    temporizador —`requestAnimationFrame` no corre en una pestaña de fondo— y, si la
 *    pestaña está oculta, se enseña el número de una vez.
 */
function useCountUp(target: number, duration = 600): number {
  // Arranca en cero para que la cuenta se vea; empezar en la cifra final la enseñaría un
  // instante antes de saltar a cero.
  const [value, setValue] = useState(0);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!shouldAnimateCount(target, prefersReducedMotion(), document.hidden)) {
      setValue(target);
      return;
    }

    const decimals = Number.isInteger(target) ? 0 : 1;
    const start = Date.now();

    const stop = () => {
      if (clockRef.current !== null) clearInterval(clockRef.current);
      clockRef.current = null;
    };

    const step = () => {
      const progress = Math.min((Date.now() - start) / duration, 1);
      if (progress >= 1) {
        // El último valor es exactamente el objetivo, sin arrastrar el redondeo.
        setValue(target);
        stop();
        return;
      }
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Number((eased * target).toFixed(decimals)));
    };

    clockRef.current = setInterval(step, STEP_MS);
    return stop;
  }, [target, duration]);

  return value;
}

/** Color del texto de detalle según lo que indica. */
const DETAIL_TONE = {
  neutral: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-amber-700 dark:text-amber-400',
} as const;

export function HighlightedStat({
  label,
  value,
  suffix,
  icon,
  color = 'primary',
  detail,
  href,
  className = '',
}: StatProps) {
  const animatedValue = useCountUp(value);
  const { country } = useCountry();
  const colors = COLOR_CLASSES[color];

  const Wrapper = href ? 'a' : 'div';

  return (
    <Wrapper
      {...(href ? { href } : {})}
      className={`
        relative overflow-hidden rounded-2xl border border-border/50 p-5
        bg-card/70 backdrop-blur-md
        transition-all duration-300 group block
        hover:border-current/20 card-interactive
        ${colors.glow} ${className}
      `}
    >
      {/* Halo de fondo */}
      <div
        className={`absolute -top-8 -right-8 h-28 w-28 rounded-full bg-gradient-to-br ${colors.bg} blur-2xl group-hover:scale-150 transition-transform duration-500 pointer-events-none`}
      />

      <div className="relative z-10 flex justify-between items-start">
        <div>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
          <p className="text-3xl font-extrabold tracking-tight">
            {formatNumber(animatedValue, country)}
            {suffix && <span className="text-base font-medium text-muted-foreground ml-0.5">{suffix}</span>}
          </p>
          {detail && (
            <p className={`text-xs font-semibold mt-2 ${DETAIL_TONE[detail.tone ?? 'neutral']}`}>{detail.text}</p>
          )}
        </div>
        <div
          className={`p-2.5 rounded-xl bg-gradient-to-br ${colors.bg} group-hover:scale-110 transition-transform duration-200`}
        >
          <span className={colors.text}>{icon}</span>
        </div>
      </div>
    </Wrapper>
  );
}
