'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock, GraduationCap, Play } from 'lucide-react';
import { plural } from '@/lib/text';
import type { CourseSummary } from './courses';

/** La tarjeta principal del tablero: el curso que toca seguir o, si no hay ninguno, por qué. */
export function ContinueLearningCard({ summary }: { summary: CourseSummary }) {
  const { current, progress } = summary;

  return (
    <div className="lg:col-span-2 bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-8 text-primary-foreground shadow-lg flex flex-col md:flex-row gap-6 items-center justify-between relative overflow-hidden group">
      <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000" />

      <div className="flex-1 z-10">
        <CardMessage summary={summary} />
      </div>

      {current && <ProgressRing percent={progress.percent} />}
    </div>
  );
}

function CardMessage({ summary }: { summary: CourseSummary }) {
  const router = useRouter();
  const { current, progress, underMaintenance, allCompleted } = summary;

  if (current) {
    const moduleCount = current._count?.modules ?? 0;
    const started = progress.completed > 0;
    return (
      <>
        <span className="inline-block px-3 py-1 bg-primary-foreground/20 rounded-full text-xs font-semibold uppercase tracking-wider mb-4 border border-primary-foreground/10 text-primary-foreground/90 backdrop-blur-sm">
          {started ? 'Continuar aprendiendo' : 'Tu próximo curso'}
        </span>
        <h2 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">{current.title}</h2>
        <p className="text-primary-foreground/70 mb-6">
          {moduleCount} {plural(moduleCount, 'módulo', 'módulos')} · {progress.completed}/{progress.total}{' '}
          {plural(progress.total, 'recurso completado', 'recursos completados')}
        </p>
        <button
          type="button"
          onClick={() => router.push(`/courses/${current.guid}`)}
          className="flex items-center gap-2 bg-primary-foreground text-primary px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform shadow-md"
        >
          <Play className="h-4 w-4 fill-primary" /> {started ? 'Retomar curso' : 'Empezar curso'}
        </button>
      </>
    );
  }

  if (underMaintenance.length > 0 && !allCompleted) {
    return (
      <>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <AlertTriangle className="h-6 w-6" /> Curso en mantenimiento
        </h2>
        <p className="text-primary-foreground/70 mb-4">
          {underMaintenance.length === 1
            ? 'Tu curso activo está temporalmente en mantenimiento. Pronto tendrás acceso nuevamente.'
            : `Tus ${underMaintenance.length} cursos activos están temporalmente en mantenimiento. Pronto tendrás acceso nuevamente.`}
        </p>
        <div className="flex items-center gap-2 bg-primary-foreground/10 border border-primary-foreground/20 px-4 py-2.5 rounded-xl text-sm font-bold text-primary-foreground/80">
          <Clock className="h-4 w-4" /> Volverán a estar disponibles pronto
        </div>
      </>
    );
  }

  if (allCompleted) {
    return (
      <>
        <h2 className="text-2xl font-bold mb-2">🎉 ¡Todos tus cursos completados!</h2>
        <p className="text-primary-foreground/70 mb-4">
          Has finalizado todos los cursos asignados. Pronto tendrás nuevos cursos disponibles.
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/student/certificates')}
          className="flex items-center gap-2 bg-primary-foreground text-primary px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform shadow-md"
        >
          <GraduationCap className="h-4 w-4" /> Ver mis certificados
        </button>
      </>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-bold mb-2">Sin cursos asignados</h2>
      <p className="text-primary-foreground/70">Contacta con tu administrador para que te asigne cursos.</p>
    </>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  return (
    <div className="relative w-28 h-28 shrink-0 z-10 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" className="stroke-primary-foreground/20" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r="40"
          className="stroke-white"
          strokeWidth="8"
          fill="none"
          strokeDasharray="251.2"
          strokeDashoffset={251.2 * (1 - percent / 100)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-white">
        <span className="text-xl font-bold">{percent}%</span>
      </div>
    </div>
  );
}
