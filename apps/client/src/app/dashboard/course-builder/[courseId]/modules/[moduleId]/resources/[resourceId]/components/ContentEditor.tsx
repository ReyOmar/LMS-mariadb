'use client';

import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';
import { sanitizeHTML } from '@/lib/sanitize';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

/**
 * Con el módulo de tablas de Quill una tabla del texto se conserva al editarlo: sin él, Quill la
 * convierte en párrafos sueltos y, al guardar, se perdería.
 */
const EDITOR_MODULES = { table: true };

interface Props {
  label: string;
  placeholder: string;
  value: string;
  readOnly: boolean;
  onChange: (html: string) => void;
}

/** Texto enriquecido del recurso: el párrafo o las instrucciones de la actividad. */
export function ContentEditor({ label, placeholder, value, readOnly, onChange }: Props) {
  // En modo consulta, el texto tal como lo verá el alumno: igual que la vista previa del curso.
  if (readOnly) {
    return (
      <div className="flex flex-col flex-1 min-h-[300px]">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">{label}</span>
        <div
          className="prose dark:prose-invert max-w-none bg-background rounded-xl border border-border/50 mt-2 p-4 sm:p-6"
          dangerouslySetInnerHTML={sanitizeHTML(value)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-[300px]">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">{label}</span>
      <div className="bg-background rounded-xl border border-border/50 flex-1 flex flex-col mt-2">
        <ReactQuill
          theme="snow"
          value={value}
          // Quill normaliza el HTML al cargarlo: sólo lo que escribe la persona cuenta como cambio.
          onChange={(html, _delta, source) => {
            if (source === 'user') onChange(html);
          }}
          modules={EDITOR_MODULES}
          className="flex-1 min-h-[250px]"
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
