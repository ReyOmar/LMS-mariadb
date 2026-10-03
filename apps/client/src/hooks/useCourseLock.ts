'use client';

import { useEffect } from 'react';
import api, { sendKeepalive } from '@/lib/api';
import { useRealtime } from '@/contexts/RealtimeContext';
import { useSession } from '@/contexts/SessionContext';
import type { CourseEditor } from '@/lib/realtime/events';

/**
 * Aviso de «estoy editando este curso».
 *
 * Es un bloqueo cooperativo de interfaz: sirve para que dos administradores no trabajen a
 * la vez sobre el mismo curso sin saberlo. La consistencia real la garantiza otra regla —
 * un curso sólo se modifica en estado Borrador—, así que un fallo de red aquí no corrompe
 * nada, sólo deja de avisar.
 *
 * @returns Quién tiene el curso tomado, o `null` si está libre o lo tienes tú.
 */
export function useCourseLock(courseGuid: string | undefined): CourseEditor | null {
  const { coursesBeingEdited } = useRealtime();
  const { user } = useSession();

  useEffect(() => {
    if (!courseGuid) return;

    let released = false;
    const lockPath = `/realtime/courses/${courseGuid}/lock`;

    void api.post(lockPath).catch(() => {
      // Si no se puede tomar el aviso, se sigue editando: es informativo.
    });

    // Con `keepalive` la petición sale aunque la pestaña se esté cerrando; si no, el aviso
    // seguiría puesto mientras el usuario tenga otra pestaña del campus abierta.
    const release = () => {
      if (released) return;
      released = true;
      sendKeepalive('DELETE', lockPath);
    };

    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [courseGuid]);

  if (!courseGuid) return null;

  const editor = coursesBeingEdited[courseGuid];
  // Tenerlo uno mismo no es un bloqueo: no hay nada que avisar.
  return editor && editor.guid !== user?.guid ? editor : null;
}
