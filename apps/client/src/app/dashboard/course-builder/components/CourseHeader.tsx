'use client';

import { ArrowLeft, ChevronDown, Eye, EyeOff, Lock, Trash2 } from 'lucide-react';
import type { Course, CourseStatus } from '@/types/models';

interface Props {
  course: Course;
  /** Sólo un administrador borra cursos. */
  canDelete: boolean;
  /** Un curso publicado se consulta pero no se edita: hay alumnos avanzando por él. */
  readOnly: boolean;
  onBack: () => void;
  onChangeStatus: (status: CourseStatus) => void;
  onDelete: () => void;
}

/** Barra superior del curso abierto: volver, estado y borrado. */
export function CourseHeader({ course, canDelete, readOnly, onBack, onChangeStatus, onDelete }: Props) {
  const isPublished = course.status === 'PUBLISHED';
  const accent = isPublished ? 'text-emerald-500' : 'text-amber-500';

  return (
    <>
      <div className="bg-card border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 shadow-sm">
        {/* Con poco ancho, el estado y el borrado bajan de línea antes que cortar el título. */}
        <div className="flex items-center gap-3 min-w-[12rem] flex-1">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-muted rounded-full hover:bg-border transition-colors shrink-0"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1
            className="font-bold text-lg sm:text-2xl leading-tight text-foreground line-clamp-2 break-words"
            title={course.title}
          >
            {course.title}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <div className="relative">
            <select
              value={course.status}
              onChange={(e) => onChangeStatus(e.target.value as CourseStatus)}
              aria-label="Estado del curso"
              className={`appearance-none pl-8 sm:pl-10 pr-8 sm:pr-10 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest transition-all cursor-pointer border shadow-sm focus:outline-none focus:ring-4 ${
                isPublished
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 focus:ring-emerald-500/20'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 focus:ring-amber-500/20'
              }`}
            >
              <option value="DRAFT">Borrador</option>
              <option value="PUBLISHED">Publicado</option>
            </select>
            <div
              className={`absolute left-2.5 sm:left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${accent}`}
            >
              {isPublished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </div>
            <div
              className={`absolute right-2.5 sm:right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${accent}`}
            >
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>

          {canDelete && (
            <button
              type="button"
              disabled={readOnly}
              onClick={onDelete}
              className={`font-bold px-3 sm:px-6 py-2 sm:py-2.5 rounded-xl shadow-md transition-transform flex items-center gap-2 ${
                readOnly
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white hover:-translate-y-0.5'
              }`}
            >
              <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Eliminar curso</span>
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-3 flex items-center gap-3">
          <Lock className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
            Este curso está publicado. Cambia a estado Borrador para editar contenido.
          </p>
        </div>
      )}
    </>
  );
}
