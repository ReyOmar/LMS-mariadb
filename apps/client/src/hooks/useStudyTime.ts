'use client';

import { useEffect, useRef } from 'react';
import api from '@/lib/api';

/**
 * Cada cuánto se avisa al servidor de que el alumno sigue trabajando.
 *
 * El servidor suma el tiempo transcurrido entre avisos, así que este intervalo sólo decide
 * la precisión de la medida, no su resultado.
 */
const INTERVAL_MS = 60_000;

/**
 * Tiempo sin tocar nada tras el cual se deja de contar.
 *
 * Es la diferencia entre «tener el curso abierto» y «estar haciendo el curso». Alguien que
 * deja la pestaña abierta mientras almuerza no está capacitándose, y ese tiempo no puede
 * acabar en su panel ni en el seguimiento del examinador como si lo estuviera.
 *
 * Dos minutos dan margen para leer un texto largo o ver un vídeo sin que se corte la
 * cuenta —basta mover el ratón o pulsar una tecla para seguir—, y a la vez impiden que una
 * pestaña olvidada sume horas.
 */
const INACTIVITY_MS = 2 * 60_000;

/** Señales que indican que la persona está delante y haciendo algo. */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;

/**
 * ¿Cuenta este minuto como tiempo de capacitación?
 *
 * Sólo si la persona tiene el curso a la vista **y** ha hecho algo hace poco. Está aparte
 * del hook para poder comprobarse sin montar un navegador.
 */
export function countsAsStudy(now: number, lastInteraction: number, tabHidden: boolean): boolean {
  if (tabHidden) return false;
  return now - lastInteraction <= INACTIVITY_MS;
}

/**
 * Cuenta el tiempo que el alumno dedica realmente a un curso.
 *
 * Sólo late mientras la pestaña está visible **y** ha habido interacción reciente: un curso
 * abierto y olvidado no acumula horas.
 *
 * @param courseGuid Curso que se está haciendo, o `null` para no contar nada.
 * @param active     `false` en modo repaso: revisar un curso ya terminado no es capacitarse.
 */
export function useStudyTime(courseGuid: string | null, active: boolean): void {
  const lastInteraction = useRef(Date.now());

  useEffect(() => {
    if (!courseGuid || !active) return;

    const recordInteraction = () => {
      lastInteraction.current = Date.now();
    };

    // Volver a la pestaña cuenta como interacción: se estaba en otra cosa y se retoma.
    const onVisibilityChange = () => {
      if (!document.hidden) recordInteraction();
    };

    for (const signal of ACTIVITY_EVENTS) {
      window.addEventListener(signal, recordInteraction, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    const sendHeartbeat = () => {
      if (!countsAsStudy(Date.now(), lastInteraction.current, document.hidden)) return;

      // Un fallo de red aquí no merece molestar a nadie: se pierde un minuto de la cuenta.
      void api.post('/students/heartbeat', { courseGuid }).catch(() => undefined);
    };

    sendHeartbeat();
    const clock = setInterval(sendHeartbeat, INTERVAL_MS);

    return () => {
      clearInterval(clock);
      for (const signal of ACTIVITY_EVENTS) window.removeEventListener(signal, recordInteraction);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [courseGuid, active]);
}
