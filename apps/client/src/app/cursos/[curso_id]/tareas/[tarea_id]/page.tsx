'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  FileText,
  UploadCloud,
  File as FileIcon,
  Loader2,
  ChevronRight,
  Users,
  Clock,
  CheckCircle2,
  Edit3,
  ClipboardList,
  Download,
  AlertCircle,
  Calendar,
  Award,
} from 'lucide-react';
import Link from 'next/link';
import { useRole } from '@/contexts/RoleContext';
import api, { urlDeArchivo } from '@/lib/api';
import { formatearNota } from '@/lib/calificacion';
import { useAlert } from '@/contexts/AlertContext';
import { sanitizeHTML } from '@/lib/sanitize';

export default function TareaVisorPage() {
  const { curso_id, tarea_id } = useParams();
  const { role } = useRole();
  const router = useRouter();
  const { showAlert, showToast } = useAlert();

  const [curso, setCurso] = useState<any>(null);
  const [tarea, setTarea] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [entregaData, setEntregaData] = useState<any>(null);

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [serverFileName, setServerFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [entregas, setEntregas] = useState<any[]>([]);
  const [showEntregas, setShowEntregas] = useState(false);
  const [loadingEntregas, setLoadingEntregas] = useState(false);

  const isTeacher = role === 'teacher';

  useEffect(() => {
    if (curso_id) fetchCurso();
  }, [curso_id]);
  useEffect(() => {
    if (isTeacher && tarea_id) fetchEntregas();
  }, [isTeacher, tarea_id]);

  const fetchCurso = async () => {
    try {
      const res = await api.get(`/cursos/${curso_id}`);
      const data = res.data;
      setCurso(data);
      let foundTarea = null;
      for (const mod of data.modulos || []) {
        const rec = (mod.recursos || []).find((r: any) => r.guid === tarea_id);
        if (rec) {
          foundTarea = rec;
          break;
        }
      }
      setTarea(foundTarea);
      if (!isTeacher) {
        try {
          const { data: ed } = await api.get(`/evaluaciones/tareas/${tarea_id}/entregas/mia`);
          if (ed?.respuesta_texto) {
            setEntregaData(ed);
            setSelectedFileName(ed.respuesta_texto);
            setServerFileName(ed.archivo_url || null);
            setUploadState('done');
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntregas = async () => {
    setLoadingEntregas(true);
    try {
      const res = await api.get(`/evaluaciones/tareas/${tarea_id}/entregas`);
      setEntregas(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      setEntregas([]);
    } finally {
      setLoadingEntregas(false);
    }
  };

  const processFile = async (file: File) => {
    const maxMb = tarea?.archivo_max_size_mb || 5;
    if (file.size > maxMb * 1024 * 1024) {
      showAlert.warning('Atención', `El archivo excede el tamaño máximo permitido de ${maxMb} MB.`);
      return;
    }
    try {
      setUploadState('uploading');
      setSelectedFileName(file.name);
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/evaluaciones/tareas/${tarea_id}/entregas`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        maxBodyLength: 50 * 1024 * 1024,
        maxContentLength: 50 * 1024 * 1024,
      });
      setSelectedFileName(file.name);
      setServerFileName(data.archivo_url || null);
      setEntregaData(data);
      setUploadState('done');
      showToast.success('Tu entrega se ha enviado correctamente.');
    } catch (err) {
      console.error(err);
      showAlert.error('Error', 'Hubo un error al enviar tu archivo.');
      setUploadState('idle');
    }
  };

  const handleDownload = () => {
    if (!serverFileName) return;
    const url = urlDeArchivo(serverFileName) ?? '';
    if (!url) return;
    window.open(url, '_blank');
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

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  if (!tarea)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Actividad no encontrada</h1>
        <Link href={`/cursos/${curso_id}`} className="text-primary font-bold hover:underline">
          Volver al curso
        </Link>
      </div>
    );

  const isQuiz = tarea.titulo?.startsWith('[QUIZ]');
  const cleanTitle = isQuiz ? tarea.titulo.replace('[QUIZ] ', '') : tarea.titulo;
  const maxMb = tarea?.archivo_max_size_mb || 5;

  // La nota llega en su propio campo; antes se extraía partiendo la cadena "NOTA: 4.5 | ...".
  const calificacion = entregaData?.calificacion != null ? formatearNota(entregaData.calificacion) : null;

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 h-16 flex items-center px-6">
        <Link href={`/cursos/${curso_id}`} className="p-2 hover:bg-muted rounded-full transition-colors mr-3">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center text-sm font-semibold text-muted-foreground truncate flex-1">
          {curso?.titulo} <ChevronRight className="h-4 w-4 mx-2 flex-shrink-0" />{' '}
          <span className="text-foreground truncate">{cleanTitle}</span>
        </div>
        {isTeacher && (
          <span className="ml-4 text-xs font-bold px-3 py-1 bg-amber-500/10 text-amber-600 rounded-full whitespace-nowrap">
            Modo Examinador
          </span>
        )}
      </header>

      <main className="max-w-4xl mx-auto py-10 px-6 animate-in fade-in duration-500">
        {/* ── Title + badges ── */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight mb-3">{cleanTitle}</h1>
          <div className="flex gap-2 flex-wrap">
            {!isTeacher && uploadState === 'done' && (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Entrega realizada
              </span>
            )}
            {!isTeacher && uploadState !== 'done' && (
              <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 px-3 py-1 rounded-full text-xs font-bold">
                <Clock className="h-3.5 w-3.5" /> Pendiente de entrega
              </span>
            )}
            {isTeacher && (
              <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 px-3 py-1 rounded-full text-xs font-bold">
                <Users className="h-3.5 w-3.5" /> Vista de Examinador
              </span>
            )}
          </div>
        </div>

        {/* ── Activity description card ── */}
        <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="px-8 py-6 border-b border-border/30 bg-muted/20">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4" /> Descripción de la actividad
            </h2>
          </div>
          <div className="p-8 prose prose-slate dark:prose-invert max-w-none">
            {tarea.contenido_html ? (
              <div dangerouslySetInnerHTML={sanitizeHTML(tarea.contenido_html)} />
            ) : (
              <p className="text-muted-foreground italic">
                El creador de la actividad no proporcionó una descripción adicional.
              </p>
            )}
          </div>
        </div>

        {/* ──────────────── EXAMINER PANEL ──────────────── */}
        {isTeacher ? (
          <>
            {/* Examiner Actions */}
            <div className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-2xl p-6 mb-8">
              <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold text-center mb-4">
                Como examinador puedes{' '}
                {isQuiz ? 'revisar las notas de los intentos' : 'ver todas las entregas realizadas por los estudiantes'}
                .
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={async () => {
                    if (!showEntregas) await fetchEntregas();
                    setShowEntregas((v) => !v);
                  }}
                  className="flex items-center gap-2 font-bold px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-sm hover:scale-105"
                >
                  {loadingEntregas ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Cargando...
                    </>
                  ) : isQuiz ? (
                    <>
                      <ClipboardList className="h-5 w-5" /> {showEntregas ? 'Ocultar notas' : 'Revisar notas'}
                    </>
                  ) : (
                    <>
                      <Users className="h-5 w-5" /> {showEntregas ? 'Ocultar entregas' : 'Revisar entregas'}
                    </>
                  )}
                </button>
                <button
                  onClick={() => router.push(`/dashboard/constructor-cursos/${curso_id}/tareas/${tarea_id}`)}
                  className="flex items-center gap-2 font-bold px-6 py-3 rounded-xl bg-card border border-border hover:bg-muted text-foreground transition-all shadow-sm hover:scale-105"
                >
                  <Edit3 className="h-5 w-5 text-primary" /> {isQuiz ? 'Editar Cuestionario' : 'Editar Tarea'}
                </button>
              </div>
            </div>

            {/* Summary Table */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4">
                {isQuiz ? 'Resumen del Cuestionario' : 'Resumen de la Actividad'}
              </h2>
              <div className="bg-card border border-border shadow-sm rounded-xl overflow-hidden text-sm">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-border">
                    <tr className="divide-x divide-border">
                      <td className="p-4 w-1/3 font-semibold text-muted-foreground bg-muted/10">
                        {isQuiz ? 'Intentos permitidos' : 'Fecha límite de entrega'}
                      </td>
                      <td className="p-4 text-foreground">{isQuiz ? '1 intento' : 'Sin fecha definida'}</td>
                    </tr>
                    <tr className="divide-x divide-border">
                      <td className="p-4 font-semibold text-muted-foreground bg-muted/10">
                        {isQuiz ? 'Intentos registrados' : 'Entregas realizadas'}
                      </td>
                      <td className="p-4">
                        {loadingEntregas ? (
                          <span className="text-muted-foreground italic">Cargando…</span>
                        ) : (
                          <span
                            className={`font-bold text-lg ${entregas.length > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}
                          >
                            {entregas.length}{' '}
                            <span className="text-sm font-normal text-muted-foreground">
                              {isQuiz ? 'intento(s)' : 'entrega(s)'}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Entregas Table */}
            {showEntregas && (
              <div className="mb-12 animate-in slide-in-from-top-4 duration-300">
                <h2 className="text-xl font-bold mb-4">{isQuiz ? 'Notas e Intentos' : 'Entregas Recibidas'}</h2>
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                  {entregas.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground italic">
                      No hay entregas aún para esta actividad.
                    </div>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead className="border-b border-border bg-muted/30">
                        <tr>
                          <th className="p-4 font-bold text-muted-foreground uppercase text-xs">Estudiante</th>
                          <th className="p-4 font-bold text-muted-foreground uppercase text-xs">Archivo</th>
                          <th className="p-4 font-bold text-muted-foreground uppercase text-xs">Fecha</th>
                          <th className="p-4 font-bold text-muted-foreground uppercase text-xs">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {entregas.map((e: any) => (
                          <tr key={e.guid} className="hover:bg-muted/20 transition-colors">
                            <td className="p-4 font-mono text-xs text-muted-foreground">{e.usuario_guid}</td>
                            <td className="p-4">
                              {e.respuesta_texto ? (
                                <div className="flex items-center gap-2 font-semibold">
                                  <FileIcon
                                    className={`h-4 w-4 flex-shrink-0 ${e.archivo_purgado ? 'text-muted-foreground' : 'text-primary'}`}
                                  />
                                  <span
                                    className={`truncate max-w-[200px] ${e.archivo_purgado ? 'text-muted-foreground' : 'text-primary'}`}
                                  >
                                    {e.respuesta_texto}
                                  </span>
                                  {e.archivo_purgado && (
                                    <span
                                      className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded"
                                      title="El archivo fue eliminado automáticamente tras obtener el certificado"
                                    >
                                      Liberado
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic">Sin archivo</span>
                              )}
                            </td>
                            <td className="p-4 text-muted-foreground text-xs">
                              {e.fecha_entrega
                                ? new Date(e.fecha_entrega).toLocaleString('es-ES', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td className="p-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${e.estado === 'ENTREGADA' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}
                              >
                                {e.estado === 'ENTREGADA' && <CheckCircle2 className="h-3 w-3" />} {e.estado}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ──────────────── STUDENT PANEL ──────────────── */
          <>
            {/* Upload Card */}
            <div
              className={`relative border-2 border-dashed rounded-2xl p-8 mb-8 transition-all duration-300 ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : uploadState === 'done'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-border/60 bg-card hover:border-primary/40'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} />

              {uploadState === 'done' && selectedFileName ? (
                /* ── File delivered state ── */
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Entrega realizada</h3>
                    <p className="text-sm text-muted-foreground">Tu archivo ha sido enviado correctamente</p>
                  </div>

                  {/* File info card */}
                  <div className="w-full max-w-md bg-background border border-border/60 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-foreground truncate">{selectedFileName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entregaData?.fecha_entrega
                          ? `Entregado el ${new Date(entregaData.fecha_entrega).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                          : 'Subido recientemente'}
                      </p>
                    </div>
                    {serverFileName && !entregaData?.archivo_purgado && (
                      <button
                        onClick={handleDownload}
                        className="p-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors flex-shrink-0"
                        title="Descargar archivo"
                      >
                        <Download className="h-5 w-5" />
                      </button>
                    )}
                    {entregaData?.archivo_purgado && (
                      <span
                        className="text-xs font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-md whitespace-nowrap"
                        title="El archivo fue eliminado automáticamente tras obtener el certificado"
                      >
                        Liberado
                      </span>
                    )}
                  </div>

                  {/* Calificación */}
                  {calificacion && (
                    <div className="w-full max-w-md bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Award className="h-6 w-6 text-amber-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Calificación</p>
                        <p className="text-lg font-bold text-foreground">{calificacion}</p>
                      </div>
                    </div>
                  )}

                  {!entregaData?.archivo_purgado && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
                    >
                      <UploadCloud className="h-4 w-4" /> Subir archivo diferente
                    </button>
                  )}
                </div>
              ) : uploadState === 'uploading' ? (
                /* ── Uploading state ── */
                <div className="flex flex-col items-center text-center gap-4 py-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Subiendo archivo...</h3>
                    <p className="text-sm text-muted-foreground">{selectedFileName}</p>
                  </div>
                </div>
              ) : (
                /* ── Idle state — upload prompt ── */
                <div className="flex flex-col items-center text-center gap-4 py-4">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <UploadCloud className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground mb-1">Sube tu entrega</h3>
                    <p className="text-sm text-muted-foreground">
                      Arrastra un archivo aquí o haz clic para seleccionarlo
                    </p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-8 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-all shadow-sm hover:shadow-md hover:scale-105 active:scale-100"
                  >
                    Seleccionar archivo
                  </button>
                  <p className="text-xs text-muted-foreground">Tamaño máximo: {maxMb} MB</p>
                </div>
              )}
            </div>

            {/* ── Student Status Cards ── */}
            <h2 className="text-xl font-bold mb-4">Estado de la entrega</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status */}
              <div className="bg-card border border-border/50 rounded-xl p-5 flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${uploadState === 'done' ? 'bg-emerald-500/10' : 'bg-muted'}`}
                >
                  {uploadState === 'done' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</p>
                  <p
                    className={`text-sm font-bold mt-0.5 ${uploadState === 'done' ? 'text-emerald-600' : 'text-foreground'}`}
                  >
                    {uploadState === 'done' ? 'Enviado para calificar' : 'No entregado'}
                  </p>
                </div>
              </div>

              {/* Calificación status */}
              <div className="bg-card border border-border/50 rounded-xl p-5 flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${calificacion ? 'bg-amber-500/10' : 'bg-muted'}`}
                >
                  <Award className={`h-5 w-5 ${calificacion ? 'text-amber-500' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Calificación</p>
                  <p className="text-sm font-bold mt-0.5 text-foreground">
                    {calificacion || (uploadState === 'done' ? 'Sin calificar' : 'No calificado')}
                  </p>
                </div>
              </div>

              {/* Archivo */}
              <div className="bg-card border border-border/50 rounded-xl p-5 flex items-start gap-4 sm:col-span-2">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${uploadState === 'done' ? 'bg-primary/10' : 'bg-muted'}`}
                >
                  <FileIcon
                    className={`h-5 w-5 ${uploadState === 'done' ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Archivo entregado
                  </p>
                  {uploadState === 'done' && selectedFileName ? (
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-sm font-bold text-foreground truncate">{selectedFileName}</p>
                      {serverFileName && !entregaData?.archivo_purgado && (
                        <button
                          onClick={handleDownload}
                          className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors whitespace-nowrap"
                        >
                          <Download className="h-3.5 w-3.5" /> Descargar
                        </button>
                      )}
                      {entregaData?.archivo_purgado && (
                        <span
                          className="text-xs font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded"
                          title="El archivo fue eliminado automáticamente tras obtener el certificado"
                        >
                          Liberado
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic mt-0.5">Ningún archivo ha sido enviado</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
