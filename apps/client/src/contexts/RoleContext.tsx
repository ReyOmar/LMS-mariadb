'use client';

import React, { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { apiUrl, borrarSesion, guardarSesion, leerUsuarioGuardado } from '@/lib/api';
import { Pais, esPais } from '@/lib/pais';
import { useSede } from './SedeContext';
import { PageLoader } from '@/components/ui/PageLoader';

/** Roles tal como los nombra la interfaz. */
export type Role = 'admin' | 'teacher' | 'student';

/** Rol tal como lo nombra la base de datos. */
export type RolBD = 'ADMINISTRADOR' | 'PROFESOR' | 'ESTUDIANTE';

export interface UsuarioSesion {
  guid: string;
  nombre: string;
  apellido: string;
  email?: string;
  role: RolBD;
  pais: Pais;
  foto_url?: string | null;
}

interface RoleContextType {
  /** Rol con el que se pinta la interfaz; puede ser el simulado por un administrador. */
  role: Role;
  /** Rol real de la cuenta. Es el que manda para cualquier decisión de permisos. */
  rolReal: Role;
  rolSimulado: Role | null;
  simularRol: (rol: Role | null) => void;
  user: UsuarioSesion | null;
  autenticado: boolean;
  /** `false` mientras se restaura la sesión guardada. */
  listo: boolean;
  iniciarSesion: (token: string, usuario: UsuarioSesion) => void;
  cerrarSesion: () => void;
  refrescarUsuario: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

const ROL_A_INTERFAZ: Record<RolBD, Role> = {
  ADMINISTRADOR: 'admin',
  PROFESOR: 'teacher',
  ESTUDIANTE: 'student',
};

function aRolDeInterfaz(rol: string | undefined): Role {
  return ROL_A_INTERFAZ[rol as RolBD] ?? 'student';
}

/**
 * Sesión del usuario.
 *
 * La sesión guardada en el navegador sirve para pintar la interfaz de inmediato, pero se
 * contrasta con `/auth/me` en cuanto arranca la aplicación: el rol, el estado de la cuenta
 * y la sede pueden haber cambiado desde el último acceso y la copia local no se entera.
 */
export function RoleProvider({ children }: { children: ReactNode }) {
  const { fijarSedeDeSesion } = useSede();
  const [user, setUser] = useState<UsuarioSesion | null>(null);
  const [rolSimulado, setRolSimulado] = useState<Role | null>(null);
  const [listo, setListo] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const aplicarUsuario = useCallback(
    (usuario: UsuarioSesion) => {
      setUser(usuario);
      if (esPais(usuario.pais)) fijarSedeDeSesion(usuario.pais);
    },
    [fijarSedeDeSesion],
  );

  const refrescarUsuario = useCallback(async () => {
    const { data } = await api.get<{
      guid: string;
      nombre: string;
      apellido: string;
      email: string;
      rol: RolBD;
      pais: Pais;
      foto_url: string | null;
    }>('/auth/me');

    const usuario: UsuarioSesion = {
      guid: data.guid,
      nombre: data.nombre,
      apellido: data.apellido,
      email: data.email,
      role: data.rol,
      pais: data.pais,
      foto_url: data.foto_url,
    };

    aplicarUsuario(usuario);
    guardarSesion(window.localStorage.getItem('lms_token') ?? '', usuario);
  }, [aplicarUsuario]);

  useEffect(() => {
    const guardado = leerUsuarioGuardado<UsuarioSesion>();
    if (!guardado?.guid) {
      setListo(true);
      return;
    }

    // Se muestra lo guardado y, en paralelo, se confirma con el servidor.
    aplicarUsuario(guardado);

    refrescarUsuario()
      .catch(() => {
        // El interceptor de `api` ya redirige al login en los 401; aquí sólo se descarta
        // la copia local para no dejar la interfaz con datos de una sesión muerta.
        borrarSesion();
        setUser(null);
      })
      .finally(() => setListo(true));
  }, [aplicarUsuario, refrescarUsuario]);

  const iniciarSesion = useCallback(
    (token: string, usuario: UsuarioSesion) => {
      guardarSesion(token, usuario);
      aplicarUsuario(usuario);
      setRolSimulado(null);
    },
    [aplicarUsuario],
  );

  const cerrarSesion = useCallback(() => {
    setCerrando(true);

    // Se avisa al servidor para que revoque este token, pero no se espera: el usuario ya
    // quiere salir y un fallo de red no puede dejarlo dentro.
    const token = window.localStorage.getItem('lms_token');
    if (token) {
      void fetch(`${apiUrl()}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => undefined);
    }

    borrarSesion();
    setUser(null);
    setRolSimulado(null);
    window.location.href = '/login';
  }, []);

  const rolReal = aRolDeInterfaz(user?.role);

  if (cerrando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <PageLoader message="Cerrando sesión…" />
      </div>
    );
  }

  return (
    <RoleContext.Provider
      value={{
        role: rolSimulado ?? rolReal,
        rolReal,
        rolSimulado,
        simularRol: setRolSimulado,
        user,
        autenticado: Boolean(user),
        listo,
        iniciarSesion,
        cerrarSesion,
        refrescarUsuario,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextType {
  const contexto = useContext(RoleContext);
  if (!contexto) throw new Error('useRole debe usarse dentro de RoleProvider.');
  return contexto;
}
