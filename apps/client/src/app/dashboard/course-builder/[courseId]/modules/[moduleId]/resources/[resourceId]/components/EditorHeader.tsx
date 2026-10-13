'use client';

import { ArrowLeft, Save } from 'lucide-react';
import { KIND_PRESENTATION } from '@/app/dashboard/course-builder/components/resource-presentation';
import type { ResourceKind } from '@/app/dashboard/course-builder/components/resources';

interface Props {
  kind: ResourceKind;
  isNew: boolean;
  readOnly: boolean;
  saving: boolean;
  /** Porcentaje de la subida del adjunto mientras se guarda. */
  uploadProgress: number | null;
  onBack: () => void;
  onSave: () => void;
}

function saveLabel(saving: boolean, uploadProgress: number | null): string {
  if (uploadProgress !== null) return `Subiendo archivo… ${uploadProgress}%`;
  return saving ? 'Guardando...' : 'Guardar y volver';
}

/** Volver al constructor, qué se edita y el guardado. */
export function EditorHeader({ kind, isNew, readOnly, saving, uploadProgress, onBack, onSave }: Props) {
  const { label, Icon, colorClass } = KIND_PRESENTATION[kind];
  const action = isNew ? 'Nuevo recurso:' : 'Editando';
  const heading = readOnly ? `${label} (solo lectura)` : `${action} ${label.toLowerCase()}`;

  return (
    <header className="mb-6 flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={onBack}
        className="p-3 bg-muted rounded-full hover:bg-border transition-colors"
        aria-label="Volver al constructor"
      >
        <ArrowLeft className="h-5 w-5 text-muted-foreground" />
      </button>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Icon className={`h-6 w-6 ${colorClass}`} />
          {heading}
        </h1>
        <p className="text-muted-foreground text-sm">
          {readOnly
            ? 'Puedes consultar el contenido, pero no cambiarlo.'
            : 'Modifica el contenido y guarda para volver al curso.'}
        </p>
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="ml-auto px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-transform shadow-md bg-primary hover:bg-primary/90 text-primary-foreground hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <Save className="h-5 w-5" />
          {saveLabel(saving, uploadProgress)}
        </button>
      )}
    </header>
  );
}
