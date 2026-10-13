'use client';

import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

/** En modo consulta el editor de texto no enseña la barra de formato. */
const READ_ONLY_MODULES = { toolbar: false };

interface Props {
  label: string;
  placeholder: string;
  value: string;
  readOnly: boolean;
  onChange: (html: string) => void;
}

/** Texto enriquecido del recurso: el párrafo o las instrucciones de la actividad. */
export function ContentEditor({ label, placeholder, value, readOnly, onChange }: Props) {
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
          readOnly={readOnly}
          modules={readOnly ? READ_ONLY_MODULES : undefined}
          className="flex-1 min-h-[250px]"
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
