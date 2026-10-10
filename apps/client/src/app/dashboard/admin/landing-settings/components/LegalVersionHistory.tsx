'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, History, Loader2 } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useConfig } from '@/contexts/ConfigContext';
import { legalVersionLabel } from '@/lib/legal';

interface LegalVersionSummary {
  id: number;
  version: string;
  current: boolean;
}

/** Lo que decía una versión: cada campo legal tal como se publicó; nulo = el de serie. */
type LegalVersionDetail = Record<string, string | null>;

interface Field {
  field: string;
  label: string;
  type?: string;
}

/**
 * Versiones publicadas de los textos legales de la sede, sólo para consultarlas.
 *
 * Son la prueba de lo que aceptó cada persona: el consentimiento guarda la versión, y aquí
 * se ve lo que decía. Los textos de cada una se piden al abrirla.
 */
export function LegalVersionHistory({ fields }: { fields: Field[] }) {
  const { config } = useConfig();
  const { notify } = useAlerts();
  const [versions, setVersions] = useState<LegalVersionSummary[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, LegalVersionDetail>>({});

  // Se vuelve a pedir al publicarse una versión nueva.
  const currentVersion = config?.legalUpdatedAt;
  useEffect(() => {
    let active = true;
    api
      .get<LegalVersionSummary[]>('/settings/legal-versions')
      .then(({ data }) => active && setVersions(data))
      .catch((error) => {
        if (!active) return;
        setVersions([]);
        notify.error('No se pudieron cargar las versiones de los textos legales', errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [currentVersion, notify]);

  const toggle = async (id: number) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (details[id]) return;
    try {
      const { data } = await api.get<LegalVersionDetail>(`/settings/legal-versions/${id}`);
      setDetails((prev) => ({ ...prev, [id]: data }));
    } catch (error) {
      // Sólo se cierra si sigue abierta ésta: entretanto se pudo abrir otra.
      setOpenId((current) => (current === id ? null : current));
      notify.error('No se pudo abrir la versión', errorMessage(error));
    }
  };

  return (
    <div className="border-t border-border/50 pt-6">
      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <History className="h-4 w-4" />
        Versiones publicadas
      </h2>
      <p className="text-xs text-muted-foreground mt-1.5 mb-4">
        Lo que decía cada versión, como prueba de lo que aceptó cada persona. No se pueden modificar ni borrar.
      </p>

      {versions === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay versiones registradas. Se registra una cada vez que se guarda un cambio en esta pestaña.
        </p>
      ) : (
        <ul className="space-y-2">
          {versions.map((item) => {
            const open = openId === item.id;
            const detail = details[item.id];
            return (
              <li key={item.id} className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => void toggle(item.id)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40 rounded-xl transition-colors"
                >
                  <span className="font-medium">
                    {legalVersionLabel(item.version)}
                    {item.current && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                        Vigente
                      </span>
                    )}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    {!detail ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      fields.map(({ field, label, type }) => (
                        <div key={field}>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                            {label}
                          </p>
                          {detail[field] ? (
                            <p
                              className={`text-sm whitespace-pre-wrap break-words ${
                                type === 'document'
                                  ? 'max-h-64 overflow-y-auto rounded-lg bg-muted/40 px-3 py-2 leading-relaxed'
                                  : ''
                              }`}
                            >
                              {detail[field]}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              {type === 'document' ? 'Texto de serie del campus' : 'Sin configurar'}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
