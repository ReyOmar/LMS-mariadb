'use client';

import { useEffect, useState } from 'react';
import api, { errorMessage } from '@/lib/api';
import type { ModuleProgress } from '@/types/models';
import { barColor, moduleColor } from './progress-colors';

/**
 * Avance módulo a módulo de un alumno en un curso.
 *
 * Se pide al desplegar el curso: llevarlo en cada fila de la lista multiplicaba el
 * tamaño de la respuesta por el número de módulos de cada alumno.
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

  const resources = modules.reduce((sum, module) => sum + module.total, 0);
  const completed = modules.reduce((sum, module) => sum + module.completed, 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        <Stat value={modules.length} label="Módulos" color="text-primary" />
        <Stat value={completed} label="Completados" color="text-emerald-700 dark:text-emerald-400" />
        <Stat value={resources - completed} label="Pendientes" color="text-amber-700 dark:text-amber-400" />
      </div>

      <div className="space-y-1.5">
        {modules.map((module, i) => (
          <div key={module.guid} className="flex items-center gap-3 py-1.5 px-2 sm:px-3 rounded-lg hover:bg-muted/20">
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${moduleColor(module.percent)}`}
            >
              {i + 1}
            </div>
            <span className="text-xs font-medium flex-1 truncate">{module.title}</span>
            <div className="hidden sm:block flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[180px]">
              <div
                className={`h-full rounded-full ${barColor(module.percent)}`}
                style={{ width: `${module.percent}%` }}
              />
            </div>
            <span className="text-xs font-bold text-muted-foreground w-12 text-right">
              {module.completed}/{module.total}
            </span>
            <span
              className={`text-xs font-bold w-10 text-right ${module.percent >= 100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}
            >
              {module.percent}%
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="bg-card border border-border/40 rounded-lg p-2 sm:p-3 text-center">
      <p className={`text-sm sm:text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium uppercase">{label}</p>
    </div>
  );
}
