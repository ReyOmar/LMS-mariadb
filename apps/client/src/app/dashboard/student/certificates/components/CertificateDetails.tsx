'use client';

import Link from 'next/link';
import { Award, BookOpen, Download, X } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { useDialog } from '@/hooks/useDialog';
import { longDate } from '@/lib/dates';
import { formatScore } from '@/lib/grading';
import type { Certificate } from '@/types/models';
import { formatHours, formatTimeSpent } from '../certificate-text';

interface Props {
  certificate: Certificate;
  onClose: () => void;
  onDownload: () => void;
}

/** Ficha de un certificado: lo que acredita, lo que le llevó al alumno y su código de verificación. */
export function CertificateDetails({ certificate, onClose, onDownload }: Props) {
  const { country } = useCountry();
  const { dialogProps, titleId } = useDialog({ onClose });

  const facts = [
    { label: 'Fecha de inicio', value: longDate(certificate.startedAt) },
    { label: 'Fecha de finalización', value: longDate(certificate.completedAt) },
    { label: 'Intensidad horaria', value: formatHours(certificate.hours) },
    { label: 'Tu tiempo dedicado', value: formatTimeSpent(certificate.activeSeconds) },
    { label: 'Calificación promedio', value: formatScore(certificate.averageScore, country) },
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4"
      onClick={onClose}
    >
      <div
        {...dialogProps}
        onClick={(event) => event.stopPropagation()}
        className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-lg max-h-full overflow-y-auto animate-in zoom-in-95 duration-200"
      >
        <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10 p-8 text-center overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-primary/60 to-secondary" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 p-2 rounded-full bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="w-20 h-20 bg-primary/15 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-background shadow-xl">
            <Award className="h-10 w-10 text-primary" />
          </div>
          <h2 id={titleId} className="text-lg font-black text-foreground">
            Certificado de finalización
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Curso completado exitosamente</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Curso</p>
            <p className="text-lg font-bold text-foreground">{certificate.courseTitle}</p>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {facts.map((fact) => (
              <div key={fact.label} className="bg-muted/30 rounded-xl p-3">
                <dt className="text-xs text-muted-foreground mb-0.5">{fact.label}</dt>
                <dd className="text-sm font-bold text-foreground">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <div className="bg-primary/5 border border-primary/10 rounded-xl p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Código de verificación</p>
            <p className="text-sm font-mono font-bold text-primary tracking-wide break-all">
              {certificate.verificationCode}
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col sm:flex-row items-stretch gap-3">
          {/* Si el curso se eliminó, el certificado sigue valiendo pero ya no hay adónde ir. */}
          {certificate.courseGuid && (
            <Link
              href={`/courses/${certificate.courseGuid}`}
              className="flex-1 bg-muted hover:bg-border text-foreground font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <BookOpen className="h-4 w-4" /> Ir al curso
            </Link>
          )}
          <button
            type="button"
            onClick={onDownload}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
