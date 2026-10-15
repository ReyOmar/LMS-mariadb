'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, TrendingUp } from 'lucide-react';
import api, { fileUrlFor } from '@/lib/api';
import type { Course } from '@/types/models';
import { useLiveData } from '@/hooks/useLiveData';
import { PageLoader } from '@/components/ui/PageLoader';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState } from '@/components/ui/EmptyState';

/** Cambios que alteran la lista: matrículas, el estado de un curso o el avance de la vuelta. */
const COURSE_EVENTS = [
  'course:updated',
  'course:deleted',
  'enrollment:changed',
  'submission:graded',
  'certificate:new',
] as const;

/** Cada curso trae ya el avance y la finalización de la vuelta actual. */
async function fetchMyCourses(): Promise<Course[]> {
  const { data } = await api.get<Course[]>('/courses');
  return data;
}

/** Etiqueta del pie de cada tarjeta. */
const BADGE =
  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm border';

export default function StudentCoursesPage() {
  const courses = useLiveData(fetchMyCourses, 'No se pudieron cargar tus cursos.', COURSE_EVENTS);

  if (courses.loading) return <PageLoader message="Cargando tus cursos…" />;

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Mis cursos
        </h1>
        <p className="text-muted-foreground mt-1">
          Estos son los cursos que te han sido asignados por tu administrador.
        </p>
      </header>

      {courses.error ? (
        <LoadFailed message={courses.error} onRetry={courses.retry} />
      ) : courses.data?.length === 0 ? (
        <EmptyState
          className="bg-card border border-border/50 rounded-2xl"
          icon={<BookOpen className="h-10 w-10" />}
          title="Sin cursos asignados"
          description="No tienes cursos activos en este momento. Contacta con tu administrador."
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.data?.map((course) => (
            <li key={course.guid}>
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Un curso sin publicar está en mantenimiento: se ve, pero no se puede entrar. */
function CourseCard({ course }: { course: Course }) {
  const card =
    'h-full bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm transition-all block relative';

  if (course.status !== 'PUBLISHED') {
    return (
      <div className={`${card} opacity-60 grayscale cursor-not-allowed`}>
        <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-[1px] flex items-center justify-center rounded-2xl">
          <div className="bg-card/90 border border-amber-500/30 shadow-lg rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </span>
            <span>
              <span className="block text-xs font-bold text-foreground">En mantenimiento</span>
              <span className="block text-[11px] text-muted-foreground">Vuelve más tarde</span>
            </span>
          </div>
        </div>
        <CardBody course={course}>
          <span className={`${BADGE} bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20`}>
            <AlertTriangle className="h-3 w-3" /> Mantenimiento
          </span>
        </CardBody>
      </div>
    );
  }

  return (
    <Link href={`/courses/${course.guid}`} className={`${card} group hover:shadow-md hover:border-primary/50`}>
      <CardBody course={course}>
        <ProgressBadge course={course} />
        <span className="text-sm font-semibold text-primary group-hover:translate-x-1 transition-transform flex items-center gap-1">
          Entrar <ArrowRight className="h-3 w-3" />
        </span>
      </CardBody>
    </Link>
  );
}

function CardBody({ course, children }: { course: Course; children: ReactNode }) {
  const cover = fileUrlFor(course.coverImage);

  return (
    <>
      <div className="h-32 bg-primary/10 flex items-center justify-center overflow-hidden border-b border-border/30">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <BookOpen className="h-12 w-12 text-primary/30 group-hover:scale-110 transition-transform" />
        )}
      </div>
      <div className="p-5">
        <h2 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
          {course.title}
        </h2>
        <div className="flex justify-between items-center gap-2 mt-6">{children}</div>
      </div>
    </>
  );
}

function ProgressBadge({ course }: { course: Course }) {
  if (course.completedAt) {
    return (
      <span className={`${BADGE} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20`}>
        <CheckCircle2 className="h-3 w-3" /> Completado
      </span>
    );
  }
  const percent = course.percent ?? 0;
  return (
    <span className={`${BADGE} bg-primary/10 text-primary border-primary/20`}>
      <TrendingUp className="h-3 w-3" /> {percent === 0 ? 'Sin empezar' : `${percent}% completado`}
    </span>
  );
}
