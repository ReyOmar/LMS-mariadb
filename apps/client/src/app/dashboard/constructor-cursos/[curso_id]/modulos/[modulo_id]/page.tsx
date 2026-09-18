'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui/PageLoader';
import {
  ArrowLeft,
  Plus,
  Image as ImageIcon,
  Type,
  FileText,
  CheckCircle,
  UploadCloud,
  Save,
  X,
  Eye,
  Trash2,
  Edit3,
  Link as LinkIcon,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import api, { urlDeArchivo } from '@/lib/api';
import { useAlert } from '@/contexts/AlertContext';
import { sanitizeHTML } from '@/lib/sanitize';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

export default function ModuleEditorPage() {
  const { curso_id, modulo_id } = useParams();
  const router = useRouter();

  const [curso, setCurso] = useState<any>(null);
  const [modulo, setModulo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // States for module title editing
  const [moduleTitle, setModuleTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'IMAGEN' | 'PARRAFO' | 'TAREA' | 'CUESTIONARIO' | 'ENLACE' | null>(
    null,
  );

  // States for new block / edit block
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [bloqueTitulo, setBloqueTitulo] = useState('');
  const [bloqueHtml, setBloqueHtml] = useState('');
  const [bloqueBase64, setBloqueBase64] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { showAlert, showConfirm } = useAlert();

  useEffect(() => {
    fetchData();
  }, [curso_id, modulo_id]);

  const fetchData = async () => {
    try {
      const res = await api.get(`/cursos/${curso_id}/gestion`);
      const data = res.data;
      setCurso(data);
      const targetModulo = data.modulos?.find((m: any) => m.guid === modulo_id);
      setModulo(targetModulo);
      if (targetModulo) setModuleTitle(targetModulo.titulo);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/storage/upload?folder=recursos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBloqueBase64(urlDeArchivo(res.data.url) ?? '');
      } catch (err) {
        console.error('Error uploading image:', err);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/storage/upload?folder=recursos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBloqueBase64(urlDeArchivo(res.data.url) ?? '');
      } catch (err) {
        console.error('Error uploading dropped image:', err);
      }
    }
  };

  const openAppEdit = (recurso: any) => {
    setEditingBlockId(recurso.guid);

    let modalType: 'PARRAFO' | 'IMAGEN' | 'TAREA' | 'CUESTIONARIO' = 'PARRAFO';
    if (recurso.tipo === 'TEXTO') modalType = 'PARRAFO';
    if (recurso.tipo === 'ENLACE') modalType = 'IMAGEN';
    if (recurso.tipo === 'TAREA' && !recurso.titulo.startsWith('[QUIZ]')) modalType = 'TAREA';
    if (recurso.tipo === 'TAREA' && recurso.titulo.startsWith('[QUIZ]')) modalType = 'CUESTIONARIO';

    let cleanTitle = recurso.titulo;
    if (modalType === 'CUESTIONARIO') cleanTitle = cleanTitle.replace('[QUIZ] ', '');

    setBloqueTitulo(cleanTitle);

    if (modalType === 'PARRAFO') setBloqueHtml(recurso.contenido_html || '');
    if (modalType === 'IMAGEN') setBloqueBase64(recurso.url_archivo || recurso.contenido_html || '');

    setMenuOpen(false);
    setActiveModal(modalType);
  };

  const handleDeleteBlock = async (id: string) => {
    const ok = await showConfirm(
      'Eliminar bloque',
      '¿Estás seguro de eliminar este bloque del contenido? Esta acción no se puede deshacer.',
    );
    if (!ok) return;
    // Optimistic: remove from local state immediately
    setModulo((prev: any) => {
      if (!prev) return prev;
      const updated = { ...prev };
      if (updated.lecciones?.[0]?.recursos) {
        updated.lecciones = [
          {
            ...updated.lecciones[0],
            recursos: updated.lecciones[0].recursos.filter((r: any) => r.guid !== id),
          },
        ];
      }
      return updated;
    });
    try {
      await api.delete(`/cursos/bloques/${id}`);
    } catch (err) {
      console.error(err);
      // Revert on failure
      fetchData();
    }
  };

  const handleSaveBlock = async (tipo: string, payload?: any) => {
    setSaving(true);
    try {
      let finalTipo = tipo === 'IMAGEN' ? 'ENLACE' : tipo === 'PARRAFO' ? 'TEXTO' : tipo;
      let finalTitulo =
        (payload && payload.titulo) ||
        bloqueTitulo ||
        (tipo === 'PARRAFO' ? 'Bloque de Texto' : tipo === 'IMAGEN' ? 'Imagen' : tipo);

      if (tipo === 'CUESTIONARIO') {
        finalTipo = 'TAREA'; // Cuestionario maps to TAREA en db de Prisma
        finalTitulo = `[QUIZ] ${finalTitulo}`;
      }

      const htmlContent = tipo === 'PARRAFO' ? bloqueHtml : tipo === 'IMAGEN' ? bloqueBase64 : '';

      const body: any = {
        tipo: finalTipo,
        titulo: finalTitulo,
        contenido_html: htmlContent,
      };

      if (tipo === 'IMAGEN') {
        body.url_archivo = bloqueBase64;
      } else if (tipo === 'ENLACE' && payload && payload.url_archivo) {
        body.url_archivo = payload.url_archivo;
      }

      if (editingBlockId) {
        await api.patch(`/cursos/bloques/${editingBlockId}`, { titulo: finalTitulo, contenido_html: htmlContent });
        // Optimistic: update in local state
        setModulo((prev: any) => {
          if (!prev?.lecciones?.[0]?.recursos) return prev;
          const updated = { ...prev };
          updated.lecciones = [
            {
              ...updated.lecciones[0],
              recursos: updated.lecciones[0].recursos.map((r: any) =>
                r.guid === editingBlockId ? { ...r, titulo: finalTitulo, contenido_html: htmlContent } : r,
              ),
            },
          ];
          return updated;
        });
      } else {
        const res = await api.post(`/cursos/modulos/${modulo_id}/bloques`, body);
        // Optimistic: append to local state
        setModulo((prev: any) => {
          if (!prev?.lecciones?.[0]) return prev;
          const updated = { ...prev };
          updated.lecciones = [
            {
              ...updated.lecciones[0],
              recursos: [...(updated.lecciones[0].recursos || []), res.data],
            },
          ];
          return updated;
        });
      }

      // Reset modals
      setActiveModal(null);
      setEditingBlockId(null);
      setBloqueTitulo('');
      setBloqueHtml('');
      setBloqueBase64('');
      setMenuOpen(false);
      // Background sync (non-blocking)
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !modulo) {
    return <PageLoader message="Cargando editor del módulo..." />;
  }

  const recursos = modulo.lecciones?.[0]?.recursos || [];

  return (
    <div className="min-h-screen bg-muted/10 relative pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4 flex-1">
          <Link
            href="/dashboard/constructor-cursos"
            className="p-2 bg-muted rounded-full hover:bg-border transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="flex flex-col flex-1 max-w-xl">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
                className="font-bold text-xl leading-none bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 w-full transition-colors"
              />
              {moduleTitle !== modulo.titulo && (
                <button
                  onClick={async () => {
                    setSavingTitle(true);
                    await api.patch(`/cursos/modulos/${modulo_id}`, { titulo: moduleTitle });
                    setSavingTitle(false);
                    fetchData();
                  }}
                  className="text-xs bg-primary text-white font-bold px-3 py-1 rounded-full whitespace-nowrap"
                >
                  {savingTitle ? 'Guardando...' : 'Guardar'}
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground px-1 mt-1">Editor de Estructura de Bloques</span>
          </div>
        </div>
        <Link
          href={`/cursos/${curso_id}`}
          target="_blank"
          className="flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
        >
          <Eye className="h-4 w-4" /> Vista Previa
        </Link>
      </header>

      {/* Main Canvas */}
      <div className="max-w-[95%] xl:max-w-[90%] mx-auto mt-12 px-6">
        <div className="space-y-6">
          {/* Existing Blocks Render */}
          {recursos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              El módulo está vacío. Agrega tu primer bloque para comenzar.
            </div>
          ) : (
            recursos.map((r: any, idx: number) => {
              const isQuiz = r.tipo === 'TAREA' && r.titulo.startsWith('[QUIZ]');
              const displayTitle = isQuiz ? r.titulo.replace('[QUIZ] ', '') : r.titulo;

              return (
                <div key={r.guid} className="bg-card border border-border shadow-sm rounded-2xl p-6 relative group">
                  {/* Top Right Actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-muted px-2 py-1 rounded text-muted-foreground uppercase mr-2">
                      {isQuiz ? 'CUESTIONARIO' : r.tipo}
                    </span>
                    <button
                      onClick={() => openAppEdit(r)}
                      className="p-1.5 bg-muted rounded text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBlock(r.guid)}
                      className="p-1.5 bg-muted rounded text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {r.tipo === 'TEXTO' && (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={sanitizeHTML(r.contenido_html)}
                    />
                  )}
                  {r.tipo === 'ENLACE' &&
                    (r.contenido_html?.startsWith('data:image') || r.url_archivo?.startsWith('data:image')) && (
                      <img
                        src={r.contenido_html || r.url_archivo}
                        alt="Módulo Media"
                        className="max-h-64 object-cover rounded-lg mx-auto"
                      />
                    )}
                  {r.tipo === 'ENLACE' &&
                    !(r.contenido_html?.startsWith('data:image') || r.url_archivo?.startsWith('data:image')) && (
                      <div className="flex items-center gap-4 text-pink-500 hover:opacity-80 transition-opacity">
                        <LinkIcon className="h-8 w-8" />
                        <div className="flex-1 overflow-hidden">
                          <h3 className="font-bold truncate">{displayTitle}</h3>
                          <p className="text-xs text-muted-foreground truncate">{r.url_archivo}</p>
                        </div>
                      </div>
                    )}
                  {r.tipo === 'TAREA' && !isQuiz && (
                    <div className="flex items-center gap-4 text-blue-500 hover:opacity-80 transition-opacity">
                      <FileText className="h-8 w-8" />
                      <h3 className="font-bold flex-1">{displayTitle}</h3>
                      <Link
                        href={`/dashboard/constructor-cursos/${curso_id}/tareas/${r.guid}`}
                        className="text-xs border border-blue-500 px-3 py-1 rounded-full cursor-pointer hover:bg-blue-500 hover:text-white transition-colors"
                      >
                        Editar Tarea
                      </Link>
                    </div>
                  )}
                  {r.tipo === 'TAREA' && isQuiz && (
                    <div className="flex items-center gap-4 text-amber-500 hover:opacity-80 transition-opacity">
                      <CheckCircle className="h-8 w-8" />
                      <h3 className="font-bold flex-1">{displayTitle}</h3>
                      <Link
                        href={`/dashboard/constructor-cursos/${curso_id}/tareas/${r.guid}`}
                        className="text-xs border border-amber-500 px-3 py-1 rounded-full cursor-pointer hover:bg-amber-500 hover:text-white transition-colors"
                      >
                        Editar Cuestionario
                      </Link>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Add Block Flow */}
          <div className="flex flex-col items-center pt-8 border-t border-dashed border-border mt-8 relative">
            {!menuOpen ? (
              <button
                onClick={() => {
                  setEditingBlockId(null);
                  setBloqueTitulo('');
                  setBloqueHtml('');
                  setBloqueBase64('');
                  setMenuOpen(true);
                }}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-3 rounded-full shadow-lg transition-transform hover:scale-105"
              >
                <Plus className="h-5 w-5" /> Agregar Bloque
              </button>
            ) : (
              <div className="flex items-center gap-4 animate-in zoom-in-95 duration-200">
                <button
                  onClick={() => setActiveModal('IMAGEN')}
                  className="flex flex-col items-center gap-2 p-4 w-28 bg-card border border-border hover:border-primary rounded-2xl hover:text-primary transition-all shadow-sm"
                >
                  <ImageIcon className="h-6 w-6" /> <span className="text-xs font-bold">Imagen</span>
                </button>
                <button
                  onClick={() => setActiveModal('PARRAFO')}
                  className="flex flex-col items-center gap-2 p-4 w-28 bg-card border border-border hover:border-primary rounded-2xl hover:text-primary transition-all shadow-sm"
                >
                  <Type className="h-6 w-6" /> <span className="text-xs font-bold">Párrafo</span>
                </button>
                <button
                  onClick={() => setActiveModal('TAREA')}
                  className="flex flex-col items-center gap-2 p-4 w-28 bg-card border border-border hover:border-blue-500 text-blue-500/70 hover:text-blue-500 rounded-2xl transition-all shadow-sm"
                >
                  <FileText className="h-6 w-6" /> <span className="text-xs font-bold text-foreground">Tarea</span>
                </button>
                <button
                  onClick={() => setActiveModal('CUESTIONARIO')}
                  className="flex flex-col items-center gap-2 p-4 w-28 bg-card border border-border hover:border-amber-500 text-amber-500/70 hover:text-amber-500 rounded-2xl transition-all shadow-sm"
                >
                  <CheckCircle className="h-6 w-6" />{' '}
                  <span className="text-xs font-bold text-foreground">Cuestionario</span>
                </button>
                <button
                  onClick={() => setActiveModal('ENLACE')}
                  className="flex flex-col items-center gap-2 p-4 w-28 bg-card border border-border hover:border-pink-500 text-pink-500/70 hover:text-pink-500 rounded-2xl transition-all shadow-sm"
                >
                  <LinkIcon className="h-6 w-6" />{' '}
                  <span className="text-xs font-bold text-foreground">Añadir link</span>
                </button>

                <button
                  onClick={() => setMenuOpen(false)}
                  className="h-10 w-10 flex items-center justify-center absolute -right-12 rounded-full bg-muted text-muted-foreground hover:bg-border transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- MODALS --- */}
      {/* Modal Párrafo */}
      {activeModal === 'PARRAFO' && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-3xl rounded-3xl shadow-xl border border-border overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="font-bold flex items-center gap-2">
                <Type className="h-4 w-4 text-primary" /> Editor de Texto Enriquecido
              </h3>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingBlockId(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 flex-1 bg-white dark:bg-card">
              <div className="bg-background rounded-xl border border-border/50">
                <ReactQuill
                  theme="snow"
                  value={bloqueHtml}
                  onChange={setBloqueHtml}
                  className="h-64"
                  placeholder="Escribe tu contenido aquí..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/10">
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingBlockId(null);
                }}
                className="px-4 py-2 font-bold text-muted-foreground hover:bg-muted rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveBlock('PARRAFO')}
                disabled={saving}
                className="px-6 py-2 bg-primary text-white font-bold rounded-lg flex items-center gap-2"
              >
                {saving ? (
                  'Guardando...'
                ) : (
                  <>
                    <Save className="h-4 w-4" /> {editingBlockId ? 'Actualizar' : 'Guardar'} Párrafo
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Imagen */}
      {activeModal === 'IMAGEN' && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card w-full max-w-xl rounded-3xl shadow-xl border border-border overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" /> Subir Imagen (Base64)
              </h3>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingBlockId(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-8 flex-1 flex flex-col items-center">
              {!bloqueBase64 ? (
                <div
                  className="w-full h-48 border-2 border-dashed border-primary/40 rounded-2xl bg-primary/5 flex flex-col items-center justify-center text-center hover:bg-primary/10 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <UploadCloud className="h-10 w-10 text-primary mb-3" />
                  <p className="font-bold text-primary">Haz clic o arrastra tu imagen aquí</p>
                  <p className="text-xs text-muted-foreground mt-2">Soporte JPG, PNG, WEBP (Base64)</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageSelect}
                  />
                </div>
              ) : (
                <div className="relative w-full rounded-2xl overflow-hidden border border-border">
                  <img src={bloqueBase64} alt="Preview" className="w-full h-auto max-h-64 object-cover" />
                  <button
                    onClick={() => setBloqueBase64('')}
                    className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/10">
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingBlockId(null);
                }}
                className="px-4 py-2 font-bold text-muted-foreground hover:bg-muted rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveBlock('IMAGEN')}
                disabled={!bloqueBase64 || saving}
                className="px-6 py-2 bg-primary text-white font-bold rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  'Guardando...'
                ) : (
                  <>
                    <Save className="h-4 w-4" /> {editingBlockId ? 'Actualizar' : 'Confirmar'} Imagen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tarea / Cuestionario placeholder simplificado propuesto por usuario */}
      {(activeModal === 'TAREA' || activeModal === 'CUESTIONARIO') && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-3xl shadow-xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="font-bold text-xl flex items-center gap-2">
                {activeModal === 'TAREA' ? (
                  <FileText className="h-5 w-5 text-blue-500" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-amber-500" />
                )}
                Configurar {activeModal === 'TAREA' ? 'Tarea' : 'Cuestionario'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Se insertará un enlace dinámico hacia la actividad.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground">
                  Nombre de la Actividad
                </label>
                <input
                  type="text"
                  value={bloqueTitulo}
                  onChange={(e) => setBloqueTitulo(e.target.value)}
                  className="w-full bg-muted border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                  placeholder={`Ej: ${activeModal === 'TAREA' ? 'Ensayo Crítico 1' : 'Evaluación Parcial 2'}`}
                />
              </div>
              {activeModal === 'CUESTIONARIO' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-2 text-muted-foreground">
                    Intentos Máximos Permitidos
                  </label>
                  <input
                    type="number"
                    defaultValue={1}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/10">
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingBlockId(null);
                }}
                className="px-4 py-2 font-bold text-muted-foreground hover:bg-muted rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveBlock(activeModal)}
                disabled={saving}
                className={`px-6 py-2 text-white font-bold rounded-lg flex items-center gap-2 ${activeModal === 'TAREA' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-amber-500 hover:bg-amber-600'}`}
              >
                {saving ? (
                  'Guardando...'
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> {editingBlockId ? 'Actualizar en' : 'Insertar en'} Módulo
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ENLACE */}
      {activeModal === 'ENLACE' && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-3xl shadow-xl border border-border overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="font-bold flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-pink-500" /> Nuevo Enlace Externo
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 flex-1 bg-white dark:bg-card space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Texto del Enlace</label>
                <input
                  type="text"
                  value={bloqueTitulo}
                  onChange={(e) => setBloqueTitulo(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  placeholder="Ej: Ir a la Clase de Matemáticas"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">URL Destino</label>
                <input
                  type="url"
                  value={bloqueHtml}
                  onChange={(e) => setBloqueHtml(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  placeholder="https://google.com"
                />
              </div>
              <div className="text-xs text-muted-foreground mt-4">
                Se agregará un enlace clickeable que abrirá una pestaña nueva para el estudiante.
              </div>
            </div>
            <div className="p-4 border-t border-border bg-muted/30 flex justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-6 py-2 rounded-xl font-bold bg-muted hover:bg-border transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!bloqueTitulo || !bloqueHtml) {
                    showAlert.warning('Atención', 'Completa título y enlace');
                    return;
                  }
                  handleSaveBlock('ENLACE', { titulo: bloqueTitulo, url_archivo: bloqueHtml });
                }}
                disabled={saving}
                className="px-6 py-2 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white transition-colors"
              >
                {saving ? 'Guardando...' : 'Crear Enlace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
