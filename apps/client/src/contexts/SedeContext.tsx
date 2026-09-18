'use client';

import React, { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Pais, guardarSede, leerSedeGuardada, nombreSede, olvidarSede } from '@/lib/pais';

/**
 * Sede activa en el navegador.
 *
 * El campus atiende a Colombia y a México como operaciones independientes: cursos,
 * alumnos, examinadores, certificados y hasta los textos de la portada son distintos y no
 * se cruzan en ningún momento.
 *
 * Este contexto decide **qué sede se muestra antes de iniciar sesión**. Una vez dentro, la
 * sede real es la que el servidor guarda en la cuenta y viaja en el token; aquí sólo se
 * refleja para que la interfaz sea coherente. Cambiar este valor a mano no da acceso a
 * nada: cada consulta la acota el servidor.
 */

interface SedeContextType {
  /** Sede elegida, o `null` si el visitante todavía no ha escogido. */
  sede: Pais | null;
  /** `true` cuando la sede procede de una sesión iniciada y no de una elección local. */
  confirmada: boolean;
  /** Nombre legible de la sede activa. */
  nombre: string | null;
  elegirSede: (pais: Pais) => void;
  /** Fija la sede de la sesión; tiene prioridad sobre cualquier elección previa. */
  fijarSedeDeSesion: (pais: Pais) => void;
  /** Vuelve al estado "sin elegir" para poder cambiar de sede desde la portada. */
  cambiarDeSede: () => void;
  /** `false` durante el primer render, cuando todavía no se ha leído el almacenamiento. */
  listo: boolean;
}

const SedeContext = createContext<SedeContextType | undefined>(undefined);

export function SedeProvider({ children }: { children: ReactNode }) {
  const [sede, setSede] = useState<Pais | null>(null);
  const [confirmada, setConfirmada] = useState(false);
  const [listo, setListo] = useState(false);

  // El almacenamiento sólo existe en el navegador, así que la lectura va en un efecto
  // para que el HTML del servidor y el del cliente coincidan en el primer render.
  useEffect(() => {
    setSede(leerSedeGuardada());
    setListo(true);
  }, []);

  const elegirSede = useCallback((pais: Pais) => {
    guardarSede(pais);
    setSede(pais);
  }, []);

  const fijarSedeDeSesion = useCallback((pais: Pais) => {
    guardarSede(pais);
    setSede(pais);
    setConfirmada(true);
  }, []);

  const cambiarDeSede = useCallback(() => {
    olvidarSede();
    setSede(null);
    setConfirmada(false);
  }, []);

  return (
    <SedeContext.Provider
      value={{
        sede,
        confirmada,
        nombre: sede ? nombreSede(sede) : null,
        elegirSede,
        fijarSedeDeSesion,
        cambiarDeSede,
        listo,
      }}
    >
      {children}
    </SedeContext.Provider>
  );
}

export function useSede(): SedeContextType {
  const contexto = useContext(SedeContext);
  if (!contexto) throw new Error('useSede debe usarse dentro de SedeProvider.');
  return contexto;
}
