import { useCallback, useEffect, useState } from 'react';

/** Segundos enteros que faltan hasta `deadline`; nunca negativos. */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export interface Countdown {
  secondsLeft: number;
  /** Todavía no se puede repetir la acción. */
  waiting: boolean;
  /** Empieza a contar. `start(0)` no hace nada, así que admite `retryAfterSeconds(error)` tal cual. */
  start: (seconds: number) => void;
  /** El texto del botón, o lo que falta para poder pulsarlo otra vez. */
  label: (text: string) => string;
}

/**
 * Cuenta atrás en segundos para una acción que no se puede repetir todavía: reenviar un
 * código, o volver a intentarlo tras exceder el límite de intentos del servidor.
 *
 * Se mide contra la hora de fin y no restando de uno en uno, porque el navegador frena los
 * temporizadores de las pestañas en segundo plano: al volver, la cuenta sigue siendo exacta.
 */
export function useCountdown(): Countdown {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (deadline === null) return;

    const tick = () => {
      const left = secondsUntil(deadline, Date.now());
      setSecondsLeft(left);
      if (left === 0) setDeadline(null);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const start = useCallback((seconds: number) => {
    if (seconds > 0) setDeadline(Date.now() + seconds * 1000);
  }, []);

  const waiting = secondsLeft > 0;
  const label = (text: string) => (waiting ? `Espera ${secondsLeft} s` : text);

  return { secondsLeft, waiting, start, label };
}
