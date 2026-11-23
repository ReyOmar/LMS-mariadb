'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, Clock, Layers, UserRound } from 'lucide-react';
import api, { fileUrlFor } from '@/lib/api';
import { longDate } from '@/lib/dates';
import { matchesSearch, plural } from '@/lib/text';
import type { Course } from '@/types/models';
import { useLiveData } from '@/hooks/useLiveData';
import { PageLoader } from '@/components/ui/PageLoader';
import { PageHeading } from '@/components/ui/PageHeading';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';

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

type Filter = 'all' | 'pending' | 'completed';

const FILTERS: { id: Filter; label: string; matches: (course: Course) => boolean }[] = [
  { id: 'all', label: 'Todos', matches: () => true },
  { id: 'pending', label: 'Pendientes', matches: (course) => !course.completedAt },
  { id: 'completed', label: 'Completados', matches: (course) => Boolean(course.completedAt) },
];

export default function StudentCoursesPage() {
  const courses = useLiveData(fetchMyCourses, 'No se pudieron cargar tus cursos.', COURSE_EVENTS);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  if (courses.loading) return <PageLoader message="Cargando tus cursos…" />;

  const all = courses.data ?? [];
  const query = search.trim();
  const inFilter = FILTERS.find((option) => option.id === filter)?.matches ?? (() => true);
  const visible = all.filter((course) => inFilter(course) && matchesSearch(course.title, query));

  return (
    <>
      <PageHeading
        eyebrow="Área de aprendizaje"
        title="Mis cursos"
        lead="Los cursos que te asignó tu empresa. Tu avance se guarda solo, también si cambias de dispositivo."
      />

      {courses.error ? (
        <div className="mt-8">
          <LoadFailed message={courses.error} onRetry={courses.retry} />
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          className="mt-8 rounded-3xl border border-border/60 bg-card"
          icon={<BookOpen className="h-10 w-10" />}
          title="Sin cursos asignados"
          description="Cuando tu empresa te asigne un curso, aparecerá aquí."
        />
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div
              role="tablist"
              aria-label="Filtrar cursos"
              className="flex w-full gap-1 rounded-2xl border border-border bg-muted/60 p-1 sm:w-auto"
            >
              {FILTERS.map((option) => {
                const selected = option.id === filter;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setFilter(option.id)}
                    className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold transition-colors sm:flex-none ${
                      selected
                        ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {option.label}
                    <span className={`tabular-nums ${selected ? 'text-primary' : 'text-muted-foreground/70'}`}>
                      {all.filter(option.matches).length}
                    </span>
                  </button>
                );
              })}
            </div>
            <SearchInput
              value={search}
              onChange={setSearch}
              label="Buscar curso"
              className="w-full sm:ml-auto sm:w-72"
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState
              className="mt-6 rounded-3xl border border-border/60 bg-card"
              icon={<BookOpen className="h-10 w-10" />}
              title="Ningún curso coincide"
              description={query ? 'Prueba con otra palabra.' : 'No hay cursos en este apartado.'}
            />
          ) : (
            <ul className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((course, index) => (
                <li key={course.guid}>
                  <CourseCard course={course} tint={index} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** Tintes de la franja de portada cuando el curso no tiene imagen: variados, pero de la misma familia. */
const TINTS = [
  'bg-primary/12 text-primary',
  'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  'bg-amber-500/14 text-amber-700 dark:text-amber-400',
  'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  'bg-violet-500/12 text-violet-700 dark:text-violet-400',
  'bg-rose-500/12 text-rose-700 dark:text-rose-400',
];

type Status = { label: string; tone: string };

function statusOf(course: Course): Status {
  if (course.completedAt) return { label: 'Completado', tone: 'text-emerald-700 dark:text-emerald-400' };
  if (course.status !== 'PUBLISHED') return { label: 'Mantenimiento', tone: 'text-blue-700 dark:text-blue-400' };
  if ((course.percent ?? 0) === 0) return { label: 'Sin empezar', tone: 'text-muted-foreground' };
  return { label: 'En curso', tone: 'text-primary' };
}

/**
 * Un curso con su avance. Un curso sin publicar está en mantenimiento: se ve, pero no se puede
 * entrar; el avance se conserva para cuando vuelva.
 */
function CourseCard({ course, tint }: { course: Course; tint: number }) {
  const available = course.status === 'PUBLISHED';
  const card =
    'group flex h-full flex-col overflow-hidden rounded-[18px] border border-border/60 bg-card shadow-sm transition-all';

  if (!available) {
    return (
      <div className={`${card} cursor-not-allowed opacity-80`} aria-disabled="true">
        <CardContent course={course} tint={tint} />
      </div>
    );
  }

  return (
    <Link
      href={`/courses/${course.guid}`}
      className={`${card} hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg motion-reduce:hover:translate-y-0`}
    >
      <CardContent course={course} tint={tint} />
    </Link>
  );
}

function CardContent({ course, tint }: { course: Course; tint: number }) {
  const cover = fileUrlFor(course.coverImage);
  const status = statusOf(course);
  const completed = course.completedResources ?? 0;
  const total = course.totalResources ?? 0;
  const percent = course.completedAt ? 100 : (course.percent ?? 0);
  const modules = course._count?.modules;
  const teacher = course.teacher ? `${course.teacher.firstName} ${course.teacher.lastName}`.trim() : null;

  return (
    <>
      <div className={`relative h-28 shrink-0 overflow-hidden ${cover ? 'bg-muted' : TINTS[tint % TINTS.length]}`}>
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <span className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,transparent_0_18px,hsl(0_0%_100%/0.22)_18px_20px)] dark:opacity-30" />
            <BookOpen
              className="absolute bottom-3.5 right-4 h-11 w-11 opacity-80 transition-transform group-hover:scale-110"
              strokeWidth={1.5}
            />
          </>
        )}
        <span
          className={`absolute left-4 top-3.5 inline-flex h-6 items-center gap-1.5 rounded-full bg-card px-2.5 text-xs font-semibold shadow-sm ${status.tone}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" /> {status.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-[18px]">
        <h2 className="line-clamp-2 text-base font-bold leading-snug">{course.title}</h2>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
          {modules !== undefined && (
            <Meta icon={<Layers />}>{`${modules} ${plural(modules, 'módulo', 'módulos')}`}</Meta>
          )}
          {course.durationHours ? <Meta icon={<Clock />}>{`${course.durationHours} h`}</Meta> : null}
          {teacher && <Meta icon={<UserRound />}>{teacher}</Meta>}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {course.completedAt
            ? `Terminado el ${longDate(course.completedAt)}`
            : course.status !== 'PUBLISHED'
              ? 'En mantenimiento. Tu avance se conserva.'
              : `${completed} de ${total} ${plural(total, 'recurso completado', 'recursos completados')}`}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-1.5">
          <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className={`block h-full rounded-full ${course.completedAt ? 'bg-emerald-600' : course.status !== 'PUBLISHED' ? 'bg-amber-500' : 'bg-primary'}`}
              style={{ width: `${percent}%` }}
            />
          </span>
          <b className="text-[13px] tabular-nums">{percent} %</b>
        </div>
      </div>
    </>
  );
}

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 [&_svg]:h-[15px] [&_svg]:w-[15px]">
      {icon}
      {children}
    </span>
  );
}
