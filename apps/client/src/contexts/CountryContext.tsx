'use client';

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Country, DEFAULT_COUNTRY, saveCountry, countryName, savedCountry } from '@/lib/country';

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

interface CountryContextType {
  /** Sede que se está mostrando. Siempre hay una. */
  country: Country;
  /** Nombre legible de la sede activa. */
  name: string;
  selectCountry: (country: Country) => void;
  /** `false` durante el primer render, cuando todavía no se ha leído el almacenamiento. */
  ready: boolean;
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);

export function CountryProvider({ children }: { children: ReactNode }) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [ready, setReady] = useState(false);

  // El almacenamiento sólo existe en el navegador, así que la lectura va en un efecto
  // para que el HTML del servidor y el del cliente coincidan en el primer render.
  useEffect(() => {
    setCountry(savedCountry());
    setReady(true);
  }, []);

  const selectCountry = useCallback((selected: Country) => {
    saveCountry(selected);
    setCountry(selected);
  }, []);

  const value = useMemo(
    () => ({ country, name: countryName(country), selectCountry, ready }),
    [country, selectCountry, ready],
  );

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry(): CountryContextType {
  const context = useContext(CountryContext);
  if (!context) throw new Error('useCountry debe usarse dentro de CountryProvider.');
  return context;
}
