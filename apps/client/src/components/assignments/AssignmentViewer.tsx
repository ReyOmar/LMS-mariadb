'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  File as FileIcon,
  Loader2,
  Trophy,
  AlertTriangle,
  Paperclip,
  CheckCircle2,
  Download,
  Award,
} from 'lucide-react';
import api, { errorMessage, uploadFile, fileUrlFor } from '@/lib/api';
import { fileSizeWarning, formatMb, submissionLimit } from '@/lib/upload-limits';
import { useConfig } from '@/contexts/ConfigContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { isPassing, formatPoints, MAX_SCORE } from '@/lib/grading';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { sanitizeHTML } from '@/lib/sanitize';
import { externalUrl } from '@/lib/resources';
import type { Submission } from '@/types/models';
import { fullDate } from '@/lib/dates';
import { ALLOWED_EXTENSIONS, fileTypeWarning } from './allowed-files';

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
}: AssignmentViewerProps) {
  // El mismo límite que aplicará el servidor: el de la tarea o, sin él, el general de la sede.
  const { config } = useConfig();
  const limit = submissionLimit(maxUploadMb, config?.maxFileMb, config?.uploadCeilingMb);
  const limitText = limit ? `Tamaño máximo: ${formatMb(limit.maxMb)}` : null;
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // La pantalla del curso pasa una función nueva en cada render. Si la carga dependiera de
  // ella, una tarea calificada avisaría al curso, el curso se volvería a pintar y la carga
  // se repetiría sin fin.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const loadState = useCallback(async () => {
    try {
      const { data } = await api.get<Submission>(`/assessments/assignments/${resourceGuid}/submissions/mine`);
      if (data?.status && data.status !== 'PENDING') {
        setSubmission(data);
        setUploadStatus('done');
        if (data.status === 'GRADED') onFinishRef.current();
      }
    } catch {
      // Sin entrega todavía: se muestra la zona de subida.
    } finally {
      setLoading(false);
    }
  }, [resourceGuid]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  // El examinador puede calificar mientras el alumno tiene la página abierta.
  useRealtimeEvent('submission:graded', (data) => {
    if ((data as { assignmentGuid?: string })?.assignmentGuid === resourceGuid) void loadState();
  });

  const processFile = async (file: File) => {
    setUploadError(null);

    const warning = fileTypeWarning(file.name) ?? fileSizeWarning(file, limit);
    if (warning) {
      setUploadError(warning);
      return;
    }

    try {
      setUploadStatus('uploading');
      setUploadProgress(0);
      const data = await uploadFile<Submission>(`/assessments/assignments/${resourceGuid}/submissions`, file, {
        limit,
        onProgress: setUploadProgress,
      });
      setSubmission(data);
      setUploadStatus('done');
      onFinish();
    } catch (error) {
      setUploadError(errorMessage(error, 'No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.'));
      // Si ya había una entrega, sigue siendo la válida: se vuelve a mostrar con el aviso.
      setUploadStatus(submission ? 'done' : 'idle');
    }
  };

  /** La API entrega la URL ya firmada: aquí sólo se abre. */
  const onDownload = () => {
    const url = fileUrlFor(submission?.fileUrl);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Se vacía para que elegir otra vez el mismo archivo, ya corregido, vuelva a enviarlo.
    e.target.value = '';
    if (file) processFile(file);
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
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const score = submission?.score ?? null;
  const feedback = submission?.feedback ?? '';
  const isPassed = submission?.status === 'GRADED' && isPassing(score, passingScore);

  if (loading) {
    return <PageLoader message="Cargando detalles de la tarea…" />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Instrucciones */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm">
        <div className="p-5 border-b border-border bg-muted/20 flex items-center gap-2">
          <h2 className="font-bold text-lg text-foreground">Instrucciones de la tarea</h2>
        </div>
        <div className="p-8 prose prose-slate dark:prose-invert max-w-none text-foreground/90">
          {instructionsHtml ? (
            <div dangerouslySetInnerHTML={sanitizeHTML(instructionsHtml)} />
          ) : (
            <p className="text-muted-foreground italic m-0">Sin instrucciones adicionales.</p>
          )}
        </div>
      </div>

      {/* Recursos de apoyo que aporta el administrador */}
      {(attachmentUrl || referenceUrl) && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-sm text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Recursos de apoyo
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {referenceUrl && (
              <a
                href={externalUrl(referenceUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl hover:border-blue-500/50 hover:shadow-md transition-all group"
              >
                <div className="h-10 w-10 bg-blue-500/10 text-blue-500 flex items-center justify-center rounded-lg group-hover:scale-110 transition-transform">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                  </svg>
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-bold truncate">Enlace de referencia</div>
                  <div className="text-xs text-muted-foreground truncate">{referenceUrl}</div>
                </div>
              </a>
            )}
            {attachmentUrl && (
              <a
                href={fileUrlFor(attachmentUrl) ?? ''}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl hover:border-blue-500/50 hover:shadow-md transition-all group"
              >
                <div className="h-10 w-10 bg-blue-500/10 text-blue-500 flex items-center justify-center rounded-lg group-hover:scale-110 transition-transform">
                  <Paperclip className="h-5 w-5" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-bold truncate">{attachmentName || 'Archivo adjunto'}</div>
                  <div className="text-xs text-muted-foreground">Descargar documento</div>
                </div>
              </a>
            )}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Nota y comentario del examinador */}
        {submission?.status === 'GRADED' && (
          <div className="bg-amber-500/5 border-b border-amber-500/20 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4 flex-1">
              <div className="h-12 w-12 bg-amber-500/20 text-amber-600 flex items-center justify-center rounded-xl shrink-0 mt-1">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-amber-700 dark:text-amber-400 text-lg">Tarea calificada</h3>
                <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
                  Tu examinador ha revisado y calificado tu entrega.
                </p>
                {feedback && (
                  <div className="bg-background/80 border border-amber-500/20 rounded-lg p-3 text-sm italic text-foreground">
                    {feedback}
                  </div>
                )}
                {!isPassed && passingScore !== undefined && (
                  <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    Necesitas {formatPoints(passingScore)} puntos para aprobar. Puedes subir una versión corregida.
                  </p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 bg-background/50 p-4 rounded-xl border border-amber-500/20">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">
                Calificación obtenida
              </div>
              <div className="text-4xl font-black text-amber-700 dark:text-amber-400">
                {formatPoints(score)} <span className="text-base text-muted-foreground">/ {MAX_SCORE}</span>
              </div>
            </div>
          </div>
        )}

        {/* Zona de subida, o la entrega ya realizada */}
        <div
          className={`relative p-8 transition-all duration-300 
                        ${draggingFile && !isPassed ? 'bg-primary/5 border-dashed border-2 border-primary' : uploadStatus === 'done' ? 'bg-emerald-500/5 border-b border-emerald-500/20' : 'bg-card'}
                    `}
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
                    className={`text-sm font-semibold truncate ${submission.filePurged ? 'text-muted-foreground' : 'text-foreground'}`}
                  >
                    {submission.fileName}
                  </p>
                  {submission.filePurged ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md mt-0.5"
                      title="El archivo fue eliminado automáticamente tras obtener el certificado para optimizar recursos"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Archivo liberado
                    </span>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Archivo entregado</p>
                  )}
                </div>
                {submission.fileUrl && !submission.filePurged && !readOnly && (
                  <button
                    onClick={onDownload}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold flex items-center gap-2 transition-transform hover:scale-105"
                    title="Descargar archivo"
                  >
                    <Download className="h-4 w-4" /> Descargar
                  </button>
                )}
              </div>

              {!readOnly && !submission.filePurged && !isPassed && (
                <div className="mt-2 flex flex-col items-center gap-1">
                  <button
                    onClick={() => fileInput.current?.click()}
                    className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
                  >
                    <UploadCloud className="h-4 w-4" /> Subir archivo diferente (reemplazar)
                  </button>
                  {limitText && <span className="text-xs text-muted-foreground">{limitText}</span>}
                  {uploadError && (
                    <span className="text-xs font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {uploadError}
                    </span>
                  )}
                </div>
              )}
              {isPassed && (
                <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                  <Trophy className="h-4 w-4" /> Tarea aprobada — no se permite reemplazar
                </div>
              )}
            </div>
          ) : uploadStatus === 'uploading' ? (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                {uploadProgress < 100 && (
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">
                    {uploadProgress}%
                  </span>
                )}
              </div>
              <div className="w-full max-w-xs">
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {/* Enviado todo, el servidor aún comprueba y guarda el archivo: con uno grande tarda. */}
                  {uploadProgress < 100 ? 'Subiendo tu entrega...' : 'Procesando tu entrega…'}
                </h3>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Por favor no cierres esta ventana</p>
              </div>
            </div>
          ) : (
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
                  <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg w-fit mx-auto mb-2">
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
                onClick={() => fileInput.current?.click()}
                className="flex items-center justify-center gap-2 font-bold px-8 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md hover:scale-105 transition-all mt-2"
              >
                <UploadCloud className="h-5 w-5" /> Seleccionar archivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
