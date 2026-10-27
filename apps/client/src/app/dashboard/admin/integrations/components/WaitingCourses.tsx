'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, Trash2 } from 'lucide-react';
import type { WaitingCourse, WaitingReason, WaitingRequest } from '@/types/models';
import { shortDate } from '@/lib/dates';
import { plural } from '@/lib/text';

/** Qué falta para que entren quienes esperan, dicho como lo que tiene que hacer el administrador. */
const NEXT_STEP: Record<WaitingReason, string> = {
  COURSE_NOT_FOUND: 'Ningún curso lleva este código. Ponlo en la ficha de un curso y publícalo.',
  COURSE_NOT_PUBLISHED: 'El curso con este código está en borrador: entrarán en cuanto lo publiques.',
  COURSE_FULL: 'El curso con este código no tiene plazas: amplía su cupo para que entren.',
};

interface Props {
  courses: WaitingCourse[];
  isBusy: (guid: string) => boolean;
  onDiscard: (course: WaitingCourse, request: WaitingRequest) => void;
}

/** Quienes esperan un curso que todavía no se puede ofrecer, agrupados por el código que pidieron. */
export function WaitingCourses({ courses, isBusy, onDiscard }: Props) {
  if (courses.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" /> Nadie espera un curso: todas las solicitudes
        están atendidas.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {courses.map((course) => (
        <li key={course.courseCode} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono font-bold text-sm bg-background border border-border rounded-lg px-2 py-0.5">
              {course.courseCode}
            </span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
              {course.requests.length} {plural(course.requests.length, 'persona en espera', 'personas en espera')}
            </span>
            {course.course && (
              <Link
                href={`/dashboard/course-builder?course=${course.course.guid}`}
                className="text-sm font-semibold text-primary hover:underline break-all"
              >
                {course.course.title}
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {course.reason ? NEXT_STEP[course.reason] : 'El curso ya las admite: entrarán en la siguiente pasada.'}
          </p>

          <ul className="divide-y divide-border/50 rounded-lg border border-border/50 bg-card">
            {course.requests.map((request) => (
              <li key={request.guid} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">
                    {request.firstName} {request.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{request.email}</p>
                </div>
                <p className="text-xs text-muted-foreground sm:text-right shrink-0">
                  <span className="flex items-center gap-1 sm:justify-end">
                    <Clock className="h-3 w-3" /> {shortDate(request.createdAt)}
                  </span>
                  <span className="block truncate max-w-[16rem]">
                    {request.system} · {request.externalId}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => onDiscard(course, request)}
                  disabled={isBusy(request.guid)}
                  className="self-start sm:self-center inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Descartar
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
