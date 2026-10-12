'use client';

import { useState } from 'react';
import { BookOpen, ChevronRight, Presentation } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { CourseStatusBadge } from '@/components/ui/CourseStatusBadge';
import { ROLE_STYLE } from '@/lib/role-style';
import {
  directoryCount,
  filterCourses,
  hasExaminer,
  type AssignableCourse,
  type AssignmentFilter,
} from '../assignment';

const FILTERS: { value: AssignmentFilter; label: string; activeTone: string }[] = [
  { value: 'all', label: 'Todos', activeTone: 'bg-muted text-foreground' },
  { value: 'assigned', label: 'Asignados', activeTone: ROLE_STYLE.TEACHER.tint },
  { value: 'unassigned', label: 'Sin asignar', activeTone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
];

interface Props {
  courses: AssignableCourse[];
  selectedGuid: string;
  onSelect: (guid: string) => void;
  /** Durante una matrícula en bloque no se cambia de curso: el progreso es del abierto. */
  locked: boolean;
  className: string;
}

export function CourseDirectory({ courses, selectedGuid, onSelect, locked, className }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AssignmentFilter>('all');
  const shown = filterCourses(courses, search, filter);

  return (
    <div
      className={`w-full lg:w-72 shrink-0 bg-card border border-border shadow-sm rounded-3xl flex-col overflow-hidden ${className}`}
    >
      <div className="p-5 border-b border-border/50 bg-muted/20">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> Directorio de cursos
        </h2>
        <p className="text-xs text-muted-foreground mt-1 mb-4">{directoryCount(shown.length, courses.length)}</p>

        <div className="space-y-3">
          <SearchInput value={search} onChange={setSearch} label="Buscar curso" />
          <div className="flex bg-background border border-border rounded-xl p-1 shadow-sm overflow-hidden">
            {FILTERS.map(({ value, label, activeTone }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all ${filter === value ? activeTone : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {shown.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">
              {courses.length === 0 ? 'Aún no hay cursos en esta sede' : 'No se encontraron cursos'}
            </p>
          </div>
        ) : (
          shown.map((course) => (
            <CourseCard
              key={course.guid}
              course={course}
              selected={course.guid === selectedGuid}
              disabled={locked}
              onSelect={() => onSelect(course.guid)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface CardProps {
  course: AssignableCourse;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function CourseCard({ course, selected, disabled, onSelect }: CardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-current={selected || undefined}
      className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 group flex flex-col gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
        selected
          ? 'bg-primary/10 border-primary shadow-sm'
          : 'bg-background border-border hover:border-primary/50 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`font-bold leading-tight ${selected ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}
        >
          {course.title}
        </h3>
        {selected && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
      </div>
      <div className="flex items-center justify-between mt-auto pt-2">
        <CourseStatusBadge status={course.status} className="text-[10px] uppercase px-2 py-0.5 rounded-full" />
        {hasExaminer(course) ? (
          <span className={`text-[10px] font-bold flex items-center gap-1 ${ROLE_STYLE.TEACHER.text}`}>
            <Presentation className="h-3 w-3" /> Asignado
          </span>
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">Sin examinador</span>
        )}
      </div>
    </button>
  );
}
