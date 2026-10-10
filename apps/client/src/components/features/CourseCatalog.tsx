'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, Eye, EyeOff, Lock, Plus, Search } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { clickable } from '@/lib/clickable';
import { COURSE_STATUS_LABEL, USER_ROLE_LABEL } from '@/lib/labels';
import { matchesSearch } from '@/lib/text';
import type { CourseEditor } from '@/lib/realtime/events';
import { useRealtime } from '@/contexts/RealtimeContext';
import { useSession } from '@/contexts/SessionContext';
import type { Course, CourseStatus } from '@/types/models';

interface Props {
  courses: Course[];
  onOpen: (course: Course) => void;
  /** Sólo quien puede crear cursos ve la tarjeta para hacerlo. */
  onCreate?: () => void;
}

type Filter = CourseStatus | 'all';

/**
 * Cursos con buscador y filtro por estado. Es el catálogo del constructor y el tablero del
 * examinador: los dos abren un curso para editarlo, así que lo ven igual.
 *
 * Un curso que otra persona tiene abierto se muestra bloqueado, para que dos ediciones no se
 * pisen sin saberlo.
 */
export function CourseCatalog({ courses, onOpen, onCreate }: Props) {
  const { coursesBeingEdited } = useRealtime();
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Filter>('all');

  const visibleItems = useMemo(
    () =>
      courses.filter((course) => matchesSearch(course.title, search) && (status === 'all' || course.status === status)),
    [courses, search, status],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar curso por título..."
            aria-label="Buscar curso por título"
            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm"
          />
        </div>
        <div className="relative w-full sm:w-[200px]">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Filter)}
            aria-label="Filtrar por estado"
            className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
          >
            <option value="all">Todos los estados</option>
            <option value="PUBLISHED">Publicados</option>
            <option value="DRAFT">Borradores</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="min-h-[200px] border-2 border-dashed border-primary/50 bg-primary/5 rounded-2xl flex flex-col items-center justify-center hover:bg-primary/10 transition-colors group"
          >
            <Plus className="h-8 w-8 text-primary mb-2 group-hover:scale-125 transition-transform" />
            <span className="font-bold text-primary">Crear nuevo curso</span>
          </button>
        )}

        {visibleItems.map((course) => {
          const editor = coursesBeingEdited[course.guid];
          const lockedBy = editor && editor.guid !== user?.guid ? editor : null;

          return <CourseCard key={course.guid} course={course} lockedBy={lockedBy} onOpen={() => onOpen(course)} />;
        })}
      </div>

      {visibleItems.length === 0 && courses.length > 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Ningún curso coincide con la búsqueda. Prueba con otro título o cambia el filtro de estado.
        </p>
      )}
    </div>
  );
}

function CourseCard({
  course,
  lockedBy,
  onOpen,
}: {
  course: Course;
  /** Quién lo está editando ahora, si es otra persona. */
  lockedBy: CourseEditor | null;
  onOpen: () => void;
}) {
  const isPublished = course.status === 'PUBLISHED';

  return (
    <div
      {...clickable(() => {
        if (!lockedBy) onOpen();
      }, 'link')}
      aria-disabled={lockedBy ? true : undefined}
      className={`bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm transition-all block relative ${
        lockedBy
          ? 'opacity-50 grayscale cursor-not-allowed'
          : 'hover:shadow-md hover:border-primary/50 group cursor-pointer'
      }`}
    >
      {lockedBy && (
        <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 rounded-2xl">
          <div className="bg-card/90 backdrop-blur-sm border border-border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Lock className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">En edición</p>
              <p className="text-[11px] text-muted-foreground">
                {USER_ROLE_LABEL[lockedBy.role]}: {lockedBy.name}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="h-32 bg-primary/10 relative flex items-center justify-center overflow-hidden">
        {course.coverImage ? (
          <img
            src={fileUrlFor(course.coverImage) ?? ''}
            alt={course.title}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <BookOpen className="h-12 w-12 text-primary/30 group-hover:scale-110 transition-transform" />
        )}
        <div className="absolute inset-0 border-b border-border/30" />
      </div>

      <div className="p-5">
        <h2 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
          {course.title}
        </h2>
        <div className="flex justify-between items-center mt-6">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${
              isPublished
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            {isPublished ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {COURSE_STATUS_LABEL[course.status]}
          </div>
          {lockedBy ? (
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Bloqueado
            </span>
          ) : (
            <span className="text-sm font-semibold text-primary group-hover:translate-x-1 transition-transform flex items-center gap-1">
              Editar <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
