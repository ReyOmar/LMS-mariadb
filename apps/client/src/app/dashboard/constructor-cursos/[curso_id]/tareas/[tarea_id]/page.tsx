'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui/PageLoader';
import {
  ArrowLeft,
  Save,
  Type,
  Calendar,
  Link as LinkIcon,
  Paperclip,
  Upload,
  X,
  ShieldCheck,
  UploadCloud,
  Loader2,
} from 'lucide-react';
import api, { urlDeArchivo } from '@/lib/api';
import { useAlert } from '@/contexts/AlertContext';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

export default function ConfigurarTareaPage() {
  const { curso_id, tarea_id } = useParams();
  const router = useRouter();
  const { showAlert } = useAlert();

  const [tarea, setTarea] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Campos de configuración
  const [htmlContent, setHtmlContent] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [urlReferencia, setUrlReferencia] = useState('');
  const [archivoAdjunto, setArchivoAdjunto] = useState('');
  // La API firma la descarga; el editor sólo la muestra, nunca la construye.
  const [archivoAdjuntoUrl, setArchivoAdjuntoUrl] = useState('');
  const [archivoAdjuntoNombre, setArchivoAdjuntoNombre] = useState('');
  const [archivoMaxSizeMb, setArchivoMaxSizeMb] = useState<number>(5);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTarea();
  }, [curso_id, tarea_id]);

  const fetchTarea = async () => {
    try {
      const res = await api.get(`/cursos/${curso_id}/gestion`);
      const data = res.data;

      let foundTarea = null;
      for (const mod of data.modulos || []) {
        const rec = (mod.recursos || []).find((r: any) => r.guid === tarea_id);
        if (rec) {
          foundTarea = rec;
          break;
        }
      }

      if (foundTarea) {
        setTarea(foundTarea);
        setHtmlContent(foundTarea.contenido_html || '');
        setFechaEntrega(foundTarea.url_archivo || '');
        setUrlReferencia(foundTarea.url_referencia || '');
        setArchivoAdjunto(foundTarea.archivo_adjunto || '');
        setArchivoAdjuntoUrl(foundTarea.archivo_adjunto_url || '');
        setArchivoAdjuntoNombre(foundTarea.archivo_adjunto_nombre || '');
        setArchivoMaxSizeMb(foundTarea.archivo_max_size_mb ?? 5);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    try {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/storage/upload?folder=recursos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setArchivoAdjunto(res.data.filename);
      setArchivoAdjuntoUrl(res.data.url || '');
      setArchivoAdjuntoNombre(file.name);
    } catch (err) {
      console.error(err);
      showAlert.error('Error', 'Error al subir el archivo.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/cursos/bloques/${tarea_id}`, {
        contenido_html: htmlContent,
        url_archivo: fechaEntrega,
        url_referencia: urlReferencia,
        archivo_adjunto: archivoAdjunto,
        archivo_adjunto_nombre: archivoAdjuntoNombre,
        archivo_max_size_mb: archivoMaxSizeMb,
      });
      router.back();
    } catch (err) {
      console.error(err);
      showAlert.error('Error', 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader message="Cargando editor de actividad..." />;
  if (!tarea)
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-muted-foreground">
        Actividad no encontrada
      </div>
    );

  const isQuiz = tarea.titulo?.startsWith('[QUIZ]');
  const displayTitle = isQuiz ? tarea.titulo.replace('[QUIZ] ', '') : tarea.titulo;

  return (
    <div className="min-h-screen bg-muted/10 pb-20">
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 bg-muted rounded-full hover:bg-border transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <div>
            <h1 className="font-bold leading-none">Editor: {displayTitle}</h1>
            <span className="text-xs text-muted-foreground">Configuración de la actividad</span>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-xl flex items-center gap-2 font-bold transition-colors disabled:opacity-70"
        >
          <Save className="h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </header>

      <div className="max-w-4xl mx-auto mt-10 px-6 space-y-6">
        {/* ── SECCIÓN 1: Instrucciones ── */}
        <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-border bg-muted/20 flex items-center gap-2">
            <Type className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Instrucciones de la Actividad</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-background rounded-xl border border-border/50 mt-4">
              <ReactQuill
                theme="snow"
                value={htmlContent}
                onChange={setHtmlContent}
                className="h-[300px]"
                placeholder="Escribe las instrucciones detalladas de la tarea aquí..."
              />
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              Puedes usar HTML para dar formato visual a las instrucciones que verán los estudiantes.
            </p>
          </div>
        </div>

        {/* ── SECCIÓN 2: Recursos de Referencia (Solo para Admin/Examinador) ── */}
        <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-border bg-blue-500/5 flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-blue-500" />
            <div>
              <h2 className="font-bold">Recursos de Referencia</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Materiales que se mostrarán al estudiante junto a las instrucciones (plantillas, ejemplos, etc.)
              </p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {/* URL de referencia */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground">
                <LinkIcon className="inline h-3 w-3 mr-1" />
                URL de referencia (opcional)
              </label>
              <input
                type="url"
                value={urlReferencia}
                onChange={(e) => setUrlReferencia(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium text-sm"
                placeholder="https://docs.google.com/..."
              />
              <p className="text-xs text-muted-foreground mt-1">Se mostrará como un enlace clicable al estudiante.</p>
            </div>

            {/* Archivo adjunto */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground">
                <Upload className="inline h-3 w-3 mr-1" />
                Archivo adjunto (opcional)
              </label>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              {archivoAdjunto ? (
                <div className="flex items-center gap-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                  <Paperclip className="h-4 w-4 text-blue-500 shrink-0" />
                  <a
                    href={`${urlDeArchivo(archivoAdjuntoUrl) ?? ''}`}
                    target="_blank"
                    className="text-sm font-bold text-blue-600 hover:underline flex-1 truncate"
                  >
                    {archivoAdjuntoNombre}
                  </a>
                  <button
                    onClick={() => {
                      setArchivoAdjunto('');
                      setArchivoAdjuntoUrl('');
                      setArchivoAdjuntoNombre('');
                    }}
                    className="text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary text-sm font-medium"
                >
                  {uploadingFile ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Subiendo...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-4 w-4" /> Haz clic para subir un archivo de referencia
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 3: Restricciones para el Estudiante ── */}
        <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-border bg-amber-500/5 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            <div>
              <h2 className="font-bold">Restricciones para el Estudiante</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configuraciones que afectan cómo el estudiante puede entregar su archivo.
              </p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground">
                  Fecha Límite de Entrega (opcional)
                </label>
                <input
                  type="datetime-local"
                  value={fechaEntrega}
                  onChange={(e) => setFechaEntrega(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Si se define, el estudiante verá esta fecha como límite.
                </p>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground">
                  Tamaño Máximo del Archivo (MB)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={archivoMaxSizeMb}
                  onChange={(e) => setArchivoMaxSizeMb(Number(e.target.value))}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  El estudiante no podrá subir un archivo más pesado que este límite.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
