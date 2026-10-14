'use client';

import { useRef } from 'react';
import { Download, Image as ImageIcon, Loader2, Save, Trash2, UploadCloud, X } from 'lucide-react';
import { imageAccept, imageFormatNames } from '@/lib/image-formats';
import { IMAGE_LIMITS_MB, formatMb } from '@/lib/upload-limits';
import type { CoverEditor } from '../useCoverEditor';

const FORMAT_HINT = `${imageFormatNames('portadas')}, máximo ${formatMb(IMAGE_LIMITS_MB.portadas)}.`;

const BUTTON =
  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50';

interface Props {
  courseTitle: string;
  /** La portada guardada, o `null` si no tiene. */
  savedUrl: string | null;
  cover: CoverEditor;
  /** Con el curso publicado la portada no se toca: ni la guardada ni una elegida antes. */
  readOnly: boolean;
}

/** Portada del curso: la elegida se ve al momento y no se sube hasta «Guardar portada». */
export function CoverField({ courseTitle, savedUrl, cover, readOnly }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const shownUrl = cover.previewUrl ?? savedUrl;
  const pendingLocked = readOnly || cover.saving;

  return (
    <div className="w-full bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-8 mb-8 flex flex-col items-center">
      <h3 className="text-lg font-bold mb-4 w-full text-left">Portada del curso</h3>
      <div className="w-full max-w-md h-56 bg-muted rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
        {shownUrl ? (
          <img src={shownUrl} alt={`Portada de ${courseTitle}`} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center text-muted-foreground opacity-60">
            <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
            <span className="text-sm font-medium">Sin portada</span>
          </div>
        )}
      </div>

      <input
        ref={input}
        type="file"
        className="hidden"
        accept={imageAccept('portadas')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Vaciarlo permite volver a elegir el mismo archivo.
          e.target.value = '';
          if (file) cover.pick(file);
        }}
      />

      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {cover.previewUrl ? (
          <>
            <button
              type="button"
              onClick={() => void cover.save()}
              disabled={pendingLocked}
              className={`${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {cover.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {cover.saving ? 'Guardando portada…' : 'Guardar portada'}
            </button>
            <button
              type="button"
              onClick={cover.discard}
              disabled={pendingLocked}
              className={`${BUTTON} bg-muted hover:bg-border`}
            >
              <X className="h-4 w-4" /> Descartar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={readOnly}
              className={`${BUTTON} bg-primary/10 text-primary hover:bg-primary/20`}
            >
              <UploadCloud className="h-4 w-4" /> {savedUrl ? 'Cambiar portada' : 'Elegir portada'}
            </button>
            {savedUrl && (
              <>
                <a href={savedUrl} download className={`${BUTTON} bg-muted hover:bg-border`}>
                  <Download className="h-4 w-4" /> Descargar
                </a>
                <button
                  type="button"
                  onClick={() => void cover.remove()}
                  disabled={readOnly}
                  className={`${BUTTON} bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20`}
                >
                  <Trash2 className="h-4 w-4" /> Quitar
                </button>
              </>
            )}
          </>
        )}
      </div>

      <p className="text-center w-full mt-4 text-sm text-muted-foreground">
        Se muestra en los tableros de los estudiantes, examinadores y administradores. {FORMAT_HINT}
      </p>
    </div>
  );
}
