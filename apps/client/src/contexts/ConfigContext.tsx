'use client';

import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { Country } from '@/lib/country';
import { readLocalJson, writeLocal } from '@/lib/local-storage';
import { applyTheme } from '@/lib/theme';
import { useCountry } from './CountryContext';
import { useRealtimeEvent } from './RealtimeContext';

/**
 * Configuración de la sede activa: marca, textos de la portada y textos legales.
 *
 * Cada sede tiene su propia fila en la base de datos, así que al cambiar de sede cambia
 * todo: el nombre de la plataforma, los colores, los datos de contacto y la normativa.
 */
export interface CountrySettings {
  country: Country;
  platformName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  font: string;
  borderRadius: number;
  loginBackgroundUrl: string | null;
  welcomeMessage: string;
  /** Límite general de subida de la sede, en MB: el de las tareas sin límite propio y el del material. */
  maxFileMb: number;
  /** Tope técnico del servidor (`MAX_UPLOAD_MB`): ningún límite configurable puede superarlo. */
  uploadCeilingMb: number;

  landingHeroTitle1: string;
  landingHeroTitle2: string;
  landingHeroSubtitle: string;
  landingPhone: string;
  landingPhoneSub: string;
  landingEmail: string;
  landingEmailSub: string;
  landingOffice: string;
  landingOfficeSub: string;
  landingFooterText: string;

  /** Responsable del tratamiento de datos de la sede. */
  legalEntityName: string | null;
  legalEntityTaxId: string | null;
  legalAddress: string | null;
  privacyEmail: string | null;
  /** Fecha de la versión vigente de los textos legales; nula mientras rigen los de serie. */
  legalUpdatedAt: string | null;
  legalTerms: string | null;
  legalPrivacy: string | null;
  legalData: string | null;
}

interface ConfigContextType {
  config: CountrySettings | null;
  loading: boolean;
  error: string | null;
  /** Aplica cambios sólo en pantalla, para la vista previa del panel de personalización. */
  preview: (changes: Partial<CountrySettings>) => void;
  /** Vuelve a pedir la configuración al servidor y descarta la vista previa. */
  reload: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

/** Caché local por sede, para que el tema no parpadee al recargar la página. */
function cacheKey(country: Country): string {
  return `lms_config_${country}`;
}

function readCache(country: Country): CountrySettings | null {
  return readLocalJson<CountrySettings>(cacheKey(country));
}

function writeCache(country: Country, config: CountrySettings): void {
  writeLocal(cacheKey(country), JSON.stringify(config));
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { country } = useCountry();
  const [config, setConfig] = useState<CountrySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Sede de la última carga pedida: una respuesta de otra sede que llegue tarde se ignora. */
  const requestedCountry = useRef<Country | null>(null);

  const load = useCallback(async (target: Country) => {
    requestedCountry.current = target;
    setLoading(true);
    setError(null);

    // Se pinta lo cacheado mientras llega la respuesta, para no mostrar el tema por
    // defecto y cambiarlo un instante después.
    const cached = readCache(target);
    if (cached) {
      setConfig(cached);
      applyTheme(cached);
    }

    try {
      const { data } = await api.get<CountrySettings>('/settings', { params: { country: target } });
      writeCache(target, data);
      if (requestedCountry.current !== target) return;
      setConfig(data);
      applyTheme(data);
    } catch (failure) {
      // Con caché disponible el usuario no nota nada; sin ella, la interfaz queda con el
      // tema por defecto y el error se expone para que la pantalla pueda avisar.
      if (requestedCountry.current === target) {
        setError(errorMessage(failure, 'No se pudo cargar la configuración del campus.'));
      }
    } finally {
      if (requestedCountry.current === target) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(country);
  }, [country, load]);

  // Un administrador puede cambiar la marca mientras otros la tienen abierta.
  useRealtimeEvent('config:updated', (data) => {
    const updated = data as CountrySettings | null;
    if (!updated?.country || updated.country !== country) return;
    setConfig(updated);
    applyTheme(updated);
    writeCache(updated.country, updated);
  });

  const preview = useCallback((changes: Partial<CountrySettings>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...changes };
      applyTheme(next);
      return next;
    });
  }, []);

  const reload = useCallback(() => load(country), [country, load]);

  const value = useMemo(() => ({ config, loading, error, preview, reload }), [config, loading, error, preview, reload]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextType {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig debe usarse dentro de ConfigProvider.');
  return context;
}
