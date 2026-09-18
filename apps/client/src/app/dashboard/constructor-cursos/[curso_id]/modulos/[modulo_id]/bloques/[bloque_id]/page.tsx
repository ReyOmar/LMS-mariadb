'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui/PageLoader';
import {
  ArrowLeft,
  Save,
  Type,
  PlayCircle,
  FileText,
  CheckCircle,
  LinkIcon,
  Paperclip,
  Plus,
  Trash2,
  Clock,
  RefreshCcw,
  GripVertical,
  Download,
  Settings,
  Lock,
} from 'lucide-react';
import api, { urlDeArchivo } from '@/lib/api';
import { useAlert } from '@/contexts/AlertContext';
import { useBloqueoDeCurso } from '@/hooks/useBloqueoDeCurso';
import { useRole } from '@/contexts/RoleContext';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

// Types
interface QuizOption {
  id: string;
  texto: string;
  es_correcta: boolean;
}
interface QuizQuestion {
  id: string;
  enunciado: string;
  opciones: QuizOption[];
}
interface QuizConfig {
  intentos_permitidos: number;
  tiempo_minutos: number;
  preguntas: QuizQuestion[];
}

const genId = () => crypto.randomUUID();

export default function EditBlockPage({
  params,
}: {
  params: Promise<{ curso_id: string; modulo_id: string; bloque_id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bloque, setBloque] = useState<any>(null);
  const [titulo, setTitulo] = useState('');
  const [contenidoHtml, setContenidoHtml] = useState('');

  // New optional fields
  const [urlReferencia, setUrlReferencia] = useState('');
  const [archivoAdjunto, setArchivoAdjunto] = useState(''); // clave en el almacenamiento
  // La API firma la descarga del adjunto; aquí sólo se muestra.
  const [archivoAdjuntoUrl, setArchivoAdjuntoUrl] = useState('');
  const [archivoAdjuntoNombre, setArchivoAdjuntoNombre] = useState(''); // original name
  const [archivoMaxSizeMb, setArchivoMaxSizeMb] = useState<number>(5); // default 5MB
  const [uploading, setUploading] = useState(false);
  const { showAlert } = useAlert();
  const { user } = useRole();

  // Quiz config
  const [quizConfig, setQuizConfig] = useState<QuizConfig>({
    intentos_permitidos: 1,
    tiempo_minutos: 0,
    preguntas: [],
  });

  const [cursoEstado, setCursoEstado] = useState<string>('');
  const [cursoTitulo, setCursoTitulo] = useState<string>('');

  useEffect(() => {
    const fetchBlock = async () => {
      try {
        const [bloqueRes, cursoRes] = await Promise.all([
          api.get(`/cursos/bloques/${resolvedParams.bloque_id}`),
          api.get(`/cursos/${resolvedParams.curso_id}/gestion`),
        ]);
        const data = bloqueRes.data;
        setBloque(data);
        setCursoEstado(cursoRes.data?.estado || '');
        setCursoTitulo(cursoRes.data?.titulo || '');

        let cleanTitle = data.titulo;
        if (data.tipo === 'TAREA' && data.titulo.startsWith('[QUIZ]')) {
          cleanTitle = cleanTitle.replace('[QUIZ] ', '');
        }

        setTitulo(cleanTitle);
        setContenidoHtml(data.contenido_html || '');
        setUrlReferencia(data.url_referencia || '');
        setArchivoAdjunto(data.archivo_adjunto || '');
        setArchivoAdjuntoUrl(data.archivo_adjunto_url || '');
        setArchivoAdjuntoNombre(data.archivo_adjunto_nombre || '');
        setArchivoMaxSizeMb(data.archivo_max_size_mb || 5);

        if (data.quiz_config) {
          try {
            setQuizConfig(JSON.parse(data.quiz_config));
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchBlock();
  }, [resolvedParams.bloque_id, resolvedParams.curso_id]);

  // Avisa a los demás de que este curso se está editando y lo libera al salir.
  const editorInfo = useBloqueoDeCurso(resolvedParams?.curso_id);
  const isLockedByOther = Boolean(editorInfo);

  const isReadOnly = cursoEstado === 'PUBLICADO';

  const handleSave = async () => {
    if (isReadOnly) {
      showAlert.warning('Curso publicado', 'El curso debe estar en estado Borrador para realizar cambios.');
      return;
    }
    setSaving(true);
    try {
      let finalTitulo = titulo || 'Recurso sin título';
      if (bloque.tipo === 'TAREA' && bloque.titulo.startsWith('[QUIZ]')) {
        finalTitulo = `[QUIZ] ${titulo}`;
      }

      // Validate quiz config
      if (isQuiz && quizConfig.intentos_permitidos < 1) {
        quizConfig.intentos_permitidos = 1;
      }

      await api.patch(`/cursos/bloques/${resolvedParams.bloque_id}`, {
        titulo: finalTitulo,
        contenido_html: contenidoHtml,
        url_referencia: urlReferencia || null,
        archivo_adjunto: archivoAdjunto || null,
        archivo_adjunto_nombre: archivoAdjuntoNombre || null,
        archivo_max_size_mb: archivoMaxSizeMb,
        quiz_config: isQuiz ? JSON.stringify(quizConfig) : null,
      });

      router.push(
        `/dashboard/constructor-cursos?curso=${resolvedParams.curso_id}&resource=${resolvedParams.bloque_id}&module=${resolvedParams.modulo_id}`,
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'No se pudo guardar.';
      showAlert.warning('Error al guardar', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Para tareas, usar el límite configurado. Para los recursos normales, permitir hasta 50MB al admin.
    const limitMb = bloque.tipo === 'TAREA' && !isQuiz ? archivoMaxSizeMb : 50;
    const maxBytes = limitMb * 1024 * 1024;
    if (file.size > maxBytes) {
      showAlert.warning('Atención', `El archivo no puede superar los ${limitMb}MB.`);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/storage/upload?folder=recursos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setArchivoAdjunto(res.data.filename);
      setArchivoAdjuntoUrl(res.data.url || '');
      setArchivoAdjuntoNombre(file.name);
    } catch (err) {
      console.error('Error uploading file:', err);
    } finally {
      setUploading(false);
    }
  };

  // Quiz helpers
  const addQuestion = () => {
    setQuizConfig((prev) => ({
      ...prev,
      preguntas: [
        ...prev.preguntas,
        {
          id: genId(),
          enunciado: '',
          opciones: [
            { id: genId(), texto: '', es_correcta: true },
            { id: genId(), texto: '', es_correcta: false },
          ],
        },
      ],
    }));
  };

  const removeQuestion = (qId: string) => {
    setQuizConfig((prev) => ({ ...prev, preguntas: prev.preguntas.filter((q) => q.id !== qId) }));
  };

  const updateQuestionText = (qId: string, text: string) => {
    setQuizConfig((prev) => ({
      ...prev,
      preguntas: prev.preguntas.map((q) => (q.id === qId ? { ...q, enunciado: text } : q)),
    }));
  };

  const addOption = (qId: string) => {
    setQuizConfig((prev) => ({
      ...prev,
      preguntas: prev.preguntas.map((q) =>
        q.id === qId ? { ...q, opciones: [...q.opciones, { id: genId(), texto: '', es_correcta: false }] } : q,
      ),
    }));
  };

  const removeOption = (qId: string, oId: string) => {
    setQuizConfig((prev) => ({
      ...prev,
      preguntas: prev.preguntas.map((q) =>
        q.id === qId ? { ...q, opciones: q.opciones.filter((o) => o.id !== oId) } : q,
      ),
    }));
  };

  const updateOptionText = (qId: string, oId: string, text: string) => {
    setQuizConfig((prev) => ({
      ...prev,
      preguntas: prev.preguntas.map((q) =>
        q.id === qId ? { ...q, opciones: q.opciones.map((o) => (o.id === oId ? { ...o, texto: text } : o)) } : q,
      ),
    }));
  };

  const setCorrectOption = (qId: string, oId: string) => {
    setQuizConfig((prev) => ({
      ...prev,
      preguntas: prev.preguntas.map((q) =>
        q.id === qId ? { ...q, opciones: q.opciones.map((o) => ({ ...o, es_correcta: o.id === oId })) } : q,
      ),
    }));
  };

  if (loading) {
    return <PageLoader message="Cargando editor de contenido..." />;
  }

  if (!bloque) {
    return (
      <div className="h-[calc(100vh-6rem)] flex items-center justify-center font-bold text-red-500">
        Recurso no encontrado.
      </div>
    );
  }

  const isQuiz = bloque.tipo === 'TAREA' && bloque.titulo.startsWith('[QUIZ]');
  const showExtras = bloque.tipo === 'TEXTO' || bloque.tipo === 'TAREA'; // TEXTO, TAREA, and Quiz

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700 max-w-4xl mx-auto h-[calc(100vh-6rem)] flex flex-col py-6">
      <header className="mb-6 flex items-center gap-4">
        <button
          onClick={() =>
            router.push(
              `/dashboard/constructor-cursos?curso=${resolvedParams.curso_id}&resource=${resolvedParams.bloque_id}&module=${resolvedParams.modulo_id}`,
            )
          }
          className="p-3 bg-muted rounded-full hover:bg-border transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {bloque.tipo === 'TEXTO' && <Type className="h-6 w-6 text-primary" />}
            {bloque.tipo === 'ENLACE' && <PlayCircle className="h-6 w-6 text-pink-500" />}
            {bloque.tipo === 'TAREA' && !isQuiz && <FileText className="h-6 w-6 text-blue-500" />}
            {isQuiz && <CheckCircle className="h-6 w-6 text-amber-500" />}
            Editando{' '}
            {bloque.tipo === 'TEXTO' ? 'Texto' : bloque.tipo === 'ENLACE' ? 'Video' : isQuiz ? 'Cuestionario' : 'Tarea'}
          </h1>
          <p className="text-muted-foreground text-sm">
            Modifica el contenido y guarda para regresar al constructor maestro.
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={handleSave}
            disabled={saving || isReadOnly}
            className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-transform shadow-md ${
              isReadOnly
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90 text-white hover:-translate-y-0.5'
            }`}
          >
            <Save className="h-5 w-5" />
            {saving ? 'Guardando...' : isReadOnly ? 'Solo lectura' : 'Guardar y Volver'}
          </button>
        </div>
      </header>

      <div className="flex-1 bg-card border border-border shadow-sm rounded-2xl overflow-hidden flex flex-col">
        {isReadOnly && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-3 flex items-center gap-3">
            <Lock className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              Este curso está publicado. Cambia a estado Borrador desde el constructor para editar.
            </p>
          </div>
        )}
        <div className="p-8 overflow-y-auto flex-1 space-y-8">
          {/* Título */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
              Título de la actividad
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold text-lg"
              placeholder="Ingresa un título..."
            />
          </div>

          {/* Contenido (Texto o Tarea) */}
          {(bloque.tipo === 'TEXTO' || bloque.tipo === 'TAREA') && (
            <div className="flex flex-col flex-1 min-h-[300px]">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                {bloque.tipo === 'TEXTO'
                  ? 'Contenido del Párrafo'
                  : isQuiz
                    ? 'Instrucciones del Cuestionario'
                    : 'Instrucciones para la Tarea'}
              </label>
              <div className="bg-background rounded-xl border border-border/50 flex-1 flex flex-col mt-2">
                <ReactQuill
                  theme="snow"
                  value={contenidoHtml}
                  onChange={setContenidoHtml}
                  className="flex-1 min-h-[250px]"
                  placeholder={
                    bloque.tipo === 'TEXTO' ? 'Escribe tu contenido aquí...' : 'Escribe las instrucciones detalladas...'
                  }
                />
              </div>
            </div>
          )}

          {/* URL para Videos */}
          {bloque.tipo === 'ENLACE' && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                URL del Video de YouTube
              </label>
              <input
                type="url"
                value={contenidoHtml}
                onChange={(e) => setContenidoHtml(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-pink-500/50 font-medium"
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
          )}

          {/* ===== OPTIONAL: URL de Referencia ===== */}
          {showExtras && (
            <div className="border border-border/50 rounded-xl p-5 bg-muted/5 space-y-4">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <LinkIcon className="h-4 w-4" /> URL de Referencia{' '}
                <span className="text-xs font-normal lowercase tracking-normal">(opcional)</span>
              </h3>
              <input
                type="url"
                value={urlReferencia}
                onChange={(e) => setUrlReferencia(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                placeholder="https://ejemplo.com/recurso-adicional"
              />
              <p className="text-xs text-muted-foreground">
                Si añades una URL, el estudiante verá un enlace para acceder a recursos externos adicionales.
              </p>
            </div>
          )}

          {/* ===== OPTIONAL: Archivo Adjunto ===== */}
          {showExtras && (
            <div className="border border-border/50 rounded-xl p-5 bg-muted/5 space-y-4">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> Archivo Adjunto{' '}
                <span className="text-xs font-normal lowercase tracking-normal">(opcional)</span>
              </h3>

              {/* La configuración de tamaño máximo se movió a su propio contenedor */}

              {uploading ? (
                <div className="flex items-center justify-center gap-2 p-6 border-2 border-dashed border-primary/50 rounded-xl bg-primary/5">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                  <span className="text-sm text-primary font-medium">Subiendo archivo...</span>
                </div>
              ) : archivoAdjuntoNombre ? (
                <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
                  <Paperclip className="h-5 w-5 text-primary flex-shrink-0" />
                  <a
                    href={urlDeArchivo(archivoAdjuntoUrl) ?? ''}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sm flex-1 truncate text-primary hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Download className="h-3.5 w-3.5" /> {archivoAdjuntoNombre}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setArchivoAdjunto('');
                      setArchivoAdjuntoUrl('');
                      setArchivoAdjuntoNombre('');
                    }}
                    className="text-red-500 hover:text-red-600 text-xs font-bold"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
                  <Paperclip className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground font-medium">
                    Haz clic para adjuntar un archivo (PDF, Word, PPT...)
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar"
                    onChange={handleFileUpload}
                  />
                </label>
              )}
            </div>
          )}

          {/* ===== RESTRICCIONES (Solo Tareas) ===== */}
          {showExtras && bloque.tipo === 'TAREA' && !isQuiz && (
            <div className="border border-amber-500/30 rounded-xl p-5 bg-amber-500/5 space-y-4">
              <h3 className="font-bold text-sm text-amber-700 dark:text-amber-500 uppercase tracking-wider flex items-center gap-2">
                <Settings className="h-4 w-4" /> Configuración de Entrega
              </h3>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-muted-foreground uppercase">
                  Peso máximo estudiante (MB):
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={archivoMaxSizeMb}
                  onChange={(e) => setArchivoMaxSizeMb(Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                  className="w-20 bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 font-bold"
                />
                <span className="text-xs text-muted-foreground">Límite para la entrega del estudiante.</span>
              </div>
            </div>
          )}

          {/* ===== QUIZ: Configuración Avanzada ===== */}
          {isQuiz && (
            <>
              {/* Config Row */}
              <div className="border border-amber-500/30 rounded-xl p-5 bg-amber-500/5 space-y-5">
                <h3 className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" /> Configuración del Cuestionario
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground flex items-center gap-1">
                      <RefreshCcw className="h-3 w-3" /> Intentos Permitidos
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={quizConfig.intentos_permitidos}
                      onChange={(e) =>
                        setQuizConfig((prev) => ({
                          ...prev,
                          intentos_permitidos: Math.max(1, parseInt(e.target.value) || 1),
                        }))
                      }
                      className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-bold"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Mínimo 1 intento.</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Tiempo Límite (minutos)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={quizConfig.tiempo_minutos}
                      onChange={(e) =>
                        setQuizConfig((prev) => ({
                          ...prev,
                          tiempo_minutos: Math.max(0, parseInt(e.target.value) || 0),
                        }))
                      }
                      className="w-full bg-background border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-bold"
                    />
                    <p className="text-xs text-muted-foreground mt-1">0 = sin límite de tiempo.</p>
                  </div>
                </div>
              </div>

              {/* Questions Builder */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    Preguntas{' '}
                    <span className="text-muted-foreground text-sm font-normal">({quizConfig.preguntas.length})</span>
                  </h3>
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
                  >
                    <Plus className="h-4 w-4" /> Agregar Pregunta
                  </button>
                </div>

                {quizConfig.preguntas.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                    <CheckCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No hay preguntas aún.</p>
                    <p className="text-muted-foreground text-sm">
                      Presiona "Agregar Pregunta" para empezar a construir el cuestionario.
                    </p>
                  </div>
                )}

                {quizConfig.preguntas.map((q, qi) => (
                  <div key={q.id} className="border border-border rounded-xl overflow-hidden bg-background shadow-sm">
                    {/* Question Header */}
                    <div className="bg-muted/30 px-5 py-3 flex items-center gap-3 border-b border-border">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                      <span className="font-bold text-sm text-muted-foreground">Pregunta {qi + 1}</span>
                      <div className="ml-auto">
                        <button
                          type="button"
                          onClick={() => removeQuestion(q.id)}
                          className="text-red-500 hover:text-red-600 text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Question Text */}
                      <input
                        type="text"
                        value={q.enunciado}
                        onChange={(e) => updateQuestionText(q.id, e.target.value)}
                        className="w-full bg-muted border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-medium"
                        placeholder="Escribe la pregunta aquí..."
                      />

                      {/* Options */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Opciones de Respuesta
                        </label>
                        {q.opciones.map((o, oi) => (
                          <div key={o.id} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={o.es_correcta}
                              onChange={() => setCorrectOption(q.id, o.id)}
                              className="w-4 h-4 accent-emerald-500 flex-shrink-0"
                              title="Marcar como correcta"
                            />
                            <input
                              type="text"
                              value={o.texto}
                              onChange={(e) => updateOptionText(q.id, o.id, e.target.value)}
                              className={`flex-1 bg-muted border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 ${o.es_correcta ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border'}`}
                              placeholder={`Opción ${oi + 1}...`}
                            />
                            {q.opciones.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeOption(q.id, o.id)}
                                className="text-red-400 hover:text-red-500 p-1"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addOption(q.id)}
                          className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 mt-1 ml-6"
                        >
                          <Plus className="h-3 w-3" /> Agregar opción
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        Selecciona el círculo <span className="text-emerald-500 font-bold">●</span> de la opción
                        correcta.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== KICK OUT MODAL ===== */}
      {isLockedByOther && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/15 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Curso en Edición</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                El{' '}
                <strong className="text-foreground">
                  {editorInfo?.rol} {editorInfo?.nombre}
                </strong>{' '}
                está editando el curso <strong className="text-foreground">{cursoTitulo}</strong>.
                <br />
                <br />
                Debes salir para no sobrescribir sus cambios.
              </p>
            </div>
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() => router.push(`/dashboard/constructor-cursos?curso=${resolvedParams.curso_id}`)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-colors shadow-md"
              >
                Volver al apartado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
