import type { ReactNode } from 'react';
import { Award, Calendar, Clock, Download, Eye, Loader2, RotateCcw, ShieldCheck, Star } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { longDate } from '@/lib/dates';
import { formatScore } from '@/lib/grading';
import type { Certificate } from '@/types/models';
import { formatHours } from '../certificate-text';

interface Props {
  certificate: Certificate;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
}

export function CertificateCard({ certificate, downloading, onOpen, onDownload }: Props) {
  const { country } = useCountry();

  return (
    <article className="group h-full bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300">
      <div className="relative h-40 bg-gradient-to-br from-primary/10 via-primary/5 to-secondary/10 flex items-center justify-center overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-primary/60 to-secondary" />
        <div className="text-center z-10 px-6">
          <div className="w-14 h-14 bg-primary/15 rounded-full flex items-center justify-center mx-auto mb-3 ring-4 ring-background shadow-lg group-hover:scale-110 transition-transform duration-300">
            <Award className="h-7 w-7 text-primary" />
          </div>
          <p className="text-[10px] font-bold text-primary/70 uppercase tracking-[3px]">Certificado</p>
        </div>
      </div>

      <div className="p-5">
        <h3 className="font-bold text-base leading-tight mb-3 text-foreground group-hover:text-primary transition-colors line-clamp-2">
          {certificate.courseTitle}
        </h3>

        <ul className="space-y-2 mb-4 text-xs text-muted-foreground">
          <Detail icon={<Calendar className="h-3.5 w-3.5" />}>Completado el {longDate(certificate.completedAt)}</Detail>
          {/* Sólo se menciona la vuelta a partir de la segunda: la primera es lo normal. */}
          {certificate.attempt > 1 && (
            <Detail icon={<RotateCcw className="h-3.5 w-3.5" />}>
              {certificate.attempt}.ª vez que cursas este programa
            </Detail>
          )}
          <Detail icon={<Clock className="h-3.5 w-3.5" />}>{formatHours(certificate.hours)} de capacitación</Detail>
          {certificate.validUntil && (
            <Detail
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              className={certificate.unexpired ? '' : 'text-amber-700 dark:text-amber-400 font-bold'}
            >
              {certificate.unexpired ? 'Válido hasta' : 'Venció el'} {longDate(certificate.validUntil)}
            </Detail>
          )}
          {certificate.averageScore !== null && (
            <Detail icon={<Star className="h-3.5 w-3.5 text-amber-500" />}>
              Calificación promedio:{' '}
              <strong className="text-foreground">{formatScore(certificate.averageScore, country)}</strong>
            </Detail>
          )}
        </ul>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 font-bold text-xs py-2.5 rounded-xl transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Ver detalle
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloading ? 'Descargando…' : 'Descargar PDF'}
          </button>
        </div>
      </div>
    </article>
  );
}

function Detail({ icon, className = '', children }: { icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${className}`}>
      <span className="shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
}
