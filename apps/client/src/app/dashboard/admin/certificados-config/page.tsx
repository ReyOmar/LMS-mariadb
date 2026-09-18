'use client';

import { useEffect, useState } from 'react';
import { Award, Save, Loader2, ToggleLeft, Type, AlignLeft, Palette, Info, BookOpen } from 'lucide-react';
import { useAlert } from '@/contexts/AlertContext';
import api, { mensajeDeError, urlDeArchivo } from '@/lib/api';
import { NOTA_MAXIMA } from '@/lib/calificacion';

interface CertConfig {
  cert_titulo_personalizado: string | null;
  cert_subtitulo: string | null;
  cert_texto_legal: string | null;
  cert_mostrar_modulos: boolean;
  cert_mostrar_recursos: boolean;
  cert_mostrar_nota: boolean;
  cert_mostrar_firma: boolean;
  cert_mostrar_fecha_ingreso: boolean;
  nombre_plataforma: string;
  color_primario: string;
  color_secundario: string;
}

interface CursoPreview {
  guid: string;
  titulo: string;
}

interface ExaminerPreview {
  titulo: string;
  profesor: {
    nombre: string;
    apellido: string;
    firma_url: string | null;
    firma_nombre: string | null;
    firma_cargo: string | null;
  };
}

export default function CertificadosConfigPage() {
  const { showAlert, showToast } = useAlert();
  const [config, setConfig] = useState<CertConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cursos, setCursos] = useState<CursoPreview[]>([]);
  const [selectedCursoGuid, setSelectedCursoGuid] = useState<string>('');
  const [examinerPreview, setExaminerPreview] = useState<ExaminerPreview | null>(null);

  useEffect(() => {
    fetchConfig();
    fetchCursos();
  }, []);

  useEffect(() => {
    if (selectedCursoGuid) fetchExaminerPreview(selectedCursoGuid);
    else setExaminerPreview(null);
  }, [selectedCursoGuid]);

  const fetchConfig = async () => {
    try {
      const res = await api.get('/configuracion/certificados');
      setConfig(res.data);
    } catch {
      showAlert.error('Error', 'No se pudo cargar la configuración.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCursos = async () => {
    try {
      const res = await api.get('/cursos');
      setCursos(Array.isArray(res.data) ? res.data.map((c: any) => ({ guid: c.guid, titulo: c.titulo })) : []);
    } catch {}
  };

  const fetchExaminerPreview = async (cursoGuid: string) => {
    try {
      // Add cache-bust to ensure fresh data after examiner updates their signature
      const res = await api.get(`/configuracion/firma/curso/${cursoGuid}`);
      setExaminerPreview(res.data);
    } catch {
      setExaminerPreview(null);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.post('/configuracion/certificados', {
        cert_titulo_personalizado: config.cert_titulo_personalizado || null,
        cert_subtitulo: config.cert_subtitulo || null,
        cert_texto_legal: config.cert_texto_legal || null,
        cert_mostrar_modulos: config.cert_mostrar_modulos,
        cert_mostrar_recursos: config.cert_mostrar_recursos,
        cert_mostrar_nota: config.cert_mostrar_nota,
        cert_mostrar_firma: config.cert_mostrar_firma,
        cert_mostrar_fecha_ingreso: config.cert_mostrar_fecha_ingreso,
      });
      showToast.success('Configuración de certificados actualizada.');
    } catch (err: any) {
      showAlert.error('Error', err?.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof CertConfig>(key: K, value: CertConfig[K]) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!config) return null;

  const previewProfesor = examinerPreview?.profesor;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-foreground flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Award className="h-5 w-5 text-primary" />
            </div>
            Configuración de Certificados
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Personaliza el diseño y contenido global de los certificados PDF.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 flex items-center gap-2 shrink-0"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Section: Título y Subtítulo */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <Type className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Título del Certificado</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-foreground mb-1.5">Título Principal</label>
            <input
              type="text"
              value={config.cert_titulo_personalizado || ''}
              onChange={(e) => updateField('cert_titulo_personalizado', e.target.value)}
              placeholder="CERTIFICADO"
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <p className="text-xs text-muted-foreground mt-1">Déjalo vacío para usar "CERTIFICADO" por defecto.</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-1.5">Subtítulo</label>
            <input
              type="text"
              value={config.cert_subtitulo || ''}
              onChange={(e) => updateField('cert_subtitulo', e.target.value)}
              placeholder="DE FINALIZACIÓN"
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>
        </div>
      </section>

      {/* Section: Texto Legal */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <AlignLeft className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Texto Descriptivo / Legal</h2>
        </div>
        <div className="p-6">
          <textarea
            value={config.cert_texto_legal || ''}
            onChange={(e) => updateField('cert_texto_legal', e.target.value)}
            placeholder="El presente certificado acredita que el participante cumplió satisfactoriamente..."
            rows={4}
            className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Si lo dejas vacío, se generará automáticamente con la cantidad de módulos y recursos del curso.
          </p>
        </div>
      </section>

      {/* Section: Elementos Visibles */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <ToggleLeft className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Elementos Visibles</h2>
        </div>
        <div className="p-6 space-y-3">
          {[
            {
              key: 'cert_mostrar_fecha_ingreso' as const,
              label: 'Mostrar fecha de inscripción',
              desc: 'Incluye la fecha en la que el estudiante fue matriculado o inició el curso.',
            },
            {
              key: 'cert_mostrar_modulos' as const,
              label: 'Mostrar cantidad de módulos',
              desc: 'Muestra la cantidad de módulos del curso en la fila de métricas.',
            },
            {
              key: 'cert_mostrar_recursos' as const,
              label: 'Mostrar cantidad de recursos',
              desc: 'Muestra el total de recursos formativos en la fila de métricas.',
            },
            {
              key: 'cert_mostrar_nota' as const,
              label: 'Mostrar calificación promedio',
              desc: 'Incluye la calificación promedio obtenida por el estudiante.',
            },
            {
              key: 'cert_mostrar_firma' as const,
              label: 'Mostrar área de firma',
              desc: 'Incluye la firma del examinador asignado al curso.',
            },
          ].map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-center justify-between p-4 bg-background border border-border/50 rounded-xl cursor-pointer group hover:border-primary/30 transition-colors"
            >
              <div>
                <p className="text-sm font-bold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={config[key]}
                  onChange={(e) => updateField(key, e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted rounded-full peer-checked:bg-primary transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform" />
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Section: Vista Previa con Selector de Curso */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Vista Previa</h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Info note */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-blue-700 dark:text-blue-400">Datos del examinador</p>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                La firma, nombre y cargo del firmante se obtienen automáticamente de la configuración del examinador
                asignado a cada curso. Selecciona un curso para previsualizar cómo quedaría el certificado con sus
                datos.
              </p>
            </div>
          </div>

          {/* Course Selector */}
          <div>
            <label className="block text-sm font-bold text-foreground mb-1.5">
              <BookOpen className="h-4 w-4 inline mr-1.5 relative -top-[1px]" />
              Seleccionar curso para vista previa
            </label>
            <select
              value={selectedCursoGuid}
              onChange={(e) => setSelectedCursoGuid(e.target.value)}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            >
              <option value="">— Selecciona un curso —</option>
              {cursos.map((c) => (
                <option key={c.guid} value={c.guid}>
                  {c.titulo}
                </option>
              ))}
            </select>
          </div>

          {/* Examiner info preview */}
          {previewProfesor && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                Datos del Examinador del Curso
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">Nombre</p>
                  <p className="text-sm font-bold text-foreground">
                    {previewProfesor.nombre} {previewProfesor.apellido}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Nombre en Firma</p>
                  <p className="text-sm font-bold text-foreground">
                    {previewProfesor.firma_nombre || (
                      <span className="text-muted-foreground italic">Sin configurar</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Cargo</p>
                  <p className="text-sm font-bold text-foreground">
                    {previewProfesor.firma_cargo || (
                      <span className="text-muted-foreground italic">Sin configurar</span>
                    )}
                  </p>
                </div>
              </div>
              {previewProfesor.firma_url && (
                <div className="mt-3 flex items-center gap-3 p-3 bg-white dark:bg-background rounded-lg border border-border/50">
                  <div className="h-12 w-28 bg-muted/30 rounded-lg border border-dashed border-border flex items-center justify-center overflow-hidden">
                    <img
                      src={urlDeArchivo(previewProfesor.firma_url) ?? ''}
                      alt="Firma"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-emerald-600 font-bold">✓ Imagen de firma cargada</p>
                </div>
              )}
              {!previewProfesor.firma_url && !previewProfesor.firma_nombre && (
                <p className="text-xs text-amber-600 mt-2 font-medium">
                  ⚠ Este examinador aún no ha configurado su firma. Se usará su nombre por defecto.
                </p>
              )}
            </div>
          )}

          {/* Certificate preview — properly scaled */}
          <div
            className="relative bg-white rounded-2xl border-2 border-border shadow-lg overflow-hidden mx-auto"
            style={{ aspectRatio: '842/595', maxWidth: '100%', minHeight: '420px' }}
          >
            <div className="absolute inset-0 p-[5%] flex flex-col items-center justify-between text-center">
              {/* Top gradient bar */}
              <div
                className="absolute top-0 left-0 right-0 h-2 rounded-t-2xl"
                style={{ background: `linear-gradient(90deg, ${config.color_primario}, ${config.color_secundario})` }}
              />
              {/* Bottom gradient bar */}
              <div
                className="absolute bottom-0 left-0 right-0 h-2 rounded-b-2xl"
                style={{ background: `linear-gradient(90deg, ${config.color_secundario}, ${config.color_primario})` }}
              />

              {/* Header Section */}
              <div className="flex flex-col items-center gap-1 pt-2">
                <p
                  className="text-xs tracking-[0.25em] font-semibold uppercase"
                  style={{ color: config.color_primario }}
                >
                  {config.nombre_plataforma}
                </p>
                <div
                  className="w-20 h-[2px] my-1"
                  style={{ background: `linear-gradient(90deg, transparent, ${config.color_primario}, transparent)` }}
                />
                <p className="text-2xl font-black text-slate-800 tracking-wide">
                  {config.cert_titulo_personalizado || 'CERTIFICADO'}
                </p>
                <p className="text-xs tracking-[0.3em] text-slate-500 font-medium">
                  {config.cert_subtitulo || 'DE FINALIZACIÓN'}
                </p>
              </div>

              {/* Body Section */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-slate-400">Se otorga a:</p>
                <p className="text-xl font-bold" style={{ color: config.color_primario }}>
                  Juan Pérez
                </p>
                <div className="w-32 h-[2px]" style={{ background: config.color_primario, opacity: 0.3 }} />
                <p className="text-xs text-slate-500">Por haber completado exitosamente el curso:</p>
                <p className="text-base font-bold text-slate-800">
                  &ldquo;{examinerPreview?.titulo || 'Ejemplo de Curso'}&rdquo;
                </p>
                <p className="text-[11px] text-slate-400 max-w-[85%] leading-relaxed mt-1">
                  {config.cert_texto_legal
                    ? config.cert_texto_legal.substring(0, 200) + (config.cert_texto_legal.length > 200 ? '...' : '')
                    : 'El presente certificado acredita que el participante cumplió satisfactoriamente con la totalidad del programa de capacitación...'}
                </p>
              </div>

              {/* Metrics Row */}
              <div className="flex items-center justify-center gap-6 flex-wrap">
                {config.cert_mostrar_fecha_ingreso && (
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Inscripción</p>
                    <p className="text-xs font-bold text-slate-600">1 de mayo de 2026</p>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Finalización</p>
                  <p className="text-xs font-bold text-slate-600">5 de mayo de 2026</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Duración</p>
                  <p className="text-xs font-bold text-slate-600">12.5 horas</p>
                </div>
                {config.cert_mostrar_modulos && (
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Módulos</p>
                    <p className="text-xs font-bold text-slate-600">3</p>
                  </div>
                )}
                {config.cert_mostrar_recursos && (
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Recursos</p>
                    <p className="text-xs font-bold text-slate-600">15</p>
                  </div>
                )}
                {config.cert_mostrar_nota && (
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Calificación</p>
                    <p className="text-xs font-bold text-slate-600">{`92 / ${NOTA_MAXIMA}`}</p>
                  </div>
                )}
              </div>

              {/* Signature Section */}
              {config.cert_mostrar_firma && (
                <div className="flex flex-col items-center gap-1 pb-2">
                  {previewProfesor?.firma_url && (
                    <div className="h-14 w-32 flex items-center justify-center">
                      <img
                        src={urlDeArchivo(previewProfesor.firma_url) ?? ''}
                        alt="Firma del examinador"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  )}
                  <div className="w-36 h-[1px] bg-slate-300" />
                  <p className="text-xs font-bold text-slate-700 mt-1">
                    {previewProfesor?.firma_nombre
                      ? previewProfesor.firma_nombre
                      : previewProfesor
                        ? `${previewProfesor.nombre} ${previewProfesor.apellido}`
                        : 'Nombre del Instructor'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {previewProfesor?.firma_cargo || 'Instructor / Examinador del Curso'}
                  </p>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Vista previa aproximada — Los cambios se reflejarán en los próximos certificados generados.
          </p>
        </div>
      </section>
    </div>
  );
}
