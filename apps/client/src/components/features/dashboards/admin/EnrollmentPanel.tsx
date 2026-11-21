'use client';

import { BookOpen } from 'lucide-react';
import { Donut, COLOR, breakdownColor } from '@/components/ui/charts';
import { plural } from '@/lib/text';
import type { CountrySummary } from '@/types/models';
import { enrollmentDistribution, OTHERS_KEY } from './distribution';

/** El reparto de las matrículas de la sede por curso, con el total en el centro del anillo. */
export function EnrollmentPanel({
  courses,
  total,
  count,
}: {
  courses: CountrySummary['courseBreakdown'];
  total: number;
  count: (value: number) => string;
}) {
  // La API devuelve el reparto sin color; la presentación la pone el cliente.
  const slices = enrollmentDistribution(courses, total).map((slice, index) => ({
    ...slice,
    color: slice.key === OTHERS_KEY ? COLOR.empty : breakdownColor(index),
  }));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 p-6 shadow-sm bg-card/70 backdrop-blur-md stagger-6 animate-fade-slide-in">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] to-transparent pointer-events-none" />
      <div className="relative z-10">
        <h2 className="text-lg font-bold mb-1">Distribución por curso</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {count(total)} {plural(total, 'matrícula en total', 'matrículas en total')}
        </p>
        {slices.length > 0 ? (
          <>
            <div className="h-52 flex items-center justify-center relative">
              <Donut data={slices} legend={false} />
              {/* La cifra central va en HTML y no en el SVG: así hereda el tipo de
                  letra de la aplicación y se lee igual en ambos temas. */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-foreground">{count(total)}</span>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {plural(total, 'matrícula', 'matrículas')}
                </span>
              </div>
            </div>
            {/* Leyenda */}
            <div className="space-y-2 mt-4">
              {slices.map((course) => (
                <div
                  key={course.key}
                  className="flex items-center justify-between text-xs group/item hover:bg-muted/30 rounded-lg px-2 py-1 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: course.color }} />
                    <span className="font-medium text-foreground">{course.name}</span>
                  </div>
                  <span className="font-bold text-muted-foreground group-hover/item:text-foreground transition-colors">
                    {count(course.value)} <span className="font-normal">({course.percent}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BookOpen className="h-10 w-10 opacity-30 mb-3" />
            <p className="text-sm">Sin cursos publicados aún</p>
          </div>
        )}
      </div>
    </div>
  );
}
