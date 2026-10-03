'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, Eye, EyeOff, Lock, Plus, Search } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import type { CourseEditor } from '@/lib/realtime/events';
import type { Course, CourseStatus } from '@/types/models';
import { COURSE_STATUS_LABEL } from '@/lib/labels';
import { USER_ROLE_LABEL } from '@/lib/labels';

interface Props {
  courses: Course[];
  isAdmin: boolean;
  /** Quién tiene tomado cada curso, para no abrir uno que ya se está editando. */
  coursesBeingEdited: Record<string, CourseEditor>;
  userGuid: string | undefined;
  onCreate: () => void;
  onOpen: (course: Course) => void;
}

type Filter = CourseStatus | 'all';

/** Listado de cursos con buscador y filtro por estado. */
export function CourseCatalog({ courses, isAdmin, coursesBeingEdited, userGuid, onCreate, onOpen }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Filter>('all');

  const visibleItems = useMemo(() => {
    const text = search.trim().toLowerCase();
    return courses.filter(
      (course) => course.title.toLowerCase().includes(text) && (status === 'all' || course.status === status),
    );
  }, [courses, search, status]);

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
        {isAdmin && (
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
          const busy = Boolean(editor) && editor.guid !== userGuid;

          return (
            <CourseCard key={course.guid} course={course} editor={busy ? editor : null} onOpen={() => onOpen(course)} />
          );
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

function CourseCard({ course, editor, onOpen }: { course: Course; editor: CourseEditor | null; onOpen: () => void }) {
  const isPublished = course.status === 'PUBLISHED';

  return (
    <div
      onClick={() => !editor && onOpen()}
      className={`bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm transition-all block relative ${
        editor
          ? 'opacity-50 grayscale cursor-not-allowed'
          : 'hover:shadow-md hover:border-primary/50 group cursor-pointer'
      }`}
    >
      {editor && (
        <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 rounded-2xl">
          <div className="bg-card/90 backdrop-blur-sm border border-border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Lock className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">En edición</p>
              <p className="text-[11px] text-muted-foreground">
                {USER_ROLE_LABEL[editor.role]}: {editor.name}
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
          {editor ? (
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

/** Aún no hay nada que listar: el administrador crea, el examinador espera asignación. */
export function NoCourses({ isAdmin, onCreate }: { isAdmin: boolean; onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-card rounded-2xl border border-border/50 shadow-sm border-dashed">
      <BookOpen className="h-16 w-16 text-muted-foreground/30 mb-6" />
      {isAdmin ? (
        <>
          <h3 className="text-xl font-bold text-foreground mb-2">No hay cursos creados</h3>
          <p className="text-muted-foreground mb-8 text-center max-w-sm">
            Comienza agregando tu primer curso a la plataforma para empezar a estructurar el conocimiento.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 py-4 rounded-xl shadow-md transition-transform hover:-translate-y-1"
          >
            <Plus className="h-5 w-5" /> Crear primer curso
          </button>
        </>
      ) : (
        <>
          <h3 className="text-xl font-bold text-foreground mb-2">Sin cursos asignados</h3>
          <p className="text-muted-foreground mb-4 text-center max-w-sm">
            Aún no tienes cursos asignados. Contacta con un administrador para que te asigne cursos para supervisar y
            editar.
          </p>
        </>
      )}
    </div>
  );
}
