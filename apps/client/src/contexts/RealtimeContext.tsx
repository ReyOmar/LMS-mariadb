'use client';

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clearSession, readToken, redirectToLogin, type LogoutReason } from '@/lib/api';
import { pollEvents } from '@/lib/realtime/poll';
import {
  CourseEditor,
  PresenceChange,
  RealtimeEvent,
  RealtimeMessage,
  batchKey,
  withPresence,
} from '@/lib/realtime/events';
import { useSession } from './SessionContext';

/**
 * Tiempo real del campus: cada pestaña pregunta cada pocos segundos qué ha pasado
 * (`pollEvents`) y reparte los avisos entre las pantallas suscritas.
 *
 * Avisar de que se está editando un curso es una petición HTTP aparte (`useCourseLock`).
 */

type Listener = (data: unknown) => void;

interface RealtimeContextType {
  /** Se suscribe a un evento y devuelve la función para darse de baja. */
  subscribe: (event: RealtimeEvent, listener: Listener) => () => void;
  /**
   * Se suscribe a los momentos en que pudo perderse algún aviso —la API se reinició o la pestaña
   * estuvo dormida— y devuelve la función para darse de baja.
   */
  onReconnect: (listener: () => void) => () => void;
  onlineUsers: ReadonlySet<string>;
  coursesBeingEdited: Record<string, CourseEditor>;
}

const RealtimeContext = createContext<RealtimeContextType>({
  subscribe: () => () => undefined,
  onReconnect: () => () => undefined,
  onlineUsers: new Set(),
  coursesBeingEdited: {},
});

/**
 * Espera antes de avisar a los suscriptores.
 *
 * Una misma acción puede generar varios eventos seguidos (matricular a diez alumnos
 * dispara diez avisos). Agrupar durante un instante evita que cada pantalla montada lance
 * su propia recarga por cada uno. Se agrupa por evento, curso y, en los avisos de un alumno
 * como `round:closed`, también por alumno (`batchKey`).
 */
const DEBOUNCE_MS = 250;

/**
 * Eventos que traen un elemento nuevo en cada aviso y se reparten sin agrupar: agrupando,
 * de dos mensajes seguidos sólo llegaría el último a quien los lista o los cuenta.
 */
const UNBATCHED_EVENTS: ReadonlySet<RealtimeEvent> = new Set(['notification:new', 'message:new']);

/** Traducción del motivo técnico del servidor al aviso que verá el usuario en el login. */
const REASON_TO_LOGOUT: Record<string, LogoutReason> = {
  session_displaced: 'displaced',
  password_changed: 'password',
  password_reset: 'password',
  role_changed: 'role',
  account_deleted: 'revoked',
};

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useSession();
  const [onlineUsers, setOnlineUsers] = useState<ReadonlySet<string>>(() => new Set());
  const [coursesBeingEdited, setCoursesBeingEdited] = useState<Record<string, CourseEditor>>({});

  const listeners = useRef(new Map<RealtimeEvent, Set<Listener>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reconnectListeners = useRef(new Set<() => void>());

  const notifyListeners = useCallback((event: RealtimeEvent, data: unknown) => {
    listeners.current.get(event)?.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        // Un suscriptor que falla no puede dejar sin avisar a los demás.
        console.error(`Error atendiendo el evento ${event}`, error);
      }
    });
  }, []);

  /** Reparte un evento entre sus suscriptores, agrupando ráfagas. */
  const dispatch = useCallback(
    (event: RealtimeEvent, data: unknown) => {
      if (UNBATCHED_EVENTS.has(event)) {
        notifyListeners(event, data);
        return;
      }

      const key = batchKey(event, data);
      const pending = timers.current.get(key);
      if (pending) clearTimeout(pending);

      const timer = setTimeout(() => {
        timers.current.delete(key);
        notifyListeners(event, data);
      }, DEBOUNCE_MS);

      timers.current.set(key, timer);
    },
    [notifyListeners],
  );

  /** Estado que el propio contexto mantiene, sin que cada pantalla tenga que suscribirse. */
  const applyInternalState = useCallback((message: RealtimeMessage) => {
    switch (message.event) {
      case 'presence:sync': {
        const data = message.data as { onlineUsers?: string[] };
        if (Array.isArray(data?.onlineUsers)) setOnlineUsers(new Set(data.onlineUsers));
        break;
      }
      case 'presence:update': {
        const change = message.data as PresenceChange;
        setOnlineUsers((online) => withPresence(online, change));
        break;
      }
      case 'course:editing': {
        const data = message.data as { courseGuid: string; editor: CourseEditor };
        setCoursesBeingEdited((prev) => ({ ...prev, [data.courseGuid]: data.editor }));
        break;
      }
      case 'course:editing-released': {
        const data = message.data as { courseGuid: string };
        setCoursesBeingEdited((prev) => {
          const next = { ...prev };
          delete next[data.courseGuid];
          return next;
        });
        break;
      }
      case 'course:editing-sync': {
        setCoursesBeingEdited((message.data as Record<string, CourseEditor>) ?? {});
        break;
      }
      default:
        break;
    }
  }, []);

  /** La sesión dejó de ser válida: se limpia y se vuelve al login con el motivo. */
  const forceLogout = useCallback((reason?: string) => {
    clearSession();
    redirectToLogin((reason && REASON_TO_LOGOUT[reason]) || 'revoked');
  }, []);

  useEffect(() => {
    const token = readToken();

    // Sin sesión no hay nada que preguntar: la portada y el login no consultan.
    if (!authenticated || !token) {
      setOnlineUsers(new Set());
      setCoursesBeingEdited({});
      return;
    }

    const control = new AbortController();

    void pollEvents({
      signal: control.signal,
      // Lo que pasó en ese intervalo no llegará nunca: cada pantalla vuelve a pedir sus datos.
      onReset: () => reconnectListeners.current.forEach((listener) => listener()),
      onMessage: (message) => {
        if (message.event === 'session:revoked') {
          forceLogout((message.data as { reason?: string })?.reason);
          return;
        }
        applyInternalState(message);
        dispatch(message.event, message.data);
      },
    });

    const currentTimers = timers.current;
    return () => {
      control.abort();
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, [authenticated, applyInternalState, forceLogout, dispatch]);

  const subscribe = useCallback((event: RealtimeEvent, listener: Listener) => {
    const listenerSet = listeners.current.get(event) ?? new Set<Listener>();
    listenerSet.add(listener);
    listeners.current.set(event, listenerSet);

    return () => {
      listeners.current.get(event)?.delete(listener);
    };
  }, []);

  const onReconnect = useCallback((listener: () => void) => {
    reconnectListeners.current.add(listener);
    return () => {
      reconnectListeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(
    () => ({ subscribe, onReconnect, onlineUsers, coursesBeingEdited }),
    [subscribe, onReconnect, onlineUsers, coursesBeingEdited],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

/**
 * Suscripción a un evento con limpieza automática.
 * Siempre llama a la versión más reciente de `listener`, sin volver a suscribirse.
 */
export function useRealtimeEvent(event: RealtimeEvent, listener: Listener): void {
  const { subscribe } = useRealtime();
  const ref = useRef(listener);
  ref.current = listener;

  useEffect(() => subscribe(event, (data) => ref.current(data)), [event, subscribe]);
}

/**
 * Vuelve a cargar los datos de la pantalla cuando pudo perderse algún aviso. Siempre llama a la
 * versión más reciente de `listener`.
 */
export function useRealtimeReconnect(listener: () => void): void {
  const { onReconnect } = useRealtime();
  const ref = useRef(listener);
  ref.current = listener;

  useEffect(() => onReconnect(() => ref.current()), [onReconnect]);
}
