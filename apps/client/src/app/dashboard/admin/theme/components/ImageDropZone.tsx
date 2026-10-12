'use client';

import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Field } from './ThemeSection';

const OBJECT_FIT = { cover: 'object-cover', contain: 'object-contain' } as const;

interface Props {
  label: string;
  hint: string;
  /** Dirección que puede pintar el navegador: la guardada o la vista previa de la elegida. */
  imageUrl: string | null;
  /** Formatos que admite la carpeta de destino, para no dejar elegir los que el servidor rechaza. */
  accept: string;
  onPick: (file: File) => void;
  onRemove: () => void;
  height: string;
  fit?: keyof typeof OBJECT_FIT;
}

export function ImageDropZone({ label, hint, imageUrl, accept, onPick, onRemove, height, fit = 'cover' }: Props) {
  const input = useRef<HTMLInputElement>(null);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onPick(file);
  };

  return (
    <Field label={label} hint={hint}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={`${label}: pulsa para elegir una imagen`}
        className={`${height} w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl flex flex-col items-center justify-center transition-all hover:bg-muted/20 relative overflow-hidden`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className={`h-full w-full ${OBJECT_FIT[fit]} p-2`} />
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground">Pulsa para elegir una imagen</span>
          </>
        )}
      </button>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={onChange} />

      {imageUrl && (
        <button type="button" onClick={onRemove} className="mt-2 text-xs font-bold text-destructive hover:underline">
          Quitar imagen
        </button>
      )}
    </Field>
  );
}
