import Link from 'next/link';
import { ArrowLeft, PanelLeft, PanelLeftClose } from 'lucide-react';
import { MY_COURSES } from '../useCourseContent';

export function CourseTopBar({
  title,
  syllabusOpen,
  onToggleSyllabus,
}: {
  title: string;
  syllabusOpen: boolean;
  onToggleSyllabus: () => void;
}) {
  const ToggleIcon = syllabusOpen ? PanelLeftClose : PanelLeft;

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50 h-14 flex items-center px-4 gap-3 shrink-0">
      <Link
        href={MY_COURSES}
        className="p-2 hover:bg-muted rounded-xl transition-colors"
        aria-label="Volver a mis cursos"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <button
        type="button"
        onClick={onToggleSyllabus}
        aria-expanded={syllabusOpen}
        aria-controls="course-syllabus"
        title={syllabusOpen ? 'Ocultar temario' : 'Mostrar temario'}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors border shadow-sm ${
          syllabusOpen
            ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:border-primary/30 hover:text-primary'
        }`}
      >
        <ToggleIcon className="h-5 w-5" />
        <span className="hidden sm:inline">{syllabusOpen ? 'Ocultar' : 'Temario'}</span>
      </button>
      <h1 className="flex-1 min-w-0 truncate font-bold text-base">{title}</h1>
    </header>
  );
}
