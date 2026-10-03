'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import type { MonitoredStudent } from '@/types/models';
import { textColor } from './progress-colors';
import { ProgressBar } from './ProgressBar';
import { ModuleBreakdown } from './ModuleBreakdown';

/** Cursos de un alumno al desplegar su fila; cada uno se abre para ver sus módulos. */
export function StudentCourses({ student }: { student: MonitoredStudent }) {
  const [openCourses, setOpenCourses] = useState<Set<string>>(new Set());

  const toggle = (courseGuid: string) =>
    setOpenCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseGuid)) next.delete(courseGuid);
      else next.add(courseGuid);
      return next;
    });

  return (
    <div className="space-y-2">
      {student.courses.map((course) => {
        const open = openCourses.has(course.courseGuid);
        return (
          <div
            key={course.courseGuid}
            className="border border-border/50 rounded-xl overflow-hidden bg-background shadow-sm"
          >
            <button
              aria-expanded={open}
              onClick={(event) => {
                event.stopPropagation();
                toggle(course.courseGuid);
              }}
              className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 hover:bg-muted/30 transition-colors text-left"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              <span className="font-bold text-sm flex-1 truncate">{course.courseTitle}</span>

              <span className="hidden md:inline text-[11px] text-muted-foreground font-medium shrink-0">
                {course.completedModules}/{course.totalModules} módulos
              </span>
              <span className="hidden md:inline text-[11px] text-muted-foreground font-medium shrink-0">
                {course.completed}/{course.totalResources} recursos
              </span>
              <div className="hidden sm:block w-36 shrink-0">
                <ProgressBar percent={course.percent} className="" />
              </div>
              <span className={`sm:hidden text-xs font-bold w-10 text-right ${textColor(course.percent)}`}>
                {course.percent}%
              </span>
            </button>

            {open && (
              <div className="border-t border-border/30 px-4 sm:px-5 py-3 sm:py-4 bg-muted/5 animate-in slide-in-from-top-1 duration-200">
                <ModuleBreakdown courseGuid={course.courseGuid} studentGuid={student.guid} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
