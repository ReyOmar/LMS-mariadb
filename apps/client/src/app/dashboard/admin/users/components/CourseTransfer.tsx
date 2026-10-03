'use client';

import { useDialog } from '@/hooks/useDialog';
import type { TransferState } from './accounts';
import { plural } from '@/lib/text';

interface Props {
  transfer: TransferState;
  onPickTarget: (guid: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * A quién pasan los cursos de una cuenta que se va a eliminar.
 *
 * Un curso no puede quedarse sin responsable —la relación es obligatoria en la base—, así
 * que este paso no es un aviso sino un requisito: sin destino no se borra nada.
 */
export function CourseTransfer({ transfer, onPickTarget, onCancel, onConfirm }: Props) {
  const { user, targets, selectedTarget, loading } = transfer;
  const courseCount = user.taughtCourses ?? 0;
  const { dialogProps, titleId } = useDialog({ onClose: onCancel });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div {...dialogProps} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <h3 id={titleId} className="text-lg font-bold mb-2">
          Traspasar los cursos de {user.firstName} {user.lastName}
        </h3>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Esta cuenta es responsable de {courseCount} {plural(courseCount, 'curso', 'cursos')}. Antes de eliminarla,
          elige quién se hará cargo de ellos: los cursos, sus alumnos y sus entregas se conservan.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Buscando destinos disponibles…</p>
        ) : targets.length === 0 ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            No hay ninguna otra cuenta activa de examinador o administrador en esta sede a la que traspasar los cursos.
            Crea una antes de eliminar esta.
          </p>
        ) : (
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nuevo responsable</span>
            <select
              value={selectedTarget}
              onChange={(event) => onPickTarget(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {targets.map((target) => (
                <option key={target.guid} value={target.guid}>
                  {target.firstName} {target.lastName} · {target.email}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || !selectedTarget}
            onClick={onConfirm}
            className="h-10 rounded-xl bg-destructive px-5 text-sm font-bold text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            Traspasar y eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
