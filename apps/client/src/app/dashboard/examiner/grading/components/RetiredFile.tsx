import { FileX } from 'lucide-react';

const FILE_RETIRED_MESSAGE = 'Archivo retirado al emitir el certificado del alumno.';

/** Archivo de una entrega que ya no está en el disco: se conserva su nombre, sin descarga. */
export function RetiredFile({ fileName }: { fileName: string | null | undefined }) {
  return (
    <span className="flex items-start gap-2 text-xs text-muted-foreground max-w-[260px]">
      <FileX className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {fileName && <span className="block font-bold truncate">{fileName}</span>}
        <span className="block">{FILE_RETIRED_MESSAGE}</span>
      </span>
    </span>
  );
}
