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
  const editor = courseGuid ? coursesBeingEdited[courseGuid] : undefined;
  const isFree = courseGuid !== undefined && !editor;

  // Se pide al entrar y cada vez que queda libre: si quien lo tenía sale, lo hereda quien sigue
  // dentro, y no quien vuelva a entrar después.
  useEffect(() => {
    if (!courseGuid || !isFree) return;
    void api.post(`/realtime/courses/${courseGuid}/lock`).catch(() => {
      // Si no se puede tomar el aviso, se sigue editando: es informativo.
    });
  }, [courseGuid, isFree]);

  useEffect(() => {
    if (!courseGuid) return;

    let released = false;
    // Con `keepalive` la petición sale aunque la pestaña se esté cerrando; si no, el aviso
    // seguiría puesto mientras el usuario tenga otra pestaña del campus abierta. Si no lo
    // tenía uno mismo, la API no suelta nada.
    const release = () => {
      if (released) return;
      released = true;
      sendKeepalive('DELETE', `/realtime/courses/${courseGuid}/lock`);
    };

    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [courseGuid]);

  // Tenerlo uno mismo no es un bloqueo: no hay nada que avisar.
  return editor && editor.guid !== user?.guid ? editor : null;
}
