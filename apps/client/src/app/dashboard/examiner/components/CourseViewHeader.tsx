import type { ReactNode } from 'react';
import { ArrowLeft, type LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  onBack: () => void;
  /** Las tres cifras del curso. */
  children: ReactNode;
}

/** Cabecera de la vista de un curso: volver al directorio, su nombre y sus cifras. */
export function CourseViewHeader({ icon: Icon, title, onBack, children }: Props) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a los cursos
      </button>

      <header className="mb-8">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <Icon className="h-6 w-6 text-primary shrink-0" />
          {title}
        </h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">{children}</div>
      </header>
    </>
  );
}
