'use client';

import Link from 'next/link';
import { Clock, Sparkles, Trash2 } from 'lucide-react';
import type { Course, Infraction, WaitingReason, WaitingRequest } from '@/types/models';
import { shortDate } from '@/lib/dates';
import { plural } from '@/lib/text';
import { INPUT_CLASS } from '@/components/ui/FormFields';

/** Qué falta para que entren quienes esperan, dicho como lo que tiene que hacer el administrador. */
const NEXT_STEP: Record<WaitingReason, string> = {
  COURSE_NOT_ASSIGNED:
    'Elige el curso que atiende esta infracción, o publica uno que la nombre en su título: quienes esperan entrarán en el acto.',
  COURSE_NOT_PUBLISHED: 'Su curso no está publicado: entrarán en cuanto lo publiques.',
  COURSE_FULL: 'Su curso no tiene plazas: amplía su cupo para que entren.',
};

/** Un curso de la sede que se puede elegir para una infracción. */
export type CourseOption = Pick<Course, 'guid' | 'title' | 'status'>;

interface Props {
  infractions: Infraction[];
  courses: CourseOption[];
  isBusy: (key: string) => boolean;
  onAssign: (infraction: Infraction, course: CourseOption) => void;
  onDiscard: (infraction: Infraction, request: WaitingRequest) => void;
}

/**
 * Las infracciones que han llegado de otros sistemas, cada una con el curso que la atiende —elegido
 * por el campus según su título o por un administrador— y quién espera por ella. Llegan primero las
 * que tienen a alguien esperando.
 */
export function Infractions({ infractions, courses, isBusy, onAssign, onDiscard }: Props) {
  if (infractions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no ha llegado ninguna infracción. Cada una aparecerá aquí con la primera solicitud que la traiga: si un
        curso publicado la nombra en su título, la atenderá ese; si no, lo eliges tú.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {infractions.map((infraction) => (
        <li
          key={infraction.id}
          className={`rounded-xl border p-4 ${infraction.waiting.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/50'}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold text-sm bg-background border border-border rounded-lg px-2 py-0.5">
                  {infraction.code}
                </span>
                {infraction.course && infraction.autoAssigned && (
                  <span
                    title="El campus lo eligió porque su título nombra la infracción. Cámbialo si no es el adecuado."
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                  >
                    <Sparkles className="h-3 w-3" /> Curso elegido por su título
                  </span>
                )}
                {infraction.waiting.length > 0 && (
                  <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
                    {infraction.waiting.length}{' '}
                    {plural(infraction.waiting.length, 'persona en espera', 'personas en espera')}
                  </span>
                )}
              </p>
              {infraction.description && <p className="text-sm text-muted-foreground mt-1">{infraction.description}</p>}
            </div>
            <CourseChoice
              infraction={infraction}
              courses={courses}
              busy={isBusy(`infraction-${infraction.id}`)}
              onAssign={onAssign}
            />
          </div>

          {infraction.waiting.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground my-3">
                {infraction.reason
                  ? NEXT_STEP[infraction.reason]
                  : 'El curso ya las admite: entrarán en la siguiente pasada.'}
                {infraction.course && infraction.reason && infraction.reason !== 'COURSE_NOT_ASSIGNED' && (
                  <>
                    {' '}
                    <Link
                      href={`/dashboard/course-builder?course=${infraction.course.guid}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      Abrir el curso
                    </Link>
                  </>
                )}
              </p>
              <WaitingList requests={infraction.waiting} isBusy={isBusy} onDiscard={(r) => onDiscard(infraction, r)} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** El curso que atiende la infracción. Elegir otro lo cambia para las solicitudes que lleguen y las que esperan. */
function CourseChoice({
  infraction,
  courses,
  busy,
  onAssign,
}: {
  infraction: Infraction;
  courses: CourseOption[];
  busy: boolean;
  onAssign: Props['onAssign'];
}) {
  return (
    <select
      value={infraction.course?.guid ?? ''}
      disabled={busy}
      aria-label={`Curso de la infracción ${infraction.code}`}
      onChange={(event) => {
        const course = courses.find((option) => option.guid === event.target.value);
        if (course) onAssign(infraction, course);
      }}
      className={`${INPUT_CLASS} sm:w-72 shrink-0`}
    >
      {!infraction.course && <option value="">Elige el curso…</option>}
      {courses.map((course) => (
        <option key={course.guid} value={course.guid}>
          {course.title}
          {course.status !== 'PUBLISHED' && ' (sin publicar)'}
        </option>
      ))}
    </select>
  );
}

function WaitingList({
  requests,
  isBusy,
  onDiscard,
}: {
  requests: WaitingRequest[];
  isBusy: (key: string) => boolean;
  onDiscard: (request: WaitingRequest) => void;
}) {
  return (
    <ul className="divide-y divide-border/50 rounded-lg border border-border/50 bg-card">
      {requests.map((request) => (
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
            onClick={() => onDiscard(request)}
            disabled={isBusy(request.guid)}
            aria-label={`Descartar la solicitud de ${request.firstName} ${request.lastName}`}
            className="self-start sm:self-center inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Descartar
          </button>
        </li>
      ))}
    </ul>
  );
}
