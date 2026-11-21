'use client';

import { useRef, useState } from 'react';
import {
  UploadCloud,
  File as FileIcon,
  Loader2,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  Download,
  Award,
} from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { formatMb, submissionLimit } from '@/lib/upload-limits';
import { useConfig } from '@/contexts/ConfigContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { isPassing, formatScoreValue, MAX_SCORE } from '@/lib/grading';
import { useCountry } from '@/contexts/CountryContext';
import { sanitizeHTML } from '@/lib/sanitize';
import { hasContent } from '@/lib/editor-html';
import { SupportMaterials } from '@/components/resources/SupportMaterials';
import type { Submission } from '@/types/models';
import { fullDate } from '@/lib/dates';
import { ALLOWED_EXTENSIONS } from './allowed-files';
import { useAssignmentSubmission } from './useAssignmentSubmission';

interface AssignmentViewerProps {
  resourceGuid: string;
  instructionsHtml: string;
  /** URL firmada del material de apoyo, tal y como la devuelve la API. */
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  referenceUrl?: string | null;
  /** Tope propio de la actividad. Sin él manda el de la sede. */
  maxUploadMb?: number | null;
  /** Nota mínima del curso, para explicar al alumno qué le falta. */
  passingScore?: number;
  readOnly?: boolean;
  onFinish: () => void;
  /**
   * Recibe los rechazos de la API para que el curso decida si el alumno sigue teniendo
   * acceso (baja, mantenimiento). Devuelve si se ha hecho cargo; si no, avisa el visor.
   */
  onAccessError?: (error: unknown, title: string) => boolean;
}

/**
 * Entrega de una tarea por parte del alumno.
 *
 * El avance del curso no se marca desde aquí: al aprobar la entrega, el servidor registra
 * el progreso en la misma operación, y así nadie puede darse por completada una tarea sin
 * haberla aprobado.
 */
export default function AssignmentViewer({
  resourceGuid,
  instructionsHtml,
  attachmentUrl,
  attachmentName,
  referenceUrl,
  maxUploadMb,
  passingScore,
  readOnly = false,
  onFinish,
  onAccessError,
}: AssignmentViewerProps) {
  // El mismo límite que aplicará el servidor: el de la tarea o, sin él, el general de la sede.
  const { config } = useConfig();
  const limit = submissionLimit(maxUploadMb, config?.maxFileMb, config?.uploadCeilingMb);
  const limitText = limit ? `Tamaño máximo: ${formatMb(limit.maxMb)}` : null;
  const { loading, uploadStatus, uploadProgress, uploadError, submission, submit } = useAssignmentSubmission({
    resourceGuid,
    limit,
    onFinish,
    onAccessError,
  });
  const [draggingFile, setDraggingFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickFile = () => fileInput.current?.click();

  const isPassed = submission?.status === 'GRADED' && isPassing(submission?.score ?? null, passingScore);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Se vacía para que elegir otra vez el mismo archivo, ya corregido, vuelva a enviarlo.
    e.target.value = '';
    if (file) void submit(file);
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingFile(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingFile(false);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDraggingFile(false);
    if (e.dataTransfer.files?.[0]) void submit(e.dataTransfer.files[0]);
  };

  if (loading) {
    return <PageLoader message="Cargando detalles de la tarea…" />;
  }

  const dropZoneTone =
    draggingFile && !isPassed
      ? 'bg-primary/5 border-dashed border-2 border-primary'
      : uploadStatus === 'done'
        ? 'bg-emerald-500/5 border-b border-emerald-500/20'
        : 'bg-card';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Instructions html={instructionsHtml} />

      <SupportMaterials referenceUrl={referenceUrl} attachmentUrl={attachmentUrl} attachmentName={attachmentName} />

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {submission?.status === 'GRADED' && (
          <GradeSummary submission={submission} passed={isPassed} passingScore={passingScore} />
        )}

        {/* Zona de subida, o la entrega ya realizada */}
        <div
          className={`relative p-8 transition-all duration-300 ${dropZoneTone}`}
          onDragOver={isPassed ? undefined : onDragOver}
          onDragLeave={isPassed ? undefined : onDragLeave}
          onDrop={isPassed ? undefined : onDrop}
        >
          <input
            type="file"
            className="hidden"
            ref={fileInput}
            onChange={onFileChange}
            accept={ALLOWED_EXTENSIONS.join(',')}
          />

          {uploadStatus === 'done' && submission ? (
            <DeliveredSubmission
              submission={submission}
              canReplace={!readOnly && !submission.filePurged && !isPassed}
              passed={isPassed}
              limitText={limitText}
              uploadError={uploadError}
              onReplace={pickFile}
            />
          ) : uploadStatus === 'uploading' ? (
            <UploadInProgress progress={uploadProgress} />
          ) : (
            <UploadPrompt limitText={limitText} uploadError={uploadError} onPick={pickFile} />
          )}
        </div>
      </div>
    </div>
  );
}

function Instructions({ html }: { html: string }) {
  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm">
      <div className="p-5 border-b border-border bg-muted/20 flex items-center gap-2">
        <h2 className="font-bold text-lg text-foreground">Instrucciones de la tarea</h2>
      </div>
      <div className="p-8 prose prose-slate dark:prose-invert max-w-none text-foreground/90">
        {hasContent(html) ? (
          <div dangerouslySetInnerHTML={sanitizeHTML(html)} />
        ) : (
          <p className="text-muted-foreground italic m-0">Sin instrucciones adicionales.</p>
        )}
      </div>
    </div>
  );
}

/** La nota y el comentario del examinador; si no llega al mínimo, cuánto le falta. */
function GradeSummary({
  submission,
  passed,
  passingScore,
}: {
  submission: Submission;
  passed: boolean;
  passingScore?: number;
}) {
  const { country } = useCountry();
  const points = (value: unknown) => formatScoreValue(value, country);
  const feedback = submission.feedback ?? '';

  return (
    <div className="bg-amber-500/5 border-b border-amber-500/20 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-start gap-4 flex-1">
        <div className="h-12 w-12 bg-amber-500/20 text-amber-600 flex items-center justify-center rounded-xl shrink-0 mt-1">
          <Award className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-bold text-amber-800 dark:text-amber-400 text-lg">Tarea calificada</h3>
          <p className="text-sm text-amber-800 dark:text-amber-400 mb-2">
            Tu examinador ha revisado y calificado tu entrega.
          </p>
          {feedback && (
            <div className="bg-background/80 border border-amber-500/20 rounded-lg p-3 text-sm italic text-foreground">
              {feedback}
            </div>
          )}
          {!passed && passingScore !== undefined && (
            <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-400">
              Necesitas {points(passingScore)} puntos para aprobar. Puedes subir una versión corregida.
            </p>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 bg-background/50 p-4 rounded-xl border border-amber-500/20">
        <div className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-1">
          Calificación obtenida
        </div>
        <div className="text-4xl font-black text-amber-800 dark:text-amber-400">
          {points(submission.score ?? null)} <span className="text-base text-muted-foreground">/ {MAX_SCORE}</span>
        </div>
      </div>
    </div>
  );
}

/** La entrega ya hecha: el archivo, para descargarlo, y la opción de sustituirlo mientras se pueda. */
function DeliveredSubmission({
  submission,
  canReplace,
  passed,
  limitText,
  uploadError,
  onReplace,
}: {
  submission: Submission;
  canReplace: boolean;
  passed: boolean;
  limitText: string | null;
  uploadError: string | null;
  onReplace: () => void;
}) {
  /** La API entrega la URL ya firmada: aquí sólo se abre. */
  const onDownload = () => {
    const url = fileUrlFor(submission.fileUrl);
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-foreground mb-1">Entrega realizada con éxito</h3>
        <p className="text-sm text-muted-foreground">
          {submission.submittedAt
            ? `Entregado el ${fullDate(submission.submittedAt)}`
            : 'Tu archivo ha sido enviado y está registrado'}
        </p>
      </div>

      {/* Tarjeta del archivo subido */}
      <div className="w-full max-w-md bg-background border border-border/60 rounded-xl p-4 flex items-center gap-4 shadow-sm">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${submission.filePurged ? 'bg-muted' : 'bg-primary/10'}`}
        >
          <FileIcon className={`h-6 w-6 ${submission.filePurged ? 'text-muted-foreground' : 'text-primary'}`} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p
            className={`text-sm font-semibold line-clamp-2 [overflow-wrap:anywhere] ${submission.filePurged ? 'text-muted-foreground' : 'text-foreground'}`}
            title={submission.fileName ?? undefined}
          >
            {submission.fileName}
          </p>
          {submission.filePurged ? (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-400 mt-0.5">
              El archivo de esta entrega ya no está disponible.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Archivo entregado</p>
          )}
        </div>
        {/* También en modo repaso: es su propio documento. */}
        {submission.fileUrl && !submission.filePurged && (
          <button
            onClick={onDownload}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold flex items-center gap-2 transition-transform hover:scale-105"
            title="Descargar archivo"
          >
            <Download className="h-4 w-4" /> Descargar
          </button>
        )}
      </div>

      {canReplace && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <button
            onClick={onReplace}
            className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
          >
            <UploadCloud className="h-4 w-4" /> Subir archivo diferente (reemplazar)
          </button>
          {limitText && <span className="text-xs text-muted-foreground">{limitText}</span>}
          {uploadError && (
            <span className="text-sm font-medium text-red-700 dark:text-red-400 flex items-start gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {uploadError}
            </span>
          )}
        </div>
      )}
      {passed && (
        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg">
          <Trophy className="h-4 w-4" /> Tarea aprobada — no se permite reemplazar
        </div>
      )}
    </div>
  );
}

function UploadInProgress({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-6">
      <div className="relative">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        {progress < 100 && (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">
            {progress}%
          </span>
        )}
      </div>
      <div className="w-full max-w-xs">
        <h3 className="text-lg font-bold text-foreground mb-2">
          {/* Enviado todo, el servidor aún comprueba y guarda el archivo: con uno grande tarda. */}
          {progress < 100 ? 'Subiendo tu entrega...' : 'Procesando tu entrega…'}
        </h3>
        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Por favor no cierres esta ventana</p>
      </div>
    </div>
  );
}

function UploadPrompt({
  limitText,
  uploadError,
  onPick,
}: {
  limitText: string | null;
  uploadError: string | null;
  onPick: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-6">
      <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
        <UploadCloud className="h-10 w-10 text-primary" />
      </div>
      <div>
        <h3 className="font-bold text-2xl mb-2">Sube tu resolución de la tarea</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-4">
          Arrastra tu documento aquí o haz clic para buscarlo en tu dispositivo.
        </p>
        {limitText && (
          <div className="flex items-center justify-center gap-2 text-amber-800 dark:text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg w-fit mx-auto mb-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">{limitText}</span>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 rounded-xl text-sm font-medium flex items-center justify-center gap-2 max-w-sm mx-auto">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {uploadError}
        </div>
      )}

      <button
        onClick={onPick}
        className="flex items-center justify-center gap-2 font-bold px-8 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md hover:scale-105 transition-all mt-2"
      >
        <UploadCloud className="h-5 w-5" /> Seleccionar archivo
      </button>
    </div>
  );
}
