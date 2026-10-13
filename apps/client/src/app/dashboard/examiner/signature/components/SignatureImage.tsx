'use client';

import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { imageAccept, imageFormatNames } from '@/lib/image-formats';
import { IMAGE_LIMITS_MB, formatMb } from '@/lib/upload-limits';

const FORMAT_HINT = `${imageFormatNames('firmas')} — máximo ${formatMb(IMAGE_LIMITS_MB.firmas)}`;

interface Props {
  /** La elegida sin guardar o la guardada; `null` si no hay firma. */
  imageUrl: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/** Imagen escaneada de la firma: elegirla, cambiarla o quitarla hasta pulsar «Guardar». */
export function SignatureImage({ imageUrl, onPick, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const pickFile = () => input.current?.click();

  return (
    <div className="p-6">
      <input
        ref={input}
        type="file"
        accept={imageAccept('firmas')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Vaciarlo permite volver a elegir el mismo archivo.
          e.target.value = '';
          if (file) onPick(file);
        }}
      />

      {imageUrl ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-background border border-border/50 rounded-xl">
          <div className="h-16 w-32 bg-muted/50 rounded-lg border border-dashed border-border flex items-center justify-center overflow-hidden">
            <SignatureThumbnail url={imageUrl} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Firma cargada</p>
            <p className="text-xs text-muted-foreground">
              Esta imagen aparecerá sobre la línea de firma en los certificados que emitas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={pickFile}
              className="text-xs font-bold px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs font-bold px-3 py-2 bg-red-500/10 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
              aria-label="Quitar firma"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pickFile}
          className="w-full flex flex-col items-center justify-center gap-3 p-8 bg-background border-2 border-dashed border-border/60 rounded-xl hover:border-primary/40 transition-colors group"
        >
          <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
          <span className="text-center">
            <span className="block text-sm font-bold text-foreground">Elegir imagen de firma</span>
            <span className="block text-xs text-muted-foreground">{FORMAT_HINT}</span>
          </span>
        </button>
      )}
    </div>
  );
}

/** Miniatura que avisa si la imagen no carga, y vuelve a intentarlo cuando cambia la firma. */
function SignatureThumbnail({ url }: { url: string }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  if (brokenUrl === url) {
    return <span className="text-[10px] text-muted-foreground text-center px-1">No se pudo mostrar</span>;
  }
  return (
    <img src={url} alt="Firma" className="max-h-full max-w-full object-contain" onError={() => setBrokenUrl(url)} />
  );
}
