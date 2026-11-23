'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, FileSignature, Inbox, Lock, RotateCcw } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { waitLabel } from '@/lib/dates';
import { AUTO_UNLOCK_HOURS, waitedTooLong } from '@/lib/grading';
import { COURSE_STATUS_LABEL } from '@/lib/labels';
import { plural } from '@/lib/text';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageLoader } from '@/components/ui/PageLoader';
import { useInFlight } from '@/hooks/useInFlight';
import { useReleaseAttempt } from '@/app/dashboard/examiner/hooks/useReleaseAttempt';
import {
  AGENDA_BUTTON,
  AgendaItem,
  AgendaList,
  AgendaSection,
  MiniRow,
  SidePanel,
  Tag,
  TodayHeader,
  TodayLayout,
} from '../agenda/AgendaParts';
import { useExaminerToday, type BlockedStudent, type ExaminerToday as Today } from './useExaminerToday';

/** Entregas que se listan en «Por revisar»; el resto, en la pantalla de calificación. */
const VISIBLE_PENDING = 8;

/** Bloqueados que se listan; el resto, en «Monitoreo de pruebas». */
const VISIBLE_BLOCKED = 5;

const GRADING = '/dashboard/examiner/grading';
const QUIZZES = '/dashboard/examiner/quizzes';
const MONITORING = '/dashboard/examiner/monitoring';

const fullName = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`.trim();
const blockedKey = (blocked: BlockedStudent) => `${blocked.student.guid}:${blocked.resourceGuid}`;

/**
 * «Hoy» del examinador: lo que espera por él —estudiantes bloqueados en un cuestionario y entregas
 * por calificar, primero lo que más espera— y cómo van sus cursos.
 */
export function ExaminerToday() {
  const { user } = useSession();
  const today = useExaminerToday();
  const release = useReleaseAttempt();
  const releasing = useInFlight<string>();

  if (!today.data) {
    return today.error ? (
      <LoadFailed message={today.error} onRetry={today.retry} />
    ) : (
      <PageLoader message="Cargando tu día…" />
    );
  }

  const data = today.data;
  const overdue = data.pending.filter((submission) => waitedTooLong(submission.submittedAt)).length;

  // Habilitar el intento lo saca de la lista; se vuelve a pedir el día para que las cifras cuadren.
  const onRelease = (blocked: BlockedStudent) =>
    releasing.run(blockedKey(blocked), async () => {
      const released = await release({
        resourceGuid: blocked.resourceGuid,
        student: blocked.student,
        score: blocked.lastScore,
      });
      if (released) await today.refresh();
    });

  return (
    <>
      <TodayHeader
        name={user?.firstName || 'examinador'}
        lead={<Lead total={data.pendingTotal} blocked={data.blocked.length} overdue={overdue} />}
      />
      <TodayLayout
        main={
          <>
            <AgendaSection title="Por revisar" aside="Primero lo que más espera">
              <PendingList data={data} onRelease={onRelease} isReleasing={(item) => releasing.has(blockedKey(item))} />
            </AgendaSection>
            <AgendaSection title="Avance de tus estudiantes" aside={`${data.students} en tus cursos`}>
              <AgendaList>
                <AgendaItem
                  marker="0–25 %"
                  urgent={data.lowProgress > 0}
                  state={data.lowProgress > 0 ? 'now' : 'idle'}
                  title={
                    data.lowProgress > 0
                      ? `${data.lowProgress} ${plural(data.lowProgress, 'estudiante va', 'estudiantes van')} por debajo del 25 %`
                      : 'Nadie va por debajo del 25 %'
                  }
                  detail="Según su avance en tus cursos"
                  actions={
                    <Link href={MONITORING} className={AGENDA_BUTTON.outline}>
                      Ver monitoreo
                    </Link>
                  }
                />
                <AgendaItem
                  marker={`+${data.inactiveDays} días`}
                  urgent={data.inactive > 0}
                  title={
                    data.inactive > 0
                      ? `${data.inactive} ${plural(data.inactive, 'estudiante lleva', 'estudiantes llevan')} más de ${data.inactiveDays} días sin entrar`
                      : `Todos entraron en los últimos ${data.inactiveDays} días`
                  }
                  detail="Con un curso en marcha en tus asignaciones"
                  actions={
                    <Link href={MONITORING} className={AGENDA_BUTTON.outline}>
                      Ver monitoreo
                    </Link>
                  }
                />
              </AgendaList>
            </AgendaSection>
          </>
        }
        side={
          <>
            <CoursesPanel data={data} />
            {data.quizzes.length > 0 && <QuizzesPanel data={data} />}
            <SignaturePanel ready={data.hasSignature} />
          </>
        }
      />
    </>
  );
}

function Lead({ total, blocked, overdue }: { total: number; blocked: number; overdue: number }) {
  if (total === 0 && blocked === 0) return <>No tienes nada pendiente. Buen trabajo.</>;

  const deliveries = total > 0 && (
    <>
      <b>{`${total} ${plural(total, 'entrega', 'entregas')}`}</b> por revisar
    </>
  );
  const waiting = blocked > 0 && (
    <>
      <b>{`${blocked} ${plural(blocked, 'estudiante', 'estudiantes')}`}</b> esperando otro intento en un cuestionario
    </>
  );

  return (
    <>
      Tienes {deliveries}
      {deliveries && waiting && ' y '}
      {waiting}
      {overdue === 1 && `; una entrega lleva más de ${AUTO_UNLOCK_HOURS} h y su estudiante ya avanza sin tu nota.`}
      {overdue > 1 &&
        `; ${overdue} entregas llevan más de ${AUTO_UNLOCK_HOURS} h y sus estudiantes ya avanzan sin tu nota.`}
      {overdue === 0 && '.'}
    </>
  );
}

function PendingList({
  data,
  onRelease,
  isReleasing,
}: {
  data: Today;
  onRelease: (blocked: BlockedStudent) => void;
  isReleasing: (blocked: BlockedStudent) => boolean;
}) {
  if (data.pending.length === 0 && data.blocked.length === 0) {
    return (
      <EmptyState
        className="py-10"
        icon={<Inbox className="h-10 w-10" />}
        title="No queda nada por revisar"
        description="Cuando un estudiante entregue una tarea o se quede sin intentos en un cuestionario, aparecerá aquí."
      />
    );
  }

  const blocked = data.blocked.slice(0, VISIBLE_BLOCKED);
  const hiddenBlocked = data.blocked.length - blocked.length;
  const shown = data.pending.slice(0, VISIBLE_PENDING);
  const hidden = data.pendingTotal - shown.length;

  return (
    <>
      <AgendaList>
        {/* Primero quien no puede seguir: sin otro intento, su curso está parado. */}
        {blocked.map((item, index) => (
          <AgendaItem
            key={blockedKey(item)}
            marker={waitLabel(item.lastAttemptAt)}
            urgent
            state={index === 0 ? 'now' : 'idle'}
            title={fullName(item.student)}
            detail={
              <>
                <span>
                  {`Agotó ${item.allowedAttempts === 1 ? 'el único intento' : `los ${item.allowedAttempts} intentos`} de «${item.quizTitle}» · ${item.courseTitle}`}
                </span>
                <Tag tone="danger">
                  <Lock /> No puede seguir
                </Tag>
              </>
            }
            actions={
              <button
                type="button"
                onClick={() => onRelease(item)}
                disabled={isReleasing(item)}
                className={AGENDA_BUTTON.primary}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Habilitar otro intento
              </button>
            }
          />
        ))}
        {shown.map((submission, index) => {
          const late = waitedTooLong(submission.submittedAt);
          const first = blocked.length === 0 && index === 0;
          return (
            <AgendaItem
              key={submission.guid}
              marker={waitLabel(submission.submittedAt)}
              urgent={late}
              state={first ? 'now' : 'idle'}
              title={fullName(submission.student)}
              detail={
                <>
                  <span>
                    {submission.assignmentTitle}
                    {submission.courseTitle ? ` · ${submission.courseTitle}` : ''}
                  </span>
                  {late && (
                    <Tag tone="danger">
                      <Clock /> Ya avanza sin tu nota
                    </Tag>
                  )}
                </>
              }
              actions={
                <Link
                  href={
                    submission.courseGuid ? `${GRADING}?course=${encodeURIComponent(submission.courseGuid)}` : GRADING
                  }
                  className={late || first ? AGENDA_BUTTON.primary : AGENDA_BUTTON.outline}
                >
                  Calificar
                </Link>
              }
            />
          );
        })}
      </AgendaList>
      {(hiddenBlocked > 0 || hidden > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {hiddenBlocked > 0 && (
            <Link href={QUIZZES} className={AGENDA_BUTTON.outline}>
              {`Ver ${hiddenBlocked} ${plural(hiddenBlocked, 'bloqueado más', 'bloqueados más')}`}
            </Link>
          )}
          {hidden > 0 && (
            <Link href={GRADING} className={AGENDA_BUTTON.outline}>
              {`Ver ${hidden} ${plural(hidden, 'entrega más', 'entregas más')}`}
            </Link>
          )}
        </div>
      )}
    </>
  );
}

function CoursesPanel({ data }: { data: Today }) {
  return (
    <SidePanel
      title="Tus cursos"
      aside={`${data.courses.length} ${plural(data.courses.length, 'asignado', 'asignados')}`}
    >
      {data.courses.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Aún no tienes cursos asignados.</p>
      ) : (
        data.courses.map((course) => {
          const pending = data.pendingByCourse[course.guid] ?? 0;
          return (
            <MiniRow
              key={course.guid}
              label={course.title}
              value={
                pending > 0 ? <Tag tone="warning">{`${pending} por calificar`}</Tag> : <Tag tone="success">Al día</Tag>
              }
              note={COURSE_STATUS_LABEL[course.status]}
            />
          );
        })
      )}
      <Link href="/dashboard/examiner/courses" className={`${AGENDA_BUTTON.outline} mt-4 w-full justify-center`}>
        Ver mis asignaciones
      </Link>
    </SidePanel>
  );
}

function QuizzesPanel({ data }: { data: Today }) {
  return (
    <SidePanel title="Cuestionarios" aside="% que aprueba">
      {data.quizzes.map((quiz) => {
        const percent = quiz.assessed > 0 ? Math.round((quiz.passedCount / quiz.assessed) * 100) : 0;
        return (
          <MiniRow
            key={quiz.courseGuid}
            label={quiz.title}
            value={quiz.assessed > 0 ? `${percent} %` : '—'}
            percent={percent}
            tone={percent >= 75 ? 'success' : 'warning'}
            note={`${quiz.assessed} ${plural(quiz.assessed, 'estudiante con intento', 'estudiantes con intento')}`}
          />
        );
      })}
    </SidePanel>
  );
}

function SignaturePanel({ ready }: { ready: boolean }) {
  return (
    <SidePanel title="Tu firma">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            ready
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-amber-500/12 text-amber-800 dark:text-amber-400'
          }`}
        >
          {ready ? <CheckCircle2 className="h-5 w-5" /> : <FileSignature className="h-5 w-5" />}
        </span>
        <p className="text-[13px] text-muted-foreground">
          {ready
            ? 'Lista: sale en los certificados de tus cursos.'
            : 'Aún no la has subido: los certificados de tus cursos la necesitan.'}
        </p>
      </div>
      {!ready && (
        <Link href="/dashboard/examiner/signature" className={`${AGENDA_BUTTON.primary} mt-4 w-full justify-center`}>
          Añadir mi firma
        </Link>
      )}
    </SidePanel>
  );
}
