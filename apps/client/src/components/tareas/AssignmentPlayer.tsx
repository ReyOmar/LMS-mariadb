'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  UploadCloud,
  File as FileIcon,
  Loader2,
  Trophy,
  Clock,
  AlertTriangle,
  Paperclip,
  CheckCircle2,
  Download,
  Award,
} from 'lucide-react';
import api, { mensajeDeError, urlDeArchivo } from '@/lib/api';
import { esAprobada, formatearPuntos, NOTA_MAXIMA } from '@/lib/calificacion';
import { useEventoRealtime } from '@/contexts/RealtimeContext';
import { sanitizeHTML } from '@/lib/sanitize';

interface AssignmentPlayerProps {
  curso_id: string;
  recurso_guid: string;
  bloque_titulo: string;
  instrucciones_html: string;
  /** URL firmada del material de apoyo, tal y como la devuelve la API. */
  archivo_adjunto_url?: string | null;
  archivo_adjunto_nombre?: string | null;
  url_referencia?: string | null;
  archivo_max_size_mb?: number;
  /** Nota mínima del curso, para explicar al alumno qué le falta. */
  nota_aprobacion?: number;
  readOnly?: boolean;
  onFinish: () => void;
}

export default function AssignmentPlayer({
  curso_id,
  recurso_guid,
  bloque_titulo,
  instrucciones_html,
  archivo_adjunto_url,
  archivo_adjunto_nombre,
  url_referencia,
  archivo_max_size_mb = 5,
  nota_aprobacion,
  readOnly = false,
  onFinish,
}: AssignmentPlayerProps) {
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [entrega, setEntrega] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Estado de la entrega del alumno.
   *
   * Ya no hace falta marcar el recurso como completado desde aquí: al aprobar la entrega,
   * el servidor registra el progreso dentro de la misma operación. Hacerlo desde el
   * navegador permitía darse por completada una tarea sin haberla aprobado.
   */
  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/evaluaciones/tareas/${recurso_guid}/entregas/mia`);
      if (data?.estado && data.estado !== 'PENDIENTE') {
        setEntrega(data);
        setUploadState('done');
        if (data.estado === 'CALIFICADA') onFinish();
      }
    } catch {
      // Sin entrega todavía: se muestra la zona de subida.
    } finally {
      setLoading(false);
    }
  }, [recurso_guid, onFinish]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // El examinador puede calificar mientras el alumno tiene la página abierta.
  useEventoRealtime('submission:graded', (datos) => {
    if ((datos as { tarea_guid?: string })?.tarea_guid === recurso_guid) void fetchStatus();
  });

  const ALLOWED_EXTENSIONS = [
    '.pdf',
    '.doc',
    '.docx',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
    '.txt',
    '.zip',
    '.rar',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.mp4',
    '.mp3',
  ];

  const processFile = async (file: File) => {
    setUploadError(null);

    // Validate file extension before uploading
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : '';
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      const friendlyList = ALLOWED_EXTENSIONS.map((e) => e.replace('.', '').toUpperCase()).join(', ');
      setUploadError(
        `El tipo de archivo "${ext || 'desconocido'}" no es compatible. Formatos permitidos: ${friendlyList}.`,
      );
      return;
    }

    const maxBytes = archivo_max_size_mb * 1024 * 1024;
    if (file.size > maxBytes) {
      setUploadError(`El archivo pesa demasiado. El límite es de ${archivo_max_size_mb} MB.`);
      return;
    }
    try {
      setUploadState('uploading');
      setUploadProgress(0);
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/evaluaciones/tareas/${recurso_guid}/entregas`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        maxBodyLength: 50 * 1024 * 1024,
        maxContentLength: 50 * 1024 * 1024,
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total));
        },
      });
      setEntrega(data);
      setUploadState('done');
      onFinish();
    } catch (error) {
      setUploadError(mensajeDeError(error, 'No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.'));
      setUploadState('idle');
    }
  };

  /** La API entrega la URL ya firmada: aquí sólo se abre. */
  const handleDownload = () => {
    const url = urlDeArchivo(entrega?.archivo_url);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  // La nota y el comentario llegan en campos propios. Antes se extraían partiendo la
  // cadena "NOTA: 4.5 | comentario", que se rompía en cuanto el comentario tenía una barra.
  const calificacion: number | null = entrega?.calificacion ?? null;
  const comentario: string = entrega?.comentario ?? '';
  const isApproved = entrega?.estado === 'CALIFICADA' && esAprobada(calificacion, nota_aprobacion);

  if (loading) {
    return (
      <div className="p-12 text-center text-muted-foreground animate-pulse font-medium">
        Cargando detalles de la tarea...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Instrucciones */}
      <div className="bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm">
        <div className="p-5 border-b border-border bg-muted/20 flex items-center gap-2">
          <h2 className="font-bold text-lg text-foreground">Instrucciones de la Tarea</h2>
        </div>
        <div className="p-8 prose prose-slate dark:prose-invert max-w-none text-foreground/90">
          {instrucciones_html ? (
            <div dangerouslySetInnerHTML={sanitizeHTML(instrucciones_html)} />
          ) : (
            <p className="text-muted-foreground italic m-0">Sin instrucciones adicionales.</p>
          )}
        </div>
      </div>

      {/* Recursos de Apoyo (Admin-provided files) */}
      {(archivo_adjunto_url || url_referencia) && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-sm text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Recursos de Apoyo
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {url_referencia && (
              <a
                href={(() => {
                  const u = url_referencia || '';
                  return /^https?:\/\//i.test(u) || u.startsWith('//') ? u : `https://${u}`;
                })()}
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
                  <div className="text-sm font-bold truncate">Enlace de Referencia</div>
                  <div className="text-xs text-muted-foreground truncate">{url_referencia}</div>
                </div>
              </a>
            )}
            {archivo_adjunto_url && (
              <a
                href={urlDeArchivo(archivo_adjunto_url) ?? ''}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl hover:border-blue-500/50 hover:shadow-md transition-all group"
              >
                <div className="h-10 w-10 bg-blue-500/10 text-blue-500 flex items-center justify-center rounded-lg group-hover:scale-110 transition-transform">
                  <Paperclip className="h-5 w-5" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-bold truncate">{archivo_adjunto_nombre || 'Archivo adjunto'}</div>
                  <div className="text-xs text-muted-foreground">Descargar Documento</div>
                </div>
              </a>
            )}
          </div>
        </div>
      )}

      {/* STATUS / UPLOAD PANEL */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Feedback del Examinador (Sólo si está calificada o tiene comentario) */}
        {entrega?.estado === 'CALIFICADA' && (
          <div className="bg-amber-500/5 border-b border-amber-500/20 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4 flex-1">
              <div className="h-12 w-12 bg-amber-500/20 text-amber-600 flex items-center justify-center rounded-xl shrink-0 mt-1">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-amber-700 dark:text-amber-400 text-lg">Tarea Calificada</h3>
                <p className="text-sm text-amber-600/80 mb-2">Tu examinador ha revisado y calificado tu entrega.</p>
                {comentario && (
                  <div className="bg-background/80 border border-amber-500/20 rounded-lg p-3 text-sm italic text-foreground">
                    {comentario}
                  </div>
                )}
                {!isApproved && nota_aprobacion !== undefined && (
                  <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                    Necesitas {formatearPuntos(nota_aprobacion)} puntos para aprobar. Puedes subir una versión
                    corregida.
                  </p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 bg-background/50 p-4 rounded-xl border border-amber-500/20">
              <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                Calificación Obtenida
              </div>
              <div className="text-4xl font-black text-amber-500">
                {formatearPuntos(calificacion)}{' '}
                <span className="text-base text-amber-500/50">/ {NOTA_MAXIMA}</span>
              </div>
            </div>
          </div>
        )}

        {/* Zona de Subida / Entrega Realizada */}
        <div
          className={`relative p-8 transition-all duration-300 
                        ${isDragging && !isApproved ? 'bg-primary/5 border-dashed border-2 border-primary' : uploadState === 'done' ? 'bg-emerald-500/5 border-b border-emerald-500/20' : 'bg-card'}
                    `}
          onDragOver={isApproved ? undefined : handleDragOver}
          onDragLeave={isApproved ? undefined : handleDragLeave}
          onDrop={isApproved ? undefined : handleDrop}
        >
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept={ALLOWED_EXTENSIONS.join(',')}
          />

          {uploadState === 'done' && entrega ? (
            /* ── Estado Entregado ── */
            <div className="flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Entrega realizada con éxito</h3>
                <p className="text-sm text-muted-foreground">
                  {entrega.fecha_entrega
                    ? `Entregado el ${new Date(entrega.fecha_entrega).toLocaleString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : 'Tu archivo ha sido enviado y está registrado'}
                </p>
              </div>

              {/* Tarjeta del archivo subido */}
              <div className="w-full max-w-md bg-background border border-border/60 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${entrega.archivo_purgado ? 'bg-muted' : 'bg-primary/10'}`}
                >
                  <FileIcon
                    className={`h-6 w-6 ${entrega.archivo_purgado ? 'text-muted-foreground' : 'text-primary'}`}
                  />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p
                    className={`text-sm font-semibold truncate ${entrega.archivo_purgado ? 'text-muted-foreground' : 'text-foreground'}`}
                  >
                    {entrega.archivo_nombre}
                  </p>
                  {entrega.archivo_purgado ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md mt-0.5"
                      title="El archivo fue eliminado automáticamente tras obtener el certificado para optimizar recursos"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Archivo liberado
                    </span>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Archivo entregado</p>
                  )}
                </div>
                {entrega.archivo_url && !entrega.archivo_purgado && !readOnly && (
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold flex items-center gap-2 transition-transform hover:scale-105"
                    title="Descargar archivo"
                  >
                    <Download className="h-4 w-4" /> Descargar
                  </button>
                )}
              </div>

              {!readOnly && !entrega.archivo_purgado && !isApproved && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
                >
                  <UploadCloud className="h-4 w-4" /> Subir archivo diferente (reemplazar)
                </button>
              )}
              {isApproved && (
                <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                  <Trophy className="h-4 w-4" /> Tarea aprobada — no se permite reemplazar
                </div>
              )}
            </div>
          ) : uploadState === 'uploading' ? (
            /* ── Estado Subiendo con Progress Bar ── */
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full max-w-xs">
                <h3 className="text-lg font-bold text-foreground mb-2">Subiendo tu entrega...</h3>
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
            /* ── Estado Inicial (Subir) ── */
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                <UploadCloud className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-2xl mb-2">Sube tu resolución de la tarea</h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-4">
                  Arrastra tu documento aquí o haz clic para buscarlo en tu dispositivo.
                </p>
                <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-500/10 px-3 py-1.5 rounded-lg w-fit mx-auto mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Límite de peso: {archivo_max_size_mb} MB
                  </span>
                </div>
              </div>

              {uploadError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-600 rounded-xl text-sm font-medium flex items-center justify-center gap-2 max-w-sm mx-auto">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {uploadError}
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 font-bold px-8 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md hover:scale-105 transition-all mt-2"
              >
                <UploadCloud className="h-5 w-5" /> Seleccionar Archivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
