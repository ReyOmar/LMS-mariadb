import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

/** Título de una pantalla del examinador, con su explicación y, si la tiene, su acción principal. */
export function PageHeading({ icon: Icon, title, description, action }: Props) {
  return (
    <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2 sm:gap-3">
          <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">{description}</p>
      </div>
      {action}
    </header>
  );
}
