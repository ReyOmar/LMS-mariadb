'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Award, BookOpen, Check, FileUp, Inbox, UserPlus, X, type LucideIcon } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useCountry } from '@/contexts/CountryContext';
import { useLiveData } from '@/hooks/useLiveData';
import { formatNumber } from '@/lib/country';
import { dayMonth, timeAgo } from '@/lib/dates';
import { formatScoreValue, MAX_SCORE } from '@/lib/grading';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { plural } from '@/lib/text';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/PageLoader';
import { useAccessRequests } from '@/app/dashboard/admin/access-requests/useAccessRequests';
import { RejectRequestDialog } from '@/app/dashboard/admin/access-requests/components/RejectRequestDialog';
import { INTEGRATION_CLIENT_EVENTS, fetchIntegrationClients } from '@/app/dashboard/admin/integrations/useIntegrations';
import type {
  AccessRequest,
  CountrySummary,
  DailyActivity,
  IntegrationClient,
  RecentEvent,
  UserRole,
} from '@/types/models';
import {
  AGENDA_BUTTON,
  AgendaItem,
  AgendaList,
  AgendaSection,
  KpiStrip,
  MiniRow,
  SidePanel,
  Sparkline,
  Tag,
  TodayHeader,
  TodayLayout,
} from '../agenda/AgendaParts';
import { averageLabel } from './average';
import { enrollmentDistribution } from './distribution';
import { useAdminDashboard } from './useAdminDashboard';

const INTEGRATIONS = '/dashboard/admin/integrations';

/** «Hoy» de la administración: las decisiones pendientes, las cifras de la sede y su semana. */
export function AdminToday() {
  const { user } = useSession();
  const { country } = useCountry();
  const { stats, loading } = useAdminDashboard();
  const access = useAccessRequests();
  const integrations = useLiveData(
    fetchIntegrationClients,
    'No se pudieron cargar los sistemas conectados.',
    INTEGRATION_CLIENT_EVENTS,
  );
  const [rejecting, setRejecting] = useState<AccessRequest | null>(null);

  if (loading || access.loading) return <PageLoader message="Cargando tu día…" />;

  const count = (value: number) => formatNumber(value, country);
  const failing = (integrations.data ?? []).filter((client) => client.noticeError);
  const decisions = access.requests.length + failing.length;

  return (
    <>
      <TodayHeader
        name={user?.firstName || 'administrador'}
        lead={
          decisions > 0 ? (
            <>
              <b>{`${decisions} ${plural(decisions, 'decisión te espera', 'decisiones te esperan')}`}</b> hoy.
            </>
          ) : (
            'No queda nada pendiente: la sede está al día.'
          )
        }
      />

      {stats && <Figures stats={stats} count={count} />}

      <TodayLayout
        main={
          <>
            <AgendaSection title="Decisiones pendientes" aside={`${decisions} por resolver`}>
              {decisions === 0 ? (
                <EmptyState
                  className="py-10"
                  icon={<Inbox className="h-10 w-10" />}
                  title="Todo resuelto"
                  description="Las solicitudes de acceso y los avisos de las integraciones aparecerán aquí."
                />
              ) : (
                <AgendaList>
                  {access.requests.map((request) => (
                    <AgendaItem
                      key={request.id}
                      marker={dayMonth(request.createdAt)}
                      title={`${request.firstName} ${request.lastName} pide acceso`}
                      detail={`${request.email} · como ${USER_ROLE_LABEL[request.requestedRole].toLowerCase()}`}
                      actions={
                        <>
                          <button
                            type="button"
                            onClick={() => setRejecting(request)}
                            disabled={access.isProcessing(request.id)}
                            className={AGENDA_BUTTON.outline}
                          >
                            <X className="h-3.5 w-3.5" /> Rechazar
                          </button>
                          <button
                            type="button"
                            onClick={() => void access.approve(request)}
                            disabled={access.isProcessing(request.id)}
                            className={AGENDA_BUTTON.primary}
                          >
                            <Check className="h-3.5 w-3.5" /> Aprobar
                          </button>
                        </>
                      }
                    />
                  ))}
                  {failing.map((client) => (
                    <AgendaItem
                      key={client.id}
                      marker={timeAgo(client.lastNoticeAt) ?? ''}
                      urgent
                      state="now"
                      title={`El último aviso a ${client.name} falló`}
                      detail={client.noticeError}
                      actions={
                        <Link href={INTEGRATIONS} className={AGENDA_BUTTON.outline}>
                          Ver integración
                        </Link>
                      }
                    />
                  ))}
                </AgendaList>
              )}
            </AgendaSection>

            {stats && <ThisWeek days={stats.weeklyActivity} count={count} />}
          </>
        }
        side={
          <>
            {stats && <EnrollmentsPanel stats={stats} count={count} />}
            {stats && <RecentEventsPanel events={stats.recentEvents} />}
            {integrations.data && integrations.data.length > 0 && <IntegrationsPanel clients={integrations.data} />}
          </>
        }
      />

      {rejecting && (
        <RejectRequestDialog
          request={rejecting}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => {
            void access.reject(rejecting, reason);
            setRejecting(null);
          }}
        />
      )}
    </>
  );
}

function Figures({ stats, count }: { stats: CountrySummary; count: (value: number) => string }) {
  const { country } = useCountry();
  return (
    <KpiStrip
      items={[
        {
          label: 'Usuarios',
          value: count(stats.users.total),
          detail: `${count(stats.users.students)} ${plural(stats.users.students, 'estudiante', 'estudiantes')} · ${count(stats.users.teachers)} ${plural(stats.users.teachers, 'examinador', 'examinadores')}`,
          trend: stats.users.newThisMonth > 0 ? `+${count(stats.users.newThisMonth)} este mes` : undefined,
        },
        {
          label: 'Cursos',
          value: count(stats.courses.total),
          detail: `${count(stats.courses.published)} ${plural(stats.courses.published, 'publicado', 'publicados')} · ${count(stats.courses.draft)} en borrador`,
        },
        {
          label: 'Matrículas',
          value: count(stats.totalEnrollments),
          detail: 'Activas en la sede',
          trend: stats.newEnrollments > 0 ? `+${count(stats.newEnrollments)} esta semana` : undefined,
        },
        {
          label: 'Calificación media',
          value:
            stats.overallAverage === null ? (
              '—'
            ) : (
              <>
                {formatScoreValue(stats.overallAverage, country)}
                <small className="ml-1 text-[15px] font-semibold tracking-normal text-muted-foreground">
                  / {MAX_SCORE}
                </small>
              </>
            ),
          detail: averageLabel(stats.overallAverage),
        },
      ]}
    />
  );
}

/** Nombre completo de cada día, para la frase: la API los manda cortos («Dom») para las gráficas. */
const DAY_NAMES: Record<string, string> = {
  Dom: 'domingo',
  Lun: 'lunes',
  Mar: 'martes',
  Mié: 'miércoles',
  Jue: 'jueves',
  Vie: 'viernes',
  Sáb: 'sábado',
};

/** El día de la semana con más de algo, con su nombre completo; `null` si la semana no tuvo nada. */
function busiestDay(days: DailyActivity[], pick: (day: DailyActivity) => number): string | null {
  const best = days.reduce<DailyActivity | null>((top, day) => (!top || pick(day) > pick(top) ? day : top), null);
  return best && pick(best) > 0 ? (DAY_NAMES[best.day] ?? best.day.toLowerCase()) : null;
}

function ThisWeek({ days, count }: { days: DailyActivity[]; count: (value: number) => string }) {
  const total = (pick: (day: DailyActivity) => number) => days.reduce((sum, day) => sum + pick(day), 0);
  const resources = total((day) => day.resources);
  const submissions = total((day) => day.submissions);
  const accounts = total((day) => day.users);
  const topDay = busiestDay(days, (day) => day.resources);
  const topAccountsDay = busiestDay(days, (day) => day.users);

  return (
    <AgendaSection title="Esta semana" aside="Por día, los últimos siete">
      <WeekRow
        title={`${count(resources)} ${plural(resources, 'recurso completado', 'recursos completados')}`}
        detail={topDay ? `El de más avance fue el ${topDay}` : 'Sin avance registrado esta semana'}
        values={days.map((day) => day.resources)}
        label="Recursos completados por día"
        className="text-primary"
      />
      <WeekRow
        title={`${count(submissions)} ${plural(submissions, 'tarea entregada', 'tareas entregadas')}`}
        detail="Las calificaciones están en «Calificación de entregas»"
        values={days.map((day) => day.submissions)}
        label="Tareas entregadas por día"
        className="text-amber-500"
      />
      <WeekRow
        title={`${count(accounts)} ${plural(accounts, 'cuenta nueva', 'cuentas nuevas')}`}
        detail={topAccountsDay ? `La mayoría, el ${topAccountsDay}` : 'Nadie se unió esta semana'}
        values={days.map((day) => day.users)}
        label="Cuentas nuevas por día"
        className="text-sky-600 dark:text-sky-400"
      />
    </AgendaSection>
  );
}

function WeekRow({
  title,
  detail,
  values,
  label,
  className,
}: {
  title: string;
  detail: string;
  values: number[];
  label: string;
  className: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[15px] font-bold">{title}</p>
        <p className="text-[13px] text-muted-foreground">{detail}</p>
      </div>
      <Sparkline values={values} label={label} className={className} />
    </div>
  );
}

function EnrollmentsPanel({ stats, count }: { stats: CountrySummary; count: (value: number) => string }) {
  const slices = enrollmentDistribution(stats.courseBreakdown, stats.totalEnrollments);
  const largest = Math.max(1, ...slices.map((slice) => slice.value));

  return (
    <SidePanel title="Matrículas por curso" aside={count(stats.totalEnrollments)}>
      {slices.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Aún no hay matrículas.</p>
      ) : (
        slices.map((slice) => (
          <MiniRow
            key={slice.key}
            label={slice.name}
            value={count(slice.value)}
            percent={Math.round((slice.value / largest) * 100)}
          />
        ))
      )}
    </SidePanel>
  );
}

const EVENT_ICON: Record<RecentEvent['type'], { icon: LucideIcon; tone: string }> = {
  certificate: { icon: Award, tone: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  enrollment: { icon: BookOpen, tone: 'bg-primary/10 text-primary' },
  submission: { icon: FileUp, tone: 'bg-amber-500/12 text-amber-700 dark:text-amber-400' },
  account: { icon: UserPlus, tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
};

/** Qué pasó, en una frase: la persona en negrita y lo demás en texto corrido. */
function EventText({ event }: { event: RecentEvent }) {
  const who = <b className="font-semibold text-foreground">{event.person}</b>;
  switch (event.type) {
    case 'certificate':
      return (
        <>
          {who} obtuvo el certificado de {event.subject}
        </>
      );
    case 'enrollment':
      return (
        <>
          {who} se matriculó en {event.subject}
        </>
      );
    case 'submission':
      return (
        <>
          {who} entregó «{event.subject}»
        </>
      );
    case 'account':
      return (
        <>
          {who} se unió como {(USER_ROLE_LABEL[event.subject as UserRole] ?? 'usuario').toLowerCase()}
        </>
      );
  }
}

/** Lo último que pasó en la sede durante la semana. Sale de lo que la base ya guarda con fecha. */
function RecentEventsPanel({ events }: { events: RecentEvent[] }) {
  return (
    <SidePanel title="Actividad reciente" aside="Últimos 7 días">
      {events.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Sin novedades esta semana.</p>
      ) : (
        <ul>
          {events.map((event, index) => {
            const { icon: Icon, tone } = EVENT_ICON[event.type];
            return (
              <li
                key={`${event.type}-${event.at}-${index}`}
                className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0 last:pb-0"
              >
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 text-[13px] leading-snug text-muted-foreground">
                  <p className="break-words">
                    <EventText event={event} />
                  </p>
                  <p className="mt-0.5 text-xs">{timeAgo(event.at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SidePanel>
  );
}

function IntegrationsPanel({ clients }: { clients: IntegrationClient[] }) {
  return (
    <SidePanel title="Integraciones" aside={`${clients.length} ${plural(clients.length, 'sistema', 'sistemas')}`}>
      {clients.map((client) => (
        <MiniRow
          key={client.id}
          label={client.name}
          value={
            client.noticeError ? (
              <Tag tone="danger">Aviso fallido</Tag>
            ) : client.keyPrefix ? (
              <Tag tone="success">Al día</Tag>
            ) : (
              <Tag tone="neutral">Sin clave</Tag>
            )
          }
          note={client.lastUsedAt ? `Última llamada: ${timeAgo(client.lastUsedAt)?.toLowerCase()}` : 'Aún sin llamadas'}
        />
      ))}
      <Link href={INTEGRATIONS} className={`${AGENDA_BUTTON.outline} mt-4 w-full justify-center`}>
        Ver integraciones
      </Link>
    </SidePanel>
  );
}
