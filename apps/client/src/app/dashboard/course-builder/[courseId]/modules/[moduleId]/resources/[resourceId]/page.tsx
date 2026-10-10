'use client';

import { useEffect, useState, use, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';
import {
  ArrowLeft,
  Save,
  Type,
  PlayCircle,
  FileText,
  CheckCircle,
  LinkIcon,
  Paperclip,
  Download,
  Settings,
  Lock,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import api, { errorMessage, uploadFile, fileUrlFor } from '@/lib/api';
import { useAlerts } from '@/contexts/AlertContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useCourseLock } from '@/hooks/useCourseLock';
import type { Course, CourseStatus, QuizConfig, Resource } from '@/types/models';
import { displayTitle, isQuiz, quizTitleOf } from '@/lib/resources';
import { COURSE_STATUS_LABEL } from '@/lib/labels';
import { formatMb, parseLimitMb, uploadLimit } from '@/lib/upload-limits';
import { breakableSpaces } from '@/lib/editor-html';
import { CourseInUseAlert } from '@/app/dashboard/course-builder/components/Notices';
import { QuizEditor } from '@/app/dashboard/course-builder/components/QuizEditor';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

/** En modo consulta el editor de texto no enseña la barra de formato. */
const READ_ONLY_MODULES = { toolbar: false };

export default function ResourceEditor({
  params,
}: {
  params: Promise<{ courseId: string; moduleId: string; resourceId: string }>;
}) {
  const { courseId, moduleId, resourceId } = use(params);
  const router = useRouter();
  const { showAlert, notify } = useAlerts();
  const { config } = useConfig();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [resource, setResource] = useState<Resource | null>(null);
  const [title, setTitle] = useState('');
  const [contentHtml, setContentHtml] = useState('');

  const [referenceUrl, setReferenceUrl] = useState('');
  /** Clave en el almacenamiento: es lo que se guarda. */
  const [attachmentKey, setAttachmentKey] = useState('');
  /** URL firmada por la API, sólo para enlazar el adjunto desde aquí. */
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  /** Límite de la entrega tal como se escribe; vacío = el general de la sede. */
  const [maxUploadText, setMaxUploadText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [quizConfig, setQuizConfig] = useState<QuizConfig>({
    allowedAttempts: 1,
    timeLimitMinutes: 0,
    questions: [],
  });

  const [courseStatus, setCourseStatus] = useState<CourseStatus | null>(null);
  const [courseTitle, setCourseTitle] = useState('');

  /** Vuelve al constructor con este recurso seleccionado. */
  const builderUrl = `/dashboard/course-builder?course=${courseId}&resource=${resourceId}&module=${moduleId}`;

  useEffect(() => {
    const loadResource = async () => {
      try {
        const [{ data }, { data: course }] = await Promise.all([
          api.get<Resource>(`/courses/resources/${resourceId}`),
          api.get<Course>(`/courses/${courseId}/manage`),
        ]);
        setResource(data);
        setCourseStatus(course.status);
        setCourseTitle(course.title);

        setTitle(displayTitle(data));
        setContentHtml(data.contentHtml || '');
        setReferenceUrl(data.referenceUrl || '');
        setAttachmentKey(data.attachmentKey || '');
        setAttachmentUrl(data.attachmentUrl || '');
        setAttachmentName(data.attachmentName || '');
        setMaxUploadText(data.maxUploadMb ? String(data.maxUploadMb) : '');

        if (data.quizConfig) {
          try {
            setQuizConfig(JSON.parse(data.quizConfig) as QuizConfig);
          } catch {
            // Configuración dañada: se empieza de cero en lugar de bloquear el editor.
          }
        }
      } catch (error) {
        notify.error('No se pudo abrir el recurso', errorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    void loadResource();
  }, [resourceId, courseId, notify]);

  // Avisa a los demás de que este curso se está editando y lo libera al salir.
  const otherEditor = useCourseLock(courseId);

  // El servidor sólo admite cambios de contenido con el curso en borrador.
  const readOnly = courseStatus !== 'DRAFT';
  const statusLabel = courseStatus ? COURSE_STATUS_LABEL[courseStatus].toLowerCase() : '';

  const siteLimitMb = config?.maxFileMb;
  const ceilingMb = config?.uploadCeilingMb;
  const maxUpload = parseLimitMb(maxUploadText, ceilingMb);
  // El campo va en MB: «2048 MB (2 GB)» dice qué escribir y cuánto es.
  const ceilingHint = ceilingMb
    ? ` Máximo ${ceilingMb} MB${ceilingMb % 1024 === 0 ? ` (${formatMb(ceilingMb)})` : ''}.`
    : '';

  const onSave = async () => {
    if (!resource) return;
    if (readOnly) {
      showAlert.warning(`Curso ${statusLabel}`, 'El curso debe estar en estado Borrador para realizar cambios.');
      return;
    }
    const quiz = isQuiz(resource);
    const acceptsFiles = resource.type === 'ASSIGNMENT' && !quiz;
    if (acceptsFiles && maxUpload.error) {
      showAlert.warning('Límite de entrega no válido', maxUpload.error);
      return;
    }

    setSaving(true);
    try {
      const baseTitle = title.trim() || 'Recurso sin título';

      await api.patch(`/courses/resources/${resourceId}`, {
        title: quiz ? quizTitleOf(baseTitle) : baseTitle,
        // Un enlace guarda su dirección en este campo; el resto, lo que escribe el editor.
        contentHtml: resource.type === 'LINK' ? contentHtml : breakableSpaces(contentHtml),
        referenceUrl: referenceUrl || null,
        attachmentKey: attachmentKey || null,
        attachmentName: attachmentName || null,
        // El límite sólo tiene sentido en una tarea que recibe archivos.
        ...(acceptsFiles && { maxUploadMb: maxUpload.value }),
        quizConfig: quiz ? JSON.stringify(quizConfig) : null,
      });

      router.push(builderUrl);
    } catch (error) {
      showAlert.warning('Error al guardar', errorMessage(error, 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  };

  // El material del curso se sube con el límite general de la sede, que es el que aplica el
  // servidor; el de la actividad es para las entregas de los alumnos, que es otra cosa.
  const materialLimit = uploadLimit('recursos', siteLimitMb, ceilingMb);

  const onFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const { filename, url } = await uploadFile('/storage/upload?folder=recursos', file, {
        limit: materialLimit,
        onProgress: setUploadProgress,
      });
      setAttachmentKey(filename);
      setAttachmentUrl(url || '');
      setAttachmentName(file.name);
    } catch (err) {
      showAlert.error('No se pudo subir el archivo', errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <PageLoader message="Cargando editor de contenido..." />;
  }

  if (!resource) {
    return (
      <div className="h-[calc(100vh-6rem)] flex items-center justify-center font-bold text-red-700 dark:text-red-400">
        Recurso no encontrado.
      </div>
    );
  }

  const isQuizBlock = isQuiz(resource);
  // Textos, tareas y cuestionarios admiten enlace de referencia y adjunto; los enlaces no.
  const showExtras = resource.type === 'TEXT' || resource.type === 'ASSIGNMENT';
  const kind =
    resource.type === 'TEXT' ? 'Texto' : resource.type === 'LINK' ? 'Video' : isQuizBlock ? 'Cuestionario' : 'Tarea';

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700 max-w-4xl mx-auto h-[calc(100vh-6rem)] flex flex-col py-6">
      <header className="mb-6 flex items-center gap-4">
        <button
          onClick={() => router.push(builderUrl)}
          className="p-3 bg-muted rounded-full hover:bg-border transition-colors"
          aria-label="Volver al constructor"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {resource.type === 'TEXT' && <Type className="h-6 w-6 text-primary" />}
            {resource.type === 'LINK' && <PlayCircle className="h-6 w-6 text-pink-500" />}
            {resource.type === 'ASSIGNMENT' && !isQuizBlock && <FileText className="h-6 w-6 text-blue-500" />}
            {isQuizBlock && <CheckCircle className="h-6 w-6 text-amber-500" />}
            {readOnly ? `${kind} (solo lectura)` : `Editando ${kind.toLowerCase()}`}
          </h1>
          <p className="text-muted-foreground text-sm">
            {readOnly
              ? 'Puedes consultar el contenido, pero no cambiarlo.'
              : 'Modifica el contenido y guarda para volver al curso.'}
          </p>
        </div>
        {!readOnly && (
          <div className="ml-auto">
            <button
              onClick={onSave}
              // Con un adjunto subiendo, guardar ahora lo dejaría fuera del recurso.
              disabled={saving || uploading}
              className="px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-transform shadow-md bg-primary hover:bg-primary/90 text-primary-foreground hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              <Save className="h-5 w-5" />
              {saving ? 'Guardando...' : 'Guardar y volver'}
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 bg-card border border-border shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {readOnly && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-3 flex items-center gap-3">
            <Lock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              Este curso está {statusLabel}. Cambia a estado Borrador desde el constructor para editar.
            </p>
          </div>
        )}
        <div className="p-8 overflow-y-auto flex-1">
          {/* En modo consulta se desactivan de una vez todos los campos y botones del formulario. */}
          <fieldset disabled={readOnly} className="min-w-0 space-y-8">
            <div>
              <label
                htmlFor="resource-title"
                className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2"
              >
                Título de la actividad
              </label>
              <input
                id="resource-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold text-lg"
                placeholder="Ingresa un título..."
              />
            </div>

            {(resource.type === 'TEXT' || resource.type === 'ASSIGNMENT') && (
              <div className="flex flex-col flex-1 min-h-[300px]">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  {resource.type === 'TEXT'
                    ? 'Contenido del párrafo'
                    : isQuizBlock
                      ? 'Instrucciones del cuestionario'
                      : 'Instrucciones para la tarea'}
                </label>
                <div className="bg-background rounded-xl border border-border/50 flex-1 flex flex-col mt-2">
                  <ReactQuill
                    theme="snow"
                    value={contentHtml}
                    onChange={setContentHtml}
                    readOnly={readOnly}
                    modules={readOnly ? READ_ONLY_MODULES : undefined}
                    className="flex-1 min-h-[250px]"
                    placeholder={
                      resource.type === 'TEXT'
                        ? 'Escribe tu contenido aquí...'
                        : 'Escribe las instrucciones detalladas...'
                    }
                  />
                </div>
              </div>
            )}

            {/* Un enlace guarda su dirección en el contenido del recurso. */}
            {resource.type === 'LINK' && (
              <div>
                <label
                  htmlFor="resource-url"
                  className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2"
                >
                  URL del video de YouTube
                </label>
                <input
                  id="resource-url"
                  type="url"
                  value={contentHtml}
                  onChange={(e) => setContentHtml(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50 font-medium"
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
            )}

            {showExtras && (
              <div className="border border-border/50 rounded-xl p-5 bg-muted/5 space-y-4">
                <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" /> URL de referencia{' '}
                  <span className="text-xs font-normal lowercase tracking-normal">(opcional)</span>
                </h3>
                <input
                  type="url"
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  placeholder="https://ejemplo.com/recurso-adicional"
                  aria-label="URL de referencia"
                />
                <p className="text-xs text-muted-foreground">
                  Si añades una URL, el estudiante verá un enlace para acceder a recursos externos adicionales.
                </p>
              </div>
            )}

            {showExtras && (
              <div className="border border-border/50 rounded-xl p-5 bg-muted/5 space-y-4">
                <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Paperclip className="h-4 w-4" /> Archivo adjunto{' '}
                  <span className="text-xs font-normal lowercase tracking-normal">(opcional)</span>
                </h3>

                {uploading ? (
                  <div className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-primary/50 rounded-xl bg-primary/5">
                    <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                    <span className="text-sm text-primary font-medium">
                      {uploadProgress < 100 ? `Subiendo archivo... ${uploadProgress}%` : 'Procesando archivo…'}
                    </span>
                  </div>
                ) : attachmentName ? (
                  <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
                    <Paperclip className="h-5 w-5 text-primary flex-shrink-0" />
                    <a
                      href={fileUrlFor(attachmentUrl) ?? ''}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm flex-1 truncate text-primary hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Download className="h-3.5 w-3.5" /> {attachmentName}
                    </a>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentKey('');
                          setAttachmentUrl('');
                          setAttachmentName('');
                        }}
                        className="text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-bold"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ) : readOnly ? (
                  <p className="text-sm text-muted-foreground">Sin archivo adjunto.</p>
                ) : (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground font-medium">
                      Haz clic para adjuntar un archivo (PDF, Word, PPT...)
                      {materialLimit && ` — máximo ${formatMb(materialLimit.maxMb)}`}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar"
                      onChange={onFileUpload}
                    />
                  </label>
                )}
              </div>
            )}

            {resource.type === 'ASSIGNMENT' && !isQuizBlock && (
              <div className="border border-amber-500/30 rounded-xl p-5 bg-amber-500/5 space-y-4">
                <h3 className="font-bold text-sm text-amber-700 dark:text-amber-500 uppercase tracking-wider flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Configuración de entrega
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="max-upload-mb" className="text-xs font-bold text-muted-foreground uppercase">
                    Peso máximo estudiante (MB):
                  </label>
                  <input
                    id="max-upload-mb"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={ceilingMb}
                    step={1}
                    placeholder={siteLimitMb ? String(siteLimitMb) : 'Sede'}
                    value={maxUploadText}
                    onChange={(e) => setMaxUploadText(e.target.value)}
                    aria-invalid={Boolean(maxUpload.error)}
                    aria-describedby="max-upload-mb-hint"
                    className={`w-28 bg-background border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold ${
                      maxUpload.error ? 'border-red-500' : 'border-border'
                    }`}
                  />
                  <span id="max-upload-mb-hint" className="text-xs text-muted-foreground">
                    Vacío: se aplica el límite general de la sede
                    {siteLimitMb ? ` (${formatMb(siteLimitMb)})` : ''}.{ceilingHint}
                  </span>
                </div>
                {maxUpload.error && (
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">{maxUpload.error}</p>
                )}
              </div>
            )}

            {isQuizBlock && <QuizEditor config={quizConfig} onChange={setQuizConfig} />}
          </fieldset>
        </div>
      </div>

      {otherEditor && (
        <CourseInUseAlert
          courseTitle={courseTitle}
          editor={otherEditor}
          exitText="Volver al apartado"
          note="Debes salir para no sobrescribir sus cambios."
          onExit={() => router.push(`/dashboard/course-builder?course=${courseId}`)}
        />
      )}
    </div>
  );
}
