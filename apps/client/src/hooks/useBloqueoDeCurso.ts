'use client';

import { useEffect } from 'react';
import api from '@/lib/api';
import { useRealtime } from '@/contexts/RealtimeContext';
import { useRole } from '@/contexts/RoleContext';
import type { EditorDeCurso } from '@/lib/realtime/eventos';

/**
 * Aviso de «estoy editando este curso».
 *
 * Es un bloqueo cooperativo de interfaz: sirve para que dos administradores no trabajen a
 * la vez sobre el mismo curso sin saberlo. La consistencia real la garantiza otra regla —
 * un curso sólo se modifica en estado Borrador—, así que un fallo de red aquí no corrompe
 * nada, sólo deja de avisar.
 *
 * Antes esto viajaba como mensaje de WebSocket. Al pasar el tiempo real a SSE, que es
 * unidireccional, se convirtió en dos peticiones HTTP normales.
 *
 * @returns Quién tiene el curso tomado, o `null` si está libre o lo tienes tú.
 */
export function useBloqueoDeCurso(cursoGuid: string | undefined): EditorDeCurso | null {
  const { cursosEnEdicion } = useRealtime();
  const { user } = useRole();

  useEffect(() => {
    if (!cursoGuid) return;

    let liberado = false;

    void api.post(`/realtime/cursos/${cursoGuid}/bloqueo`).catch(() => {
      // Si no se puede tomar el aviso, se sigue editando: es informativo.
    });

    const liberar = () => {
      if (liberado) return;
      liberado = true;
      // `keepalive` para que la petición salga aunque la pestaña se esté cerrando.
      void api.delete(`/realtime/cursos/${cursoGuid}/bloqueo`).catch(() => undefined);
    };

    window.addEventListener('pagehide', liberar);
    return () => {
      window.removeEventListener('pagehide', liberar);
      liberar();
    };
  }, [cursoGuid]);

  if (!cursoGuid) return null;

  const editor = cursosEnEdicion[cursoGuid];
  // Tenerlo uno mismo no es un bloqueo: no hay nada que avisar.
  return editor && editor.guid !== user?.guid ? editor : null;
}
