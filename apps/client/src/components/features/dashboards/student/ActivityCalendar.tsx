'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ActivityCalendarState } from './useActivityCalendar';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const DAY_NAMES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

/** El mes a la vista con hoy resaltado y un punto en los días en que el alumno estudió. */
export function ActivityCalendar({ calendar }: { calendar: ActivityCalendarState }) {
  const { year, month, daysInMonth, firstDayOfWeek, today, activeDays } = calendar;

  return (
    <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={calendar.previousMonth}
          aria-label="Mes anterior"
          className="tap-target inline-flex items-center justify-center p-1.5 hover:bg-muted rounded-lg transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <h3 className="font-bold text-sm">
          {MONTH_NAMES[month]} {year}
        </h3>
        <button
          type="button"
          onClick={calendar.nextMonth}
          aria-label="Mes siguiente"
          className="tap-target inline-flex items-center justify-center p-1.5 hover:bg-muted rounded-lg transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-[10px] font-bold text-muted-foreground uppercase py-1">
            {d}
          </div>
        ))}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = year === today.year && month === today.month && day === today.day;
          const isActive = activeDays.includes(day);
          return (
            <div
              key={day}
              className={`relative text-xs font-medium py-1.5 rounded-lg transition-colors ${
                isToday
                  ? 'bg-primary text-primary-foreground font-bold'
                  : isActive
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold'
                    : 'text-foreground hover:bg-muted/50'
              }`}
              title={isActive ? 'Día con actividad' : undefined}
            >
              {day}
              {isActive && (
                <span
                  className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${isToday ? 'bg-primary-foreground' : 'bg-emerald-500'}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
