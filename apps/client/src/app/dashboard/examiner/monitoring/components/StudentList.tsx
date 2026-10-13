'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LastAccess } from '@/components/ui/LastAccess';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import type { MonitoredStudent } from '@/types/models';
import { ProgressBar } from './ProgressBar';
import { StudentCourses } from './StudentCourses';

interface Props {
  students: MonitoredStudent[];
  /** Con un curso elegido, el avance es el de ese curso y no la media de todos. */
  courseChosen: boolean;
}

/** Alumnos monitorizados: tarjetas en el móvil y tabla en escritorio; cada uno se despliega con sus cursos. */
export function StudentList({ students, courseChosen }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (guid: string) => setExpanded((current) => (current === guid ? null : guid));

  return (
    <>
      <div className="lg:hidden space-y-3">
        {students.map((student) => (
          <div key={student.guid} className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
            <div
              onClick={() => toggle(student.guid)}
              className="p-4 cursor-pointer active:bg-muted/10 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <ExpandButton student={student} open={expanded === student.guid} onToggle={toggle} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                </div>
                <SubmissionCount total={student.totalSubmissions} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <LastAccess guid={student.guid} date={student.lastAccessAt} />
                <div className="flex-1 max-w-[160px]">
                  <ProgressBar percent={student.progress} className="" />
                </div>
              </div>
            </div>
            {expanded === student.guid && (
              <div className="border-t border-border/30 px-4 py-4 bg-muted/5 animate-in fade-in duration-200">
                <StudentCourses student={student} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hidden lg:block bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/30 border-b border-border/50 uppercase text-xs font-bold text-muted-foreground">
            <tr>
              <th className="px-6 py-4 w-8">
                <span className="sr-only">Desplegar</span>
              </th>
              <th className="px-6 py-4">Estudiante</th>
              <th className="px-6 py-4">Correo</th>
              <th className="px-6 py-4">Última actividad</th>
              <th className="px-6 py-4">Entregas</th>
              <th className="px-6 py-4">Progreso {courseChosen && 'del curso'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {students.map((student) => (
              <Fragment key={student.guid}>
                <tr onClick={() => toggle(student.guid)} className="hover:bg-muted/10 transition-colors cursor-pointer">
                  <td className="pl-6 py-4">
                    <ExpandButton student={student} open={expanded === student.guid} onToggle={toggle} />
                  </td>
                  <td className="px-6 py-4 font-bold">
                    {student.firstName} {student.lastName}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{student.email}</td>
                  <td className="px-6 py-4">
                    <LastAccess guid={student.guid} date={student.lastAccessAt} />
                  </td>
                  <td className="px-6 py-4">
                    <SubmissionCount total={student.totalSubmissions} />
                  </td>
                  <td className="px-6 py-4">
                    <ProgressBar percent={student.progress} />
                  </td>
                </tr>
                {expanded === student.guid && (
                  <tr className="bg-muted/5 animate-in fade-in duration-200">
                    <td colSpan={6} className="px-10 py-4">
                      <StudentCourses student={student} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** La fila entera se despliega con el ratón; este botón lo hace accesible desde el teclado. */
function ExpandButton({
  student,
  open,
  onToggle,
}: {
  student: MonitoredStudent;
  open: boolean;
  onToggle: (guid: string) => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`Cursos de ${student.firstName} ${student.lastName}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(student.guid);
      }}
      className="shrink-0"
    >
      {open ? (
        <ChevronDown className="h-4 w-4 text-primary" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}

function SubmissionCount({ total }: { total: number }) {
  const { country } = useCountry();
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${total > 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}
    >
      {formatNumber(total, country)}
    </span>
  );
}
