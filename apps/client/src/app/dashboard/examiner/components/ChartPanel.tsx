import type { ReactNode } from 'react';

interface Props {
  title: string;
  icon: ReactNode;
  /** Si se indica, se enseña en lugar de la gráfica. */
  emptyMessage?: string;
  children: ReactNode;
}

/** Marco de una gráfica con alto fijo, para que la página no salte mientras se carga. */
export function ChartPanel({ title, icon, emptyMessage, children }: Props) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
      <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
        {icon}
        {title}
      </h3>
      <div className="h-[220px] w-full">
        {emptyMessage ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm text-center">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
