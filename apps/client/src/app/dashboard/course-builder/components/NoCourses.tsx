'use client';

import { BookOpen, Plus } from 'lucide-react';

/** El catálogo está vacío: se invita a crear el primer curso. */
export function NoCourses({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-card rounded-2xl border border-border/50 shadow-sm border-dashed py-16 px-6">
      <BookOpen className="h-16 w-16 text-muted-foreground/30 mb-6" />
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
    </div>
  );
}
