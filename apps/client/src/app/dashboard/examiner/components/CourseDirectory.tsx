'use client';

import { useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Search, type LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { matchesSearch } from '@/lib/text';
import { PageHeading } from './PageHeading';

interface Props<T> {
  icon: LucideIcon;
  title: string;
  description: string;
  courses: T[];
  /** Por qué no hay ningún curso que elegir. */
  noCoursesMessage: string;
  /** Cifras y gráficas de todos los cursos, encima del buscador. */
  overview: ReactNode;
  renderCard: (course: T) => ReactNode;
}

/** Primera vista de calificación y de pruebas: el resumen de todos los cursos y la rejilla para elegir uno. */
export function CourseDirectory<T extends { courseGuid: string; title: string }>({
  icon,
  title,
  description,
  courses,
  noCoursesMessage,
  overview,
  renderCard,
}: Props<T>) {
  const [search, setSearch] = useState('');
  const visibleCourses = courses.filter((course) => matchesSearch(course.title, search));

  return (
    <div className="animate-in fade-in duration-700">
      <PageHeading icon={icon} title={title} description={description} />

      {courses.length === 0 ? (
        <EmptyState
          className="bg-card border border-dashed border-border rounded-2xl"
          icon={<BookOpen className="h-10 w-10" />}
          title="No hay cursos asignados"
          description={noCoursesMessage}
        />
      ) : (
        <>
          {overview}

          <SearchInput value={search} onChange={setSearch} label="Buscar curso por nombre" className="max-w-lg mb-6" />

          {visibleCourses.length === 0 ? (
            <EmptyState
              className="bg-card border border-dashed border-border rounded-2xl"
              icon={<Search className="h-10 w-10" />}
              title="Sin cursos para mostrar"
              description="No se encontraron cursos que coincidan con la búsqueda."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {visibleCourses.map((course) => (
                <div key={course.courseGuid}>{renderCard(course)}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface CardProps {
  title: string;
  onOpen: () => void;
  children: ReactNode;
}

/** Tarjeta de un curso del directorio: entera es un botón que lo abre. */
export function DirectoryCard({ title, onOpen, children }: CardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full h-full text-left bg-card border border-border/50 hover:border-primary/50 hover:shadow-lg transition-all rounded-2xl p-6 flex flex-col relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <h3 className="font-bold text-lg mb-4 group-hover:text-primary transition-colors line-clamp-2 pr-10">{title}</h3>
      <span className="absolute top-6 right-6 p-2 bg-primary/10 text-primary rounded-xl group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        <ArrowRight className="h-4 w-4" />
      </span>
      <div className="mt-auto w-full">{children}</div>
    </button>
  );
}
