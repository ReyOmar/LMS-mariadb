'use client';

import { useEffect, useState } from 'react';
import {
  AlignLeft,
  Award,
  BookOpen,
  CalendarClock,
  Info,
  Loader2,
  Palette,
  Save,
  ToggleLeft,
  Type,
} from 'lucide-react';
import { useAlerts } from '@/contexts/AlertContext';
import { PageLoader } from '@/components/ui/PageLoader';
import api, { errorMessage, fileUrlFor } from '@/lib/api';
import { MAX_SCORE } from '@/lib/grading';
import type { Course } from '@/types/models';

interface CertConfig {
  certCustomTitle: string | null;
  certSubtitle: string | null;
  certLegalText: string | null;
  certShowModules: boolean;
  certShowResources: boolean;
  certShowScore: boolean;
  certShowSignature: boolean;
  certShowEnrollmentDate: boolean;
  /** Meses que acredita el certificado. Nulo o 0 = sin caducidad. */
  certValidityMonths: number | null;
  platformName: string;
  primaryColor: string;
  secondaryColor: string;
}

interface CoursePreview {
  guid: string;
  title: string;
}

interface ExaminerPreview {
  title: string;
  teacher: {
    firstName: string;
    lastName: string;
    signatureUrl: string | null;
    signatureName: string | null;
    signatureTitle: string | null;
  };
}

export default function CertificateSettingsPage() {
  const { showAlert, notify } = useAlerts();
  const [config, setConfig] = useState<CertConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<CoursePreview[]>([]);
  const [selectedCourseGuid, setSelectedCourseGuid] = useState<string>('');
  const [examinerSample, setExaminerSample] = useState<ExaminerPreview | null>(null);

  useEffect(() => {
    api
      .get<CertConfig>('/settings/certificates')
      .then(({ data }) => setConfig(data))
      .catch((error: unknown) =>
        showAlert.error('No se pudo cargar la configuración', errorMessage(error, 'Inténtalo de nuevo más tarde.')),
      )
      .finally(() => setLoading(false));

    api
      .get<Course[]>('/courses')
      .then(({ data }) =>
        setCourses(Array.isArray(data) ? data.map((course) => ({ guid: course.guid, title: course.title })) : []),
      )
      .catch((error: unknown) => notify.error('No se pudieron cargar los cursos', errorMessage(error)));
  }, [showAlert, notify]);

  // Datos del examinador del curso elegido para la vista previa.
  useEffect(() => {
    if (!selectedCourseGuid) {
      setExaminerSample(null);
      return;
    }

    let current = true;
    api
      .get<ExaminerPreview>(`/settings/signature/course/${selectedCourseGuid}`)
      .then(({ data }) => {
        if (current) setExaminerSample(data);
      })
      .catch(() => {
        if (current) setExaminerSample(null);
      });
    return () => {
      current = false;
    };
  }, [selectedCourseGuid]);

  const onSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.post('/settings/certificates', {
        certCustomTitle: config.certCustomTitle || null,
        certSubtitle: config.certSubtitle || null,
        certLegalText: config.certLegalText || null,
        certShowModules: config.certShowModules,
        certShowResources: config.certShowResources,
        certShowScore: config.certShowScore,
        certShowSignature: config.certShowSignature,
        certShowEnrollmentDate: config.certShowEnrollmentDate,
        certValidityMonths: config.certValidityMonths || null,
      });
      notify.success('Configuración de certificados actualizada.');
    } catch (error) {
      showAlert.error('No se pudo guardar', errorMessage(error, 'No se pudo guardar la configuración.'));
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof CertConfig>(key: K, value: CertConfig[K]) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  if (loading) return <PageLoader message="Cargando configuración de certificados…" />;

  if (!config) return null;

  const sampleTeacher = examinerSample?.teacher;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Award className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            Certificados
          </h1>
          <p className="text-muted-foreground mt-1">
            Personaliza el diseño y contenido global de los certificados PDF.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 flex items-center gap-2 shrink-0"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {/* Sección: título y subtítulo */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <Type className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Título del certificado</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="cert-title" className="block text-sm font-bold text-foreground mb-1.5">
              Título principal
            </label>
            <input
              id="cert-title"
              type="text"
              value={config.certCustomTitle || ''}
              onChange={(e) => updateField('certCustomTitle', e.target.value)}
              placeholder="CERTIFICADO"
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <p className="text-xs text-muted-foreground mt-1">Déjalo vacío para usar «CERTIFICADO» por defecto.</p>
          </div>
          <div>
            <label htmlFor="cert-subtitle" className="block text-sm font-bold text-foreground mb-1.5">
              Subtítulo
            </label>
            <input
              id="cert-subtitle"
              type="text"
              value={config.certSubtitle || ''}
              onChange={(e) => updateField('certSubtitle', e.target.value)}
              placeholder="DE FINALIZACIÓN"
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>
        </div>
      </section>

      {/* Sección: vigencia */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Vigencia del certificado</h2>
        </div>
        <div className="p-6">
          <label htmlFor="cert-validity" className="block text-sm font-bold text-foreground mb-1.5">
            Meses que acredita
          </label>
          <div className="flex items-center gap-3">
            <input
              id="cert-validity"
              type="number"
              min={0}
              max={600}
              value={config.certValidityMonths ?? ''}
              onChange={(e) => updateField('certValidityMonths', e.target.value === '' ? null : Number(e.target.value))}
              placeholder="Sin caducidad"
              className="w-40 px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <span className="text-sm font-medium text-muted-foreground">meses</span>
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">Lo normal es dejarlo vacío.</strong> Un certificado acredita que esa
              persona completó la formación en una fecha, y ese hecho no caduca: si lo presenta seis meses después, debe
              seguir sirviendo.
            </p>
            <p>
              Ponle un plazo sólo si una norma exige renovar la capacitación cada cierto tiempo. Con un plazo corto,
              quien presente su certificado pasado ese tiempo lo verá marcado como vencido.
            </p>
            <p>
              En cualquier caso, volver a inscribir a alguien en el mismo curso no depende de esto: se puede hacer
              cuando haga falta, y al terminarlo recibirá un certificado nuevo. El anterior se conserva y su código
              sigue verificándose.
            </p>
          </div>
        </div>
      </section>

      {/* Sección: texto legal */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <AlignLeft className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Texto descriptivo / legal</h2>
        </div>
        <div className="p-6">
          <textarea
            aria-label="Texto descriptivo o legal del certificado"
            value={config.certLegalText || ''}
            onChange={(e) => updateField('certLegalText', e.target.value)}
            placeholder="El presente certificado acredita que el participante cumplió satisfactoriamente..."
            rows={4}
            className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Si lo dejas vacío, se generará automáticamente con la cantidad de módulos y recursos del curso.
          </p>
        </div>
      </section>

      {/* Sección: elementos visibles */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <ToggleLeft className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Elementos visibles</h2>
        </div>
        <div className="p-6 space-y-3">
          {[
            {
              key: 'certShowEnrollmentDate' as const,
              label: 'Mostrar fecha de inscripción',
              desc: 'Incluye la fecha en la que el estudiante fue matriculado o inició el curso.',
            },
            {
              key: 'certShowModules' as const,
              label: 'Mostrar cantidad de módulos',
              desc: 'Muestra la cantidad de módulos del curso en la fila de métricas.',
            },
            {
              key: 'certShowResources' as const,
              label: 'Mostrar cantidad de recursos',
              desc: 'Muestra el total de recursos formativos en la fila de métricas.',
            },
            {
              key: 'certShowScore' as const,
              label: 'Mostrar calificación promedio',
              desc: 'Incluye la calificación promedio obtenida por el estudiante.',
            },
            {
              key: 'certShowSignature' as const,
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

      {/* Sección: vista previa con selector de curso */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Vista previa</h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Nota informativa */}
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

          {/* Selector de curso */}
          <div>
            <label htmlFor="cert-preview-course" className="block text-sm font-bold text-foreground mb-1.5">
              <BookOpen className="h-4 w-4 inline mr-1.5 relative -top-[1px]" />
              Seleccionar curso para vista previa
            </label>
            <select
              id="cert-preview-course"
              value={selectedCourseGuid}
              onChange={(e) => setSelectedCourseGuid(e.target.value)}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            >
              <option value="">— Selecciona un curso —</option>
              {courses.map((c) => (
                <option key={c.guid} value={c.guid}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Vista previa de los datos del examinador */}
          {sampleTeacher && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                Datos del examinador del curso
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">Nombre</p>
                  <p className="text-sm font-bold text-foreground">
                    {sampleTeacher.firstName} {sampleTeacher.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Nombre en firma</p>
                  <p className="text-sm font-bold text-foreground">
                    {sampleTeacher.signatureName || (
                      <span className="text-muted-foreground italic">Sin configurar</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Cargo</p>
                  <p className="text-sm font-bold text-foreground">
                    {sampleTeacher.signatureTitle || (
                      <span className="text-muted-foreground italic">Sin configurar</span>
                    )}
                  </p>
                </div>
              </div>
              {sampleTeacher.signatureUrl && (
                <div className="mt-3 flex items-center gap-3 p-3 bg-white dark:bg-background rounded-lg border border-border/50">
                  <div className="h-12 w-28 bg-muted/30 rounded-lg border border-dashed border-border flex items-center justify-center overflow-hidden">
                    <img
                      src={fileUrlFor(sampleTeacher.signatureUrl) ?? ''}
                      alt="Firma"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold">✓ Imagen de firma cargada</p>
                </div>
              )}
              {!sampleTeacher.signatureUrl && !sampleTeacher.signatureName && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 font-medium">
                  ⚠ Este examinador aún no ha configurado su firma. Se usará su nombre por defecto.
                </p>
              )}
            </div>
          )}

          {/* Vista previa del certificado, a escala */}
          <div
            className="relative bg-white rounded-2xl border-2 border-border shadow-lg overflow-hidden mx-auto"
            style={{ aspectRatio: '842/595', maxWidth: '100%', minHeight: '420px' }}
          >
            <div className="absolute inset-0 p-[5%] flex flex-col items-center justify-between text-center">
              {/* Franja degradada superior */}
              <div
                className="absolute top-0 left-0 right-0 h-2 rounded-t-2xl"
                style={{ background: `linear-gradient(90deg, ${config.primaryColor}, ${config.secondaryColor})` }}
              />
              {/* Franja degradada inferior */}
              <div
                className="absolute bottom-0 left-0 right-0 h-2 rounded-b-2xl"
                style={{ background: `linear-gradient(90deg, ${config.secondaryColor}, ${config.primaryColor})` }}
              />

              {/* Cabecera */}
              <div className="flex flex-col items-center gap-1 pt-2">
                <p className="text-xs tracking-[0.25em] font-semibold uppercase" style={{ color: config.primaryColor }}>
                  {config.platformName}
                </p>
                <div
                  className="w-20 h-[2px] my-1"
                  style={{ background: `linear-gradient(90deg, transparent, ${config.primaryColor}, transparent)` }}
                />
                <p className="text-2xl font-black text-slate-800 tracking-wide">
                  {config.certCustomTitle || 'CERTIFICADO'}
                </p>
                <p className="text-xs tracking-[0.3em] text-slate-500 font-medium">
                  {config.certSubtitle || 'DE FINALIZACIÓN'}
                </p>
              </div>

              {/* Cuerpo */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-slate-400">Se otorga a:</p>
                <p className="text-xl font-bold" style={{ color: config.primaryColor }}>
                  Juan Pérez
                </p>
                <div className="w-32 h-[2px]" style={{ background: config.primaryColor, opacity: 0.3 }} />
                <p className="text-xs text-slate-500">Por haber completado exitosamente el curso:</p>
                <p className="text-base font-bold text-slate-800">
                  &ldquo;{examinerSample?.title || 'Ejemplo de curso'}&rdquo;
                </p>
                <p className="text-[11px] text-slate-400 max-w-[85%] leading-relaxed mt-1">
                  {config.certLegalText
                    ? config.certLegalText.substring(0, 200) + (config.certLegalText.length > 200 ? '...' : '')
                    : 'El presente certificado acredita que el participante cumplió satisfactoriamente con la totalidad del programa de capacitación...'}
                </p>
              </div>

              {/* Fila de métricas */}
              <div className="flex items-center justify-center gap-6 flex-wrap">
                {config.certShowEnrollmentDate && (
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
                {config.certShowModules && (
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Módulos</p>
                    <p className="text-xs font-bold text-slate-600">3</p>
                  </div>
                )}
                {config.certShowResources && (
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Recursos</p>
                    <p className="text-xs font-bold text-slate-600">15</p>
                  </div>
                )}
                {config.certShowScore && (
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Calificación</p>
                    <p className="text-xs font-bold text-slate-600">{`92 / ${MAX_SCORE}`}</p>
                  </div>
                )}
              </div>

              {/* Bloque de la firma */}
              {config.certShowSignature && (
                <div className="flex flex-col items-center gap-1 pb-2">
                  {sampleTeacher?.signatureUrl && (
                    <div className="h-14 w-32 flex items-center justify-center">
                      <img
                        src={fileUrlFor(sampleTeacher.signatureUrl) ?? ''}
                        alt="Firma del examinador"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  )}
                  <div className="w-36 h-[1px] bg-slate-300" />
                  <p className="text-xs font-bold text-slate-700 mt-1">
                    {sampleTeacher?.signatureName
                      ? sampleTeacher.signatureName
                      : sampleTeacher
                        ? `${sampleTeacher.firstName} ${sampleTeacher.lastName}`
                        : 'Nombre del instructor'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {sampleTeacher?.signatureTitle || 'Instructor / examinador del curso'}
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
