import { fileUrlFor } from '@/lib/api';
import type { CourseSigner } from '../useCertificateSample';

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">
        {value || <span className="text-muted-foreground italic">Sin configurar</span>}
      </p>
    </div>
  );
}

export function SignerDetails({ teacher }: { teacher: CourseSigner['teacher'] }) {
  const signature = fileUrlFor(teacher.signatureUrl);

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
        Datos del examinador del curso
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Detail label="Nombre" value={`${teacher.firstName} ${teacher.lastName}`} />
        <Detail label="Nombre en firma" value={teacher.signatureName} />
        <Detail label="Cargo" value={teacher.signatureTitle} />
      </div>
      {signature && (
        <div className="mt-3 flex items-center gap-3 p-3 bg-white dark:bg-background rounded-lg border border-border/50">
          <div className="h-12 w-28 bg-muted/30 rounded-lg border border-dashed border-border flex items-center justify-center overflow-hidden">
            <img src={signature} alt="Firma" className="max-h-full max-w-full object-contain" />
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">✓ Imagen de firma cargada</p>
        </div>
      )}
      {!signature && !teacher.signatureName && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 font-medium">
          ⚠ Este examinador aún no ha configurado su firma. Se usará su nombre por defecto.
        </p>
      )}
    </div>
  );
}
