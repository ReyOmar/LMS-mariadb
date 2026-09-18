'use client';

import React, { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { mensajeDeError } from '@/lib/api';
import { Pais } from '@/lib/pais';
import { aplicarTema } from '@/lib/tema';
import { useSede } from './SedeContext';
import { useEventoRealtime } from './RealtimeContext';

/**
 * Configuración de la sede activa: marca, textos de la portada y textos legales.
 *
 * Cada sede tiene su propia fila en la base de datos, así que al cambiar de sede cambia
 * todo: el nombre de la plataforma, los colores, los datos de contacto y la normativa.
 */
export interface ConfigSede {
  pais: Pais;
  nombre_plataforma: string;
  logo_url: string | null;
  favicon_url: string | null;
  color_primario: string;
  color_secundario: string;
  fuente: string;
  border_radius: number;
  login_fondo_url: string | null;
  mensaje_bienvenida: string;
  idioma: string;
  zona_horaria: string;
  max_archivo_mb: number;

  landing_hero_titulo1: string;
  landing_hero_titulo2: string;
  landing_hero_subtitulo: string;
  landing_telefono: string;
  landing_telefono_sub: string;
  landing_email: string;
  landing_email_sub: string;
  landing_oficina: string;
  landing_oficina_sub: string;
  landing_footer_texto: string;

  legal_terminos: string | null;
  legal_privacidad: string | null;
  legal_datos: string | null;
}

interface ConfigContextType {
  config: ConfigSede | null;
  cargando: boolean;
  error: string | null;
  /** Aplica cambios sólo en pantalla, para la vista previa del panel de personalización. */
  previsualizar: (cambios: Partial<ConfigSede>) => void;
  /** Vuelve a pedir la configuración al servidor y descarta la vista previa. */
  recargar: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

/** Caché local por sede, para que el tema no parpadee al recargar la página. */
function claveCache(pais: Pais): string {
  return `lms_config_${pais}`;
}

function leerCache(pais: Pais): ConfigSede | null {
  try {
    const crudo = window.localStorage.getItem(claveCache(pais));
    return crudo ? (JSON.parse(crudo) as ConfigSede) : null;
  } catch {
    return null;
  }
}

function escribirCache(pais: Pais, config: ConfigSede): void {
  try {
    window.localStorage.setItem(claveCache(pais), JSON.stringify(config));
  } catch {
    // Sin caché sólo se pierde la ausencia de parpadeo; la aplicación funciona igual.
  }
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { sede } = useSede();
  const [config, setConfig] = useState<ConfigSede | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (pais: Pais) => {
      setCargando(true);
      setError(null);

      // Se pinta lo cacheado mientras llega la respuesta, para no mostrar el tema por
      // defecto y cambiarlo un instante después.
      const cacheada = leerCache(pais);
      if (cacheada) {
        setConfig(cacheada);
        aplicarTema(cacheada);
      }

      try {
        const { data } = await api.get<ConfigSede>('/configuracion', { params: { pais } });
        setConfig(data);
        aplicarTema(data);
        escribirCache(pais, data);
      } catch (fallo) {
        // Con caché disponible el usuario no nota nada; sin ella, la interfaz queda con el
        // tema por defecto y el error se expone para que la pantalla pueda avisar.
        setError(mensajeDeError(fallo, 'No se pudo cargar la configuración del campus.'));
      } finally {
        setCargando(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!sede) {
      setConfig(null);
      return;
    }
    void cargar(sede);
  }, [sede, cargar]);

  // Un administrador puede cambiar la marca mientras otros la tienen abierta.
  useEventoRealtime('config:updated', (datos) => {
    const actualizada = datos as ConfigSede | null;
    if (!actualizada?.pais || actualizada.pais !== sede) return;
    setConfig(actualizada);
    aplicarTema(actualizada);
    escribirCache(actualizada.pais, actualizada);
  });

  const previsualizar = useCallback((cambios: Partial<ConfigSede>) => {
    setConfig((previo) => {
      if (!previo) return previo;
      const siguiente = { ...previo, ...cambios };
      aplicarTema(siguiente);
      return siguiente;
    });
  }, []);

  const recargar = useCallback(async () => {
    if (sede) await cargar(sede);
  }, [sede, cargar]);

  return (
    <ConfigContext.Provider value={{ config, cargando, error, previsualizar, recargar }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextType {
  const contexto = useContext(ConfigContext);
  if (!contexto) throw new Error('useConfig debe usarse dentro de ConfigProvider.');
  return contexto;
}
