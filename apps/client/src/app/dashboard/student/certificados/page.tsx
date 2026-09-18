'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Award,
  Download,
  Eye,
  Calendar,
  Clock,
  Star,
  Loader2,
  GraduationCap,
  Sparkles,
  X,
  ExternalLink,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useRole } from '@/contexts/RoleContext';
import { useEventoRealtime } from '@/contexts/RealtimeContext';
import { useAlert } from '@/contexts/AlertContext';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import api, { mensajeDeError } from '@/lib/api';
import { formatearNota } from '@/lib/calificacion';

interface Certificate {
  guid: string;
  curso_guid: string;
  codigo_verificacion: string;
  archivo_pdf: string;
  fecha_inicio: string;
  fecha_completado: string;
  tiempo_total_horas: number;
  nota_promedio: number | null;
  curso: {
    titulo: string;
    imagen_portada: string | null;
  };
}

export default function CertificadosPage() {
  const { user } = useRole();
  const { showAlert, showToast } = useAlert();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [certificados, setCertificados] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [cursosPendientes, setCursosPendientes] = useState<
    { curso_titulo: string; tareas_pendientes: { titulo: string }[] }[]
  >([]);

  const fetchCertificados = useCallback(async () => {
    try {
      const res = await api.get('/certificados');
      setCertificados(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Error loading certificates:', err);
      showAlert.error(
        'Error al cargar certificados',
        'No se pudieron obtener tus certificados. Intenta de nuevo más tarde.',
      );
    } finally {
      setLoading(false);
    }

    // Also fetch pending courses (completed but awaiting grading)
    try {
      const cursosRes = await api.get('/cursos');
      const cursos = Array.isArray(cursosRes.data) ? cursosRes.data : [];
      const pending: { curso_titulo: string; tareas_pendientes: { titulo: string }[] }[] = [];
      for (const curso of cursos) {
        try {
          const verif = await api.get(`/certificados/finalizacion/${curso.guid}`);
          const data = verif.data;
          if (data.completo && !data.puede_certificarse && data.tareas_pendientes?.length > 0) {
            pending.push({
              curso_titulo: curso.titulo,
              tareas_pendientes: data.tareas_pendientes.map((t: any) => ({ titulo: t.titulo })),
            });
          }
        } catch {}
      }
      setCursosPendientes(pending);
    } catch {}
  }, [user?.guid]);

  useEffect(() => {
    if (!user?.guid) return;
    fetchCertificados();

  }, [user?.guid, fetchCertificados]);

  useEventoRealtime('certificate:new', () => fetchCertificados());
  useEventoRealtime('submission:graded', () => fetchCertificados());

  // Auto-open certificate from query param
  useEffect(() => {
    const openGuid = searchParams.get('open');
    if (openGuid && certificados.length > 0 && !selectedCert) {
      const cert = certificados.find((c) => c.guid === openGuid);
      if (cert) setSelectedCert(cert);
    }
  }, [searchParams, certificados, selectedCert]);

  const handleDownload = async (cert: Certificate) => {
    setDownloading(cert.guid);
    try {
      const response = await api.get(`/certificados/${cert.guid}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Certificado-${cert.curso.titulo.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast.success('El archivo PDF se ha descargado correctamente.');
    } catch (err: any) {
      console.error('Download error:', err);
      showAlert.error('Error al descargar', 'No se pudo descargar el certificado. Intenta de nuevo.');
    } finally {
      setDownloading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Award className="h-5 w-5 text-primary" />
          </div>
          Mis Certificados
        </h1>
        <p className="text-muted-foreground mt-2">
          Tus certificados de finalización de cursos. Descárgalos en formato PDF.
        </p>
      </header>

      {/* Stats Summary */}
      {!loading && certificados.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-in fade-in-0 duration-500">
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-foreground">{certificados.length}</p>
                <p className="text-xs text-muted-foreground font-medium">Certificados Obtenidos</p>
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
                  {certificados.reduce((sum, c) => sum + Number(c.tiempo_total_horas || 0), 0).toFixed(0)}h
                </p>
                <p className="text-xs text-muted-foreground font-medium">Horas de Capacitación</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                <Star className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-foreground">
                  {certificados.filter((c) => c.nota_promedio).length > 0
                    ? (
                        certificados.reduce((sum, c) => sum + Number(c.nota_promedio || 0), 0) /
                        certificados.filter((c) => c.nota_promedio).length
                      ).toFixed(1)
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground font-medium">Promedio General</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Grading Banner */}
      {!loading && cursosPendientes.length > 0 && (
        <div className="mb-8 animate-in fade-in-0 duration-500">
          {cursosPendientes.map((cp, idx) => (
            <div key={idx} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-sm text-foreground mb-1">{cp.curso_titulo} — Esperando calificación</h3>
                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                    Has completado todos los recursos de este curso, pero tu certificado se generará automáticamente
                    cuando el examinador califique las siguientes tareas:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cp.tareas_pendientes.map((t, ti) => (
                      <span
                        key={ti}
                        className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-medium px-2.5 py-1 rounded-lg"
                      >
                        <Clock className="h-3 w-3" /> {t.titulo}
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
      ) : certificados.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-16 text-center shadow-sm">
          <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Award className="h-12 w-12 text-primary/20" />
          </div>
          <h3 className="text-xl font-bold mb-3 text-foreground">Aún no tienes certificados</h3>
          <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
            Los certificados se generan automáticamente cuando completas <strong>todos los módulos</strong> de un curso.
            ¡Sigue avanzando en tus cursos activos!
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-primary/60 text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            <span>Tu próximo certificado está a punto de llegar</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certificados.map((cert, index) => (
            <div
              key={cert.guid}
              className="group bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300 animate-in fade-in-0 slide-in-from-bottom-2"
              style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
            >
              {/* Certificate Preview Card */}
              <div className="relative h-40 bg-gradient-to-br from-primary/10 via-primary/5 to-secondary/10 flex items-center justify-center overflow-hidden">
                {/* Decorative elements */}
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
                  {cert.curso.titulo}
                </h3>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    <span>Completado el {formatDate(cert.fecha_completado)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{Number(cert.tiempo_total_horas).toFixed(0)} horas de capacitación</span>
                  </div>
                  {cert.nota_promedio && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>
                        Calificación promedio:{' '}
                        <strong className="text-foreground">{formatearNota(cert.nota_promedio)}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedCert(cert)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 font-bold text-xs py-2.5 rounded-xl transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" /> Ver Detalle
                  </button>
                  <button
                    onClick={() => handleDownload(cert)}
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

      {/* Certificate Detail Modal */}
      {selectedCert && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => {
            setSelectedCert(null);
            if (searchParams.get('open')) {
              router.replace('/dashboard/student/certificados', { scroll: false });
            }
          }}
        >
          <div
            className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Certificate Preview */}
            <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10 p-8 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-primary/60 to-secondary" />
              <div className="absolute -top-16 -right-16 w-40 h-40 bg-primary/5 rounded-full" />
              <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-secondary/5 rounded-full" />

              <button
                onClick={() => {
                  setSelectedCert(null);
                  // Clear the ?open= query param to prevent the useEffect from re-opening
                  if (searchParams.get('open')) {
                    router.replace('/dashboard/student/certificados', { scroll: false });
                  }
                }}
                className="absolute top-4 right-4 p-2 rounded-full bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors z-10"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="relative z-10">
                <div className="w-20 h-20 bg-primary/15 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-background shadow-xl">
                  <Award className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-black text-foreground">Certificado de Finalización</h3>
                <p className="text-sm text-muted-foreground mt-1">Curso completado exitosamente</p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Curso</p>
                <p className="text-lg font-bold text-foreground">{selectedCert.curso.titulo}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Fecha de inicio</p>
                  <p className="text-sm font-bold text-foreground">{formatDate(selectedCert.fecha_inicio)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Fecha de finalización</p>
                  <p className="text-sm font-bold text-foreground">{formatDate(selectedCert.fecha_completado)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Duración</p>
                  <p className="text-sm font-bold text-foreground">
                    {Number(selectedCert.tiempo_total_horas).toFixed(0)} horas
                  </p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Calificación promedio</p>
                  <p className="text-sm font-bold text-foreground">
                    {formatearNota(selectedCert.nota_promedio)}
                  </p>
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/10 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Código de verificación</p>
                <p className="text-sm font-mono font-bold text-primary tracking-wide">
                  {selectedCert.codigo_verificacion}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-6 flex items-center gap-3">
              <button
                onClick={() => {
                  const cursoGuid = selectedCert.curso_guid;
                  setSelectedCert(null);
                  if (searchParams.get('open')) {
                    router.replace('/dashboard/student/certificados', { scroll: false });
                  }
                  router.push(`/cursos/${cursoGuid}`);
                }}
                className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <BookOpen className="h-4 w-4" /> Ir al Curso
              </button>
              <button
                onClick={() => {
                  handleDownload(selectedCert);
                  setSelectedCert(null);
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
