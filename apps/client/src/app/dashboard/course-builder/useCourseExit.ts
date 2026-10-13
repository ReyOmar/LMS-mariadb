'use client';

import { useState } from 'react';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { staysInCourse } from './components/exit';

interface Options {
  courseGuid: string;
  isDraft: boolean;
  publish: () => Promise<boolean>;
  /** Sale hacia `destination` o, sin él, adonde lleva el botón de volver. */
  leave: (destination?: string) => void;
}

/** Salir de un curso en borrador pasa por un aviso: nadie lo verá mientras siga así. */
export function useCourseExit({ courseGuid, isDraft, publish, leave }: Options) {
  // `destination` vacío: se pulsó el botón de volver y no un enlace.
  const [pendingExit, setPendingExit] = useState<{ destination?: string } | null>(null);

  useLeaveGuard(isDraft, {
    warning: 'El curso sigue en Borrador y los alumnos no lo verán. ¿Salir igualmente?',
    onLeave: (destination) => setPendingExit({ destination }),
    stays: (destination) => staysInCourse(destination, courseGuid),
  });

  const exit = () => {
    const destination = pendingExit?.destination;
    setPendingExit(null);
    leave(destination);
  };

  return {
    asking: pendingExit !== null,
    tryToLeave: () => (isDraft ? setPendingExit({}) : leave()),
    // Si no se pudo publicar, se sigue en el curso con el aviso abierto.
    publishAndLeave: async () => {
      if (await publish()) exit();
    },
    leaveWithoutPublishing: exit,
    stay: () => setPendingExit(null),
  };
}
