'use client';

import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import type { ModuleProgress } from '@/types/models';
import { moduleColor, progressColor } from './progress-colors';

/**
 * Avance módulo a módulo de un alumno en un curso. Se pide al desplegarlo: en cada fila de
 * la lista multiplicaría el tamaño de la respuesta por los módulos de cada alumno.
 */
export function ModuleBreakdown({ courseGuid, studentGuid }: { courseGuid: string; studentGuid: string }) {
  const [modules, setModules] = useState<ModuleProgress[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    api
      .get<{ modules: ModuleProgress[] }>(`/dashboards/monitoring/${courseGuid}/${studentGuid}`)
      .then(({ data }) => current && setModules(data.modules))
      .catch((failure) => current && setError(errorMessage(failure, 'No se pudo cargar el avance por módulo.')));
    return () => {
      current = false;
    };
  }, [courseGuid, studentGuid]);

  if (error) return <p className="text-xs text-red-700 dark:text-red-400 py-2">{error}</p>;
  if (!modules) return <p className="text-xs text-muted-foreground py-2">Cargando módulos…</p>;

  const resources = modules.reduce((sum, moduleProgress) => sum + moduleProgress.total, 0);
  const completed = modules.reduce((sum, moduleProgress) => sum + moduleProgress.completed, 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        <Stat value={modules.length} label="Módulos" color="text-primary" />
        <Stat value={completed} label="Recursos completados" color="text-emerald-700 dark:text-emerald-400" />
        <Stat value={resources - completed} label="Recursos pendientes" color="text-amber-700 dark:text-amber-400" />
      </div>

      <div className="space-y-1.5">
        {modules.map((moduleProgress, i) => (
          <div
            key={moduleProgress.guid}
            className="flex items-center gap-3 py-1.5 px-2 sm:px-3 rounded-lg hover:bg-muted/20"
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${moduleColor(moduleProgress.percent)}`}
            >
              {i + 1}
            </div>
            <span className="text-xs font-medium flex-1 truncate">{moduleProgress.title}</span>
            <div className="hidden sm:block flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[180px]">
              <div
                className="h-full rounded-full"
                style={{ width: `${moduleProgress.percent}%`, backgroundColor: progressColor(moduleProgress.percent) }}
              />
            </div>
            <span className="text-xs font-bold text-muted-foreground w-12 text-right">
              {moduleProgress.completed}/{moduleProgress.total}
            </span>
            <span
              className={`text-xs font-bold w-10 text-right ${moduleProgress.percent >= 100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}
            >
              {moduleProgress.percent}%
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  const { country } = useCountry();
  return (
    <div className="bg-card border border-border/40 rounded-lg p-2 sm:p-3 text-center">
      <p className={`text-sm sm:text-lg font-bold ${color}`}>{formatNumber(value, country)}</p>
      <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium uppercase">{label}</p>
    </div>
  );
}
