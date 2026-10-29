'use client';

import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { clearSession, isNetworkFailure, saveSession, readStoredUser, readToken, sendKeepalive } from '@/lib/api';
import { Country } from '@/lib/country';
import type { UserRole } from '@/types/models';
import { FullScreenLoader } from '@/components/ui/PageLoader';

/** Roles tal como los nombra la interfaz. */
export type Role = 'admin' | 'teacher' | 'student';

export interface SessionUser {
  guid: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: UserRole;
  country: Country;
  photoUrl?: string | null;
  /** Falta aceptar la política de tratamiento de datos vigente de la sede. */
  consentRequired?: boolean;
}

interface CurrentSession {
  /** Rol de la cuenta. Es el mismo para pintar la interfaz y para decidir permisos. */
  role: Role;
  user: SessionUser | null;
  authenticated: boolean;
  /** `false` mientras se restaura la sesión guardada. */
  ready: boolean;
  login: (token: string, user: SessionUser) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<CurrentSession | undefined>(undefined);

const ROLE_TO_UI: Record<UserRole, Role> = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
};

function toUiRole(role: UserRole | undefined): Role {
  return (role && ROLE_TO_UI[role]) ?? 'student';
}

/**
 * Sesión del usuario.
 *
 * La sesión guardada en el navegador sirve para pintar la interfaz de inmediato, pero se
 * contrasta con `/auth/me` en cuanto arranca la aplicación: el rol, el estado de la cuenta
 * y la sede pueden haber cambiado desde el último acceso y la copia local no se entera.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get<Required<SessionUser>>('/auth/me');

    // Se copia campo a campo para no guardar en el navegador nada que la sesión no use.
    const fresh: SessionUser = {
      guid: data.guid,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role,
      country: data.country,
      photoUrl: data.photoUrl,
      consentRequired: data.consentRequired,
    };

    setUser(fresh);
    saveSession(readToken() ?? '', fresh);
  }, []);

  useEffect(() => {
    const saved = readStoredUser<SessionUser>();
    if (!saved?.guid) {
      setReady(true);
      return;
    }

    // Se muestra lo guardado y, en paralelo, se confirma con el servidor.
    setUser(saved);

    refreshUser()
      .catch((error: unknown) => {
        // Sin respuesta del servidor no hay nada que confirmar ni que desmentir: se sigue
        // con lo guardado. Si respondió que no, se descarta la copia local para no dejar la
        // interfaz con datos de una sesión muerta (el interceptor ya lleva al login).
        if (isNetworkFailure(error)) return;
        clearSession();
        setUser(null);
      })
      .finally(() => setReady(true));
  }, [refreshUser]);

  const login = useCallback((token: string, sessionUser: SessionUser) => {
    saveSession(token, sessionUser);
    setUser(sessionUser);
  }, []);

  const logout = useCallback(() => {
    setLoggingOut(true);

    // Se avisa al servidor para que revoque este token, pero no se espera: el usuario ya
    // quiere salir y un fallo de red no puede dejarlo dentro.
    if (readToken()) sendKeepalive('POST', '/auth/logout');

    clearSession();
    setUser(null);
    window.location.href = '/login';
  }, []);

  const value = useMemo<CurrentSession>(
    () => ({
      role: toUiRole(user?.role),
      user,
      authenticated: Boolean(user),
      ready,
      login,
      logout,
      refreshUser,
    }),
    [user, ready, login, logout, refreshUser],
  );

  if (loggingOut) return <FullScreenLoader message="Cerrando sesión…" />;

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): CurrentSession {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de SessionProvider.');
  return context;
}
