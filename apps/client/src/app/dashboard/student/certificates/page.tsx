'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import {
  Award,
  Download,
  Eye,
  Calendar,
  Clock,
  Star,
  Loader2,
  GraduationCap,
  X,
  BookOpen,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageLoader } from '@/components/ui/PageLoader';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { useAlerts } from '@/contexts/AlertContext';
import { useDialog } from '@/hooks/useDialog';
import api, { errorMessage } from '@/lib/api';
import { averageScore, formatPoints, formatScore } from '@/lib/grading';
import { longDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import type { Certificate } from '@/types/models';

/** Curso terminado cuyo certificado espera a que el examinador califique alguna tarea. */
interface CourseAwaitingGrading {
  courseGuid: string;
  courseTitle: string;
  pendingAssignments: { title: string }[];
}

/** «1 hora» / «8 horas»: el singular importa cuando el programa dura una. */
function formatHours(hours: number): string {
  const value = Math.round(Number(hours));
  return `${value} ${plural(value, 'hora', 'horas')}`;
}

/**
 * Tiempo que el alumno estuvo trabajando dentro del curso, en palabras.
 *
 * Se cuenta aparte de la intensidad horaria y no la sustituye: el certificado acredita el
 * programa, esto es cuánto le llevó a esta persona. Por debajo del minuto se redondea a
 * «menos de 1 min» en lugar de enseñar segundos, que no aportan nada aquí.
 */
function formatTimeSpent(seconds: number): string {
  if (!seconds || seconds < 60) return 'menos de 1 min';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

// `useSearchParams` exige un límite de Suspense para que Next pueda prerenderizar la página.
export default function StudentCertificatesPage() {
  return (
    <Suspense fallback={<PageLoader message="Cargando tus certificados..." />}>
      <StudentCertificates />
    </Suspense>
  );
}

function StudentCertificates() {
  const { user } = useSession();
  const { showAlert, notify } = useAlerts();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [pendingCourses, setPendingCourses] = useState<CourseAwaitingGrading[]>([]);

  /** Los certificados obtenidos y los cursos que esperan calificación, en una sola vuelta. */
  const loadCertificates = useCallback(async () => {
    try {
      const [earnedRes, awaiting] = await Promise.all([
        api.get<Certificate[]>('/certificates'),
        api.get<CourseAwaitingGrading[]>('/certificates/awaiting-grading'),
      ]);
      setCertificates(Array.isArray(earnedRes.data) ? earnedRes.data : []);
      setPendingCourses(Array.isArray(awaiting.data) ? awaiting.data : []);
    } catch (error) {
      showAlert.error(
        'Error al cargar certificados',
        errorMessage(error, 'No se pudieron obtener tus certificados. Inténtalo de nuevo más tarde.'),
      );
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (!user?.guid) return;
    void loadCertificates();
  }, [user?.guid, loadCertificates]);

  useRealtimeEvent('certificate:new', () => loadCertificates());
  useRealtimeEvent('submission:graded', () => loadCertificates());

  // `?open=<guid>` abre directamente la ficha de ese certificado (se enlaza desde el curso).
  useEffect(() => {
    const openGuid = searchParams.get('open');
    if (openGuid && certificates.length > 0 && !selectedCert) {
      const cert = certificates.find((c) => c.guid === openGuid);
      if (cert) setSelectedCert(cert);
    }
  }, [searchParams, certificates, selectedCert]);

  /** Cierra la ficha y quita `?open=` de la dirección: si no, volvería a abrirse sola. */
  const closeDetails = () => {
    setSelectedCert(null);
    if (searchParams.get('open')) {
      router.replace('/dashboard/student/certificates', { scroll: false });
    }
  };
  const { dialogProps, titleId } = useDialog({ open: selectedCert !== null, onClose: closeDetails });

  const average = averageScore(certificates.map((certificate) => certificate.averageScore));

  const onDownload = async (cert: Certificate) => {
    setDownloading(cert.guid);
    try {
      const response = await api.get<Blob>(`/certificates/${cert.guid}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Certificado-${cert.courseTitle.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      notify.success('El archivo PDF se ha descargado correctamente.');
    } catch (error) {
      showAlert.error('Error al descargar', errorMessage(error, 'No se pudo descargar el certificado.'));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Award className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Mis certificados
        </h1>
        <p className="text-muted-foreground mt-2">
          Tus certificados de finalización de cursos. Descárgalos en formato PDF.
        </p>
      </header>

      {/* Resumen de cifras */}
      {!loading && certificates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-in fade-in-0 duration-500">
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-foreground">{certificates.length}</p>
                <p className="text-xs text-muted-foreground font-medium">Certificados obtenidos</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-foreground">
                  {certificates.reduce((sum, c) => sum + Number(c.hours || 0), 0).toFixed(0)}h
                </p>
                <p className="text-xs text-muted-foreground font-medium">Horas de capacitación</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                <Star className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-foreground">{formatPoints(average)}</p>
                <p className="text-xs text-muted-foreground font-medium">Promedio general</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aviso de entregas por calificar */}
      {!loading && pendingCourses.length > 0 && (
        <div className="mb-8 animate-in fade-in-0 duration-500">
          {pendingCourses.map((cp) => (
            <div key={cp.courseGuid} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-sm text-foreground mb-1">{cp.courseTitle} — Esperando calificación</h3>
                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                    Has completado todos los recursos de este curso, pero tu certificado se generará automáticamente
                    cuando el examinador califique las siguientes tareas:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cp.pendingAssignments.map((t, ti) => (
                      <span
                        key={`${t.title}-${ti}`}
                        className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium px-2.5 py-1 rounded-lg"
                      >
                        <Clock className="h-3 w-3" /> {t.title}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <PageLoader message="Cargando tus certificados..." />
      ) : certificates.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-16 text-center shadow-sm">
          <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Award className="h-12 w-12 text-primary/20" />
          </div>
          <h3 className="text-xl font-bold mb-3 text-foreground">Aún no tienes certificados</h3>
          <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
            Los certificados se generan automáticamente cuando completas <strong>todos los módulos</strong> de un curso.
            ¡Sigue avanzando en tus cursos activos!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certificates.map((cert, index) => (
            <div
              key={cert.guid}
              className="group bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300 animate-in fade-in-0 slide-in-from-bottom-2"
              style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
            >
              {/* Tarjeta de vista previa del certificado */}
              <div className="relative h-40 bg-gradient-to-br from-primary/10 via-primary/5 to-secondary/10 flex items-center justify-center overflow-hidden">
                {/* Adornos */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-primary/60 to-secondary" />
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full" />
                <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-secondary/5 rounded-full" />

                <div className="text-center z-10 px-6">
                  <div className="w-14 h-14 bg-primary/15 rounded-full flex items-center justify-center mx-auto mb-3 ring-4 ring-background shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Award className="h-7 w-7 text-primary" />
                  </div>
                  <p className="text-[10px] font-bold text-primary/60 uppercase tracking-[3px]">Certificado</p>
                </div>
              </div>

              <div className="p-5">
                <h3 className="font-bold text-base leading-tight mb-3 text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {cert.courseTitle}
                </h3>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>Completado el {longDate(cert.completedAt)}</span>
                  </div>
                  {/* Sólo se menciona la vuelta a partir de la segunda: la primera es lo normal. */}
                  {cert.attempt > 1 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                      <span>{cert.attempt}.ª vez que cursas este programa</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{formatHours(cert.hours)} de capacitación</span>
                  </div>
                  {cert.validUntil && (
                    <div
                      className={`flex items-center gap-2 text-xs ${cert.unexpired ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400 font-bold'}`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {cert.unexpired ? 'Válido hasta' : 'Venció el'} {longDate(cert.validUntil)}
                      </span>
                    </div>
                  )}
                  {cert.averageScore !== null && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>
                        Calificación promedio:{' '}
                        <strong className="text-foreground">{formatScore(cert.averageScore)}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCert(cert)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 font-bold text-xs py-2.5 rounded-xl transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" /> Ver detalle
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownload(cert)}
                    disabled={downloading === cert.guid}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-60"
                  >
                    {downloading === cert.guid ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {downloading === cert.guid ? 'Descargando...' : 'Descargar PDF'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ventana con el detalle del certificado */}
      {selectedCert && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={closeDetails}
        >
          <div
            {...dialogProps}
            className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera de la ventana: vista previa del certificado */}
            <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10 p-8 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-primary/60 to-secondary" />
              <div className="absolute -top-16 -right-16 w-40 h-40 bg-primary/5 rounded-full" />
              <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-secondary/5 rounded-full" />

              <button
                type="button"
                onClick={closeDetails}
                aria-label="Cerrar"
                className="absolute top-4 right-4 p-2 rounded-full bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors z-10"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="relative z-10">
                <div className="w-20 h-20 bg-primary/15 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-background shadow-xl">
                  <Award className="h-10 w-10 text-primary" />
                </div>
                <h3 id={titleId} className="text-lg font-black text-foreground">
                  Certificado de finalización
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Curso completado exitosamente</p>
              </div>
            </div>

            {/* Cuerpo de la ventana */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Curso</p>
                <p className="text-lg font-bold text-foreground">{selectedCert.courseTitle}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Fecha de inicio</p>
                  <p className="text-sm font-bold text-foreground">{longDate(selectedCert.startedAt)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Fecha de finalización</p>
                  <p className="text-sm font-bold text-foreground">{longDate(selectedCert.completedAt)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Intensidad horaria</p>
                  <p className="text-sm font-bold text-foreground">{formatHours(selectedCert.hours)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Tu tiempo dedicado</p>
                  <p className="text-sm font-bold text-foreground">{formatTimeSpent(selectedCert.activeSeconds)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Calificación promedio</p>
                  <p className="text-sm font-bold text-foreground">{formatScore(selectedCert.averageScore)}</p>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/10 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Código de verificación</p>
                <p className="text-sm font-mono font-bold text-primary tracking-wide">
                  {selectedCert.verificationCode}
                </p>
              </div>
            </div>

            {/* Pie de la ventana */}
            <div className="px-6 pb-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const courseGuid = selectedCert.courseGuid;
                  closeDetails();
                  router.push(`/courses/${courseGuid}`);
                }}
                className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <BookOpen className="h-4 w-4" /> Ir al curso
              </button>
              <button
                type="button"
                onClick={() => {
                  void onDownload(selectedCert);
                  closeDetails();
                }}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" /> Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
