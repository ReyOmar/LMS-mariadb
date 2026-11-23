'use client';

import Link from 'next/link';
import { Award, BookOpen, Clock, Lock, Play, Wrench, Zap } from 'lucide-react';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { longDate, studyTime } from '@/lib/dates';
import { formatScore } from '@/lib/grading';
import { displayTitle } from '@/lib/resources';
import { plural } from '@/lib/text';
import { resourceLabel } from '@/components/resources/ResourceTarget';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/PageLoader';
import type { Certificate, Course } from '@/types/models';
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
import { summarizeCourses, type CourseSummary } from './courses';
import type { NextStep } from './today';
import { useCourseSteps, useStudyWeek, type StudyDay } from './useStudentToday';
import { useStudentDashboard } from './useStudentDashboard';

/** «Hoy» del estudiante: lo que toca para avanzar en su curso, sus otros cursos y su semana. */
export function StudentToday() {
  const { user, courses, metrics, latestCertificate, loading } = useStudentDashboard();
  const summary = summarizeCourses(courses);
  const steps = useCourseSteps(summary.current);
  const week = useStudyWeek(user?.guid);

  if (loading) return <PageLoader message="Cargando tu día…" />;

  const others = courses.filter((course) => course.guid !== summary.current?.guid && !course.completedAt);

  return (
    <>
      <TodayHeader name={user?.firstName || 'estudiante'} lead={<Lead summary={summary} />} />
      <TodayLayout
        main={
          <>
            <AgendaSection
              title="Para hoy"
              aside={
                summary.current ? (
                  <CurrentCourse course={summary.current} percent={summary.progress.percent} />
                ) : undefined
              }
            >
              {summary.current ? (
                <Steps course={summary.current} steps={steps} />
              ) : (
                <EmptyState
                  className="py-10"
                  icon={<BookOpen className="h-10 w-10" />}
                  title={summary.allCompleted ? 'No te queda nada pendiente' : 'Nada que hacer por ahora'}
                  description={
                    summary.allCompleted
                      ? 'Terminaste todos tus cursos. Cuando te asignen uno nuevo, aparecerá aquí.'
                      : 'Cuando tu empresa te asigne un curso, aquí verás qué toca hacer cada día.'
                  }
                />
              )}
            </AgendaSection>

            {others.length > 0 && (
              <AgendaSection
                title="Tus otros cursos"
                aside={`${others.length} ${plural(others.length, 'pendiente', 'pendientes')}`}
              >
                <AgendaList>
                  {others.map((course) => (
                    <OtherCourse key={course.guid} course={course} />
                  ))}
                </AgendaList>
              </AgendaSection>
            )}
          </>
        }
        side={
          <>
            <WeekPanel
              days={week?.days ?? null}
              weekMinutes={week?.weekMinutes ?? 0}
              streak={week?.streak ?? 0}
              hours={metrics?.totalHoursSpent ?? 0}
            />
            {courses.length > 0 && <CoursesPanel courses={courses} />}
            {latestCertificate && <AchievementPanel certificate={latestCertificate} />}
          </>
        }
      />
    </>
  );
}

function Lead({ summary }: { summary: CourseSummary }) {
  const { current, progress, underMaintenance, allCompleted } = summary;
  if (current) {
    const remaining = Math.max(0, progress.total - progress.completed);
    if (remaining === 0) {
      return (
        <>
          Completaste <b>{current.title}</b>: el certificado se emite en cuanto se califiquen tus entregas.
        </>
      );
    }
    return (
      <>
        Te {plural(remaining, 'falta', 'faltan')} <b>{`${remaining} ${plural(remaining, 'recurso', 'recursos')}`}</b>{' '}
        para terminar <b>{current.title}</b> y obtener su certificado.
      </>
    );
  }
  if (allCompleted) return <>Terminaste todos tus cursos. Tus certificados están en «Mis certificados».</>;
  if (underMaintenance.length > 0) return <>Tus cursos están en mantenimiento por ahora. Tu avance se conserva.</>;
  return <>Todavía no tienes cursos asignados.</>;
}

/** Rótulo del tipo de recurso. Un enlace aún cerrado no deja ver adónde lleva. */
function kindOf(step: NextStep): string {
  if (step.state === 'locked' && step.resource.type === 'LINK') return 'Vídeo o enlace';
  const label = resourceLabel(step.resource).toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Steps({ course, steps }: { course: Course; steps: NextStep[] | null }) {
  const href = `/courses/${course.guid}`;

  if (steps === null) {
    return <p className="py-6 text-sm text-muted-foreground">Cargando los próximos pasos…</p>;
  }
  if (steps.length === 0) {
    return (
      <AgendaList>
        <AgendaItem
          state="now"
          title={course.title}
          detail="Entra al curso para seguir donde lo dejaste."
          actions={
            <Link href={href} className={AGENDA_BUTTON.primary}>
              <Play className="h-3.5 w-3.5" /> Entrar
            </Link>
          }
        />
      </AgendaList>
    );
  }

  return (
    <AgendaList>
      {steps.map((step) => (
        <AgendaItem
          key={step.resource.guid}
          marker={kindOf(step)}
          state={step.state}
          title={displayTitle(step.resource)}
          detail={
            step.state === 'locked' ? (
              <>
                <Lock /> Se abre al completar lo anterior
              </>
            ) : step.awaitingGrade ? (
              <>
                <Clock /> Entregada: esperando la nota
              </>
            ) : (
              step.moduleTitle
            )
          }
          actions={
            step.state === 'now' ? (
              <Link href={href} className={AGENDA_BUTTON.primary}>
                <Play className="h-3.5 w-3.5" /> Continuar
              </Link>
            ) : undefined
          }
        />
      ))}
    </AgendaList>
  );
}

function OtherCourse({ course }: { course: Course }) {
  const completed = course.completedResources ?? 0;
  const total = course.totalResources ?? 0;
  const percent = course.percent ?? 0;
  const paused = course.status !== 'PUBLISHED';

  return (
    <AgendaItem
      marker={`${completed} de ${total}`}
      state={paused ? 'locked' : 'idle'}
      title={course.title}
      detail={
        paused ? (
          <>
            <Wrench /> En mantenimiento; tu avance se conserva
          </>
        ) : percent > 0 ? (
          `En curso · ${percent} % completado`
        ) : (
          'Sin empezar'
        )
      }
      actions={
        paused ? (
          <Tag tone="info">En pausa</Tag>
        ) : (
          <Link href={`/courses/${course.guid}`} className={AGENDA_BUTTON.outline}>
            {percent > 0 ? 'Seguir' : 'Empezar'}
          </Link>
        )
      }
    />
  );
}

/** El curso de «Para hoy», con su duración declarada (la que acredita el certificado) y el avance. */
function CurrentCourse({ course, percent }: { course: Course; percent: number }) {
  return (
    <>
      {course.title}
      {course.durationHours ? ` · curso de ${course.durationHours} h` : ''} · {percent} %
    </>
  );
}

/** Tono de cada día según el tiempo de estudio: más tiempo, más intenso. */
const INTENSITY = ['bg-muted', 'bg-primary/35', 'bg-primary/65', 'bg-primary'] as const;

/** Lo que se lee de un día: su tiempo de estudio o, sin él, si hubo actividad. */
function dayDescription(day: StudyDay): string {
  if (day.future) return 'aún no llega';
  if (day.minutes > 0) return `${studyTime(day.minutes)} de estudio`;
  return day.studied ? 'con actividad' : 'sin estudio';
}

function WeekPanel({
  days,
  weekMinutes,
  streak,
  hours,
}: {
  days: StudyDay[] | null;
  weekMinutes: number;
  streak: number;
  hours: number;
}) {
  const { country } = useCountry();
  const total = formatNumber(Math.round(hours * 10) / 10, country);

  return (
    <SidePanel title="Tu semana" aside={days ? `${studyTime(weekMinutes)} esta semana` : undefined}>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="Tu estudio de esta semana, día a día">
        {days
          ? days.map((day) => (
              <li
                key={day.key}
                className="flex flex-col items-center gap-1.5 text-[11px] font-bold text-muted-foreground"
              >
                <span
                  className={`block aspect-square w-full rounded-[10px] transition-transform hover:scale-105 ${
                    day.future ? 'border border-dashed border-border' : INTENSITY[day.intensity]
                  } ${day.isToday ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card' : ''}`}
                  title={`${day.label}: ${dayDescription(day)}`}
                />
                <span className={day.isToday ? 'text-foreground' : ''}>{day.label}</span>
                <span className="sr-only">{dayDescription(day)}</span>
              </li>
            ))
          : // Mientras cargan, el hueco de los siete días: así el panel no salta al llegar.
            Array.from({ length: 7 }, (_, index) => (
              <li key={index} className="flex flex-col items-center gap-1.5" aria-hidden="true">
                <span className="block aspect-square w-full animate-pulse rounded-[10px] bg-muted" />
                <span className="h-[14px]" />
              </li>
            ))}
      </ol>
      <p className="mt-3.5 flex items-center gap-2.5 text-[13px] text-muted-foreground">
        <Zap className="h-4 w-4 shrink-0 text-primary" />
        <span>
          {streak >= 2 ? (
            <>
              <b className="text-foreground">{streak} días seguidos</b> estudiando.
            </>
          ) : streak === 1 ? (
            'Llevas un día de estudio: mañana puedes sumar otro.'
          ) : (
            'Un rato hoy basta para empezar una racha.'
          )}
        </span>
      </p>
      <p className="mt-1.5 pl-[26px] text-xs text-muted-foreground">En total, {total} h de estudio.</p>
    </SidePanel>
  );
}

function CoursesPanel({ courses }: { courses: Course[] }) {
  return (
    <SidePanel title="Tus cursos" aside={`${courses.length} ${plural(courses.length, 'asignado', 'asignados')}`}>
      {courses.map((course) => {
        const percent = course.completedAt ? 100 : (course.percent ?? 0);
        return (
          <MiniRow
            key={course.guid}
            label={course.title}
            value={`${percent} %`}
            percent={percent}
            tone={course.completedAt ? 'success' : course.status !== 'PUBLISHED' ? 'warning' : 'primary'}
          />
        );
      })}
      <Link href="/dashboard/student/courses" className={`${AGENDA_BUTTON.outline} mt-4 w-full justify-center`}>
        Ver mis cursos
      </Link>
    </SidePanel>
  );
}

function AchievementPanel({ certificate }: { certificate: Certificate }) {
  const { country } = useCountry();
  const score = certificate.averageScore !== null ? ` · nota ${formatScore(certificate.averageScore, country)}` : '';

  return (
    <SidePanel title="Último logro">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Award className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{certificate.courseTitle}</p>
          <p className="text-xs text-muted-foreground">
            Certificado{score} · {longDate(certificate.completedAt)}
          </p>
        </div>
      </div>
      <Link href="/dashboard/student/certificates" className={`${AGENDA_BUTTON.outline} mt-4 w-full justify-center`}>
        Ver mis certificados
      </Link>
    </SidePanel>
  );
}
