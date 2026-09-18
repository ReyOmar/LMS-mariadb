'use client';

import React, { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiUrl, borrarSesion } from '@/lib/api';
import { conectarFlujo } from '@/lib/realtime/flujo';
import { EditorDeCurso, EventoRealtime, MensajeRealtime } from '@/lib/realtime/eventos';

/**
 * Tiempo real del campus sobre Server-Sent Events.
 *
 * Sustituye al WebSocket anterior porque el despliegue vive en cPanel, donde Apache no
 * propaga la cabecera `Upgrade` y la conexión nunca llegaba a abrirse. SSE es HTTP
 * corriente y atraviesa el proxy sin configuración especial.
 *
 * El flujo es de servidor a cliente. La única acción en sentido contrario —avisar de que
 * se está editando un curso— es ahora una petición HTTP normal (`bloquearCurso`).
 */

type Escucha = (datos: unknown) => void;

interface RealtimeContextType {
  conectado: boolean;
  /** Se suscribe a un evento y devuelve la función para darse de baja. */
  suscribir: (evento: EventoRealtime, escucha: Escucha) => () => void;
  usuariosEnLinea: string[];
  cursosEnEdicion: Record<string, EditorDeCurso>;
  cursosEnMantenimiento: Record<string, string>;
}

const RealtimeContext = createContext<RealtimeContextType>({
  conectado: false,
  suscribir: () => () => undefined,
  usuariosEnLinea: [],
  cursosEnEdicion: {},
  cursosEnMantenimiento: {},
});

/**
 * Espera antes de avisar a los suscriptores.
 *
 * Una misma acción puede generar varios eventos seguidos (matricular a diez alumnos
 * dispara diez avisos). Agrupar durante un instante evita que cada pantalla montada lance
 * su propia recarga por cada uno.
 */
const AGRUPACION_MS = 250;

/** Traducción del motivo técnico del servidor al aviso que verá el usuario en el login. */
const MOTIVO_A_AVISO: Record<string, string> = {
  sesion_desplazada: 'desplazada',
  password_changed: 'expirada',
  password_reset: 'expirada',
  account_deleted: 'revocada',
  account_disabled: 'revocada',
};

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [conectado, setConectado] = useState(false);
  const [usuariosEnLinea, setUsuariosEnLinea] = useState<string[]>([]);
  const [cursosEnEdicion, setCursosEnEdicion] = useState<Record<string, EditorDeCurso>>({});
  const [cursosEnMantenimiento, setCursosEnMantenimiento] = useState<Record<string, string>>({});

  const escuchas = useRef(new Map<EventoRealtime, Set<Escucha>>());
  const temporizadores = useRef(new Map<EventoRealtime, ReturnType<typeof setTimeout>>());

  /** Reparte un evento entre sus suscriptores, agrupando ráfagas. */
  const repartir = useCallback((evento: EventoRealtime, datos: unknown) => {
    const pendiente = temporizadores.current.get(evento);
    if (pendiente) clearTimeout(pendiente);

    const temporizador = setTimeout(() => {
      temporizadores.current.delete(evento);
      escuchas.current.get(evento)?.forEach((escucha) => {
        try {
          escucha(datos);
        } catch (error) {
          // Un suscriptor que falla no puede dejar sin avisar a los demás.
          console.error(`Error atendiendo el evento ${evento}`, error);
        }
      });
    }, AGRUPACION_MS);

    temporizadores.current.set(evento, temporizador);
  }, []);

  /** Estado que el propio contexto mantiene, sin que cada pantalla tenga que suscribirse. */
  const aplicarEstadoInterno = useCallback((mensaje: MensajeRealtime) => {
    switch (mensaje.event) {
      case 'presence:sync':
      case 'presence:update': {
        const datos = mensaje.data as { onlineUsers?: string[] };
        if (Array.isArray(datos?.onlineUsers)) setUsuariosEnLinea(datos.onlineUsers);
        break;
      }
      case 'course:editing': {
        const datos = mensaje.data as { curso_guid: string; editor: EditorDeCurso };
        setCursosEnEdicion((previo) => ({ ...previo, [datos.curso_guid]: datos.editor }));
        break;
      }
      case 'course:editing-released': {
        const datos = mensaje.data as { curso_guid: string };
        setCursosEnEdicion((previo) => {
          const siguiente = { ...previo };
          delete siguiente[datos.curso_guid];
          return siguiente;
        });
        break;
      }
      case 'course:editing-sync': {
        setCursosEnEdicion((mensaje.data as Record<string, EditorDeCurso>) ?? {});
        break;
      }
      case 'course:maintenance': {
        const datos = mensaje.data as { curso_guid: string; titulo: string };
        setCursosEnMantenimiento((previo) => ({ ...previo, [datos.curso_guid]: datos.titulo }));
        break;
      }
      case 'course:updated': {
        const datos = mensaje.data as { guid?: string; estado?: string };
        if (datos?.estado === 'PUBLICADO' && datos.guid) {
          setCursosEnMantenimiento((previo) => {
            const siguiente = { ...previo };
            delete siguiente[datos.guid as string];
            return siguiente;
          });
        }
        break;
      }
      default:
        break;
    }
  }, []);

  /** La sesión dejó de ser válida: se limpia y se vuelve al login con el motivo. */
  const cerrarSesionForzada = useCallback((motivo?: string) => {
    borrarSesion();
    window.location.href = `/login?motivo=${MOTIVO_A_AVISO[motivo ?? ''] ?? 'revocada'}`;
  }, []);

  useEffect(() => {
    const token = (() => {
      try {
        return window.localStorage.getItem('lms_token');
      } catch {
        return null;
      }
    })();

    // Sin sesión no hay nada que escuchar: la portada y el login no abren flujo.
    if (!token) {
      setConectado(false);
      return;
    }

    const control = new AbortController();

    void conectarFlujo({
      url: `${apiUrl()}/realtime/stream`,
      token,
      signal: control.signal,
      onEstado: setConectado,
      onNoAutorizado: () => cerrarSesionForzada(),
      onMensaje: (mensaje) => {
        if (mensaje.event === 'session:revoked') {
          cerrarSesionForzada((mensaje.data as { reason?: string })?.reason);
          return;
        }
        aplicarEstadoInterno(mensaje);
        repartir(mensaje.event, mensaje.data);
      },
    });

    const temporizadoresActuales = temporizadores.current;
    return () => {
      control.abort();
      temporizadoresActuales.forEach((temporizador) => clearTimeout(temporizador));
      temporizadoresActuales.clear();
    };
  }, [aplicarEstadoInterno, cerrarSesionForzada, repartir]);

  const suscribir = useCallback((evento: EventoRealtime, escucha: Escucha) => {
    const conjunto = escuchas.current.get(evento) ?? new Set<Escucha>();
    conjunto.add(escucha);
    escuchas.current.set(evento, conjunto);

    return () => {
      escuchas.current.get(evento)?.delete(escucha);
    };
  }, []);

  return (
    <RealtimeContext.Provider
      value={{ conectado, suscribir, usuariosEnLinea, cursosEnEdicion, cursosEnMantenimiento }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

/**
 * Suscripción a un evento con limpieza automática.
 * Evita el patrón `useEffect` + `return unsub` repetido en cada pantalla.
 */
export function useEventoRealtime(evento: EventoRealtime, escucha: Escucha): void {
  const { suscribir } = useRealtime();
  const referencia = useRef(escucha);
  referencia.current = escucha;

  useEffect(() => suscribir(evento, (datos) => referencia.current(datos)), [evento, suscribir]);
}
