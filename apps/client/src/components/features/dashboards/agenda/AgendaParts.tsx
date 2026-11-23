import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { greetingAt, todayHeading } from '@/lib/dates';
import { PageHeading } from '@/components/ui/PageHeading';

/**
 * Piezas de los tableros «Hoy». Cada tablero se lee como una agenda: lo que toca hacer, en
 * orden, con listas y líneas finas, y a un lado los paneles de consulta.
 */

/** Fecha del día, saludo y una frase con lo importante. */
export function TodayHeader({ name, lead }: { name: string; lead: ReactNode }) {
  return <PageHeading eyebrow={todayHeading()} title={`${greetingAt()}, ${name}.`} lead={lead} />;
}

/** Columna principal (la agenda) y columna lateral (los paneles); en el teléfono, una debajo de otra. */
export function TodayLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="mt-8 grid items-start gap-10 lg:mt-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-14">
      <div className="min-w-0 space-y-11">{main}</div>
      <aside className="min-w-0 space-y-4">{side}</aside>
    </div>
  );
}

export function AgendaSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {/* En el teléfono el dato de la sección va bajo el título: al lado no caben los dos. */}
      <header className="flex flex-col gap-1 border-b-2 border-foreground pb-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        {aside && <span className="text-[13px] font-semibold text-muted-foreground sm:text-right">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/**
 * Lista de la agenda. Es un contenedor de consultas: cada fila se ordena según el ancho de la lista,
 * no el de la pantalla, porque la misma lista ocupa todo el teléfono o una columna del ordenador.
 */
export function AgendaList({ children }: { children: ReactNode }) {
  return <ol className="@container">{children}</ol>;
}

export type AgendaState = 'now' | 'done' | 'locked' | 'idle';

const DOT: Record<AgendaState, string> = {
  now: 'h-4 w-4 border-primary bg-primary ring-[6px] ring-primary/15',
  done: 'h-[18px] w-[18px] border-emerald-600 bg-emerald-600 text-white',
  locked: 'h-3.5 w-3.5 border-border bg-card',
  idle: 'h-3.5 w-3.5 border-muted-foreground/40 bg-card',
};

/**
 * Un paso de la agenda: lo que lo sitúa (el tipo, la espera, la fecha), el punto que dice en qué
 * estado está, el qué y lo que se puede hacer. Con sitio de sobra va todo en una fila, como en el
 * diseño; en una lista mediana lo que lo sitúa sube encima del título; en una estrecha, como la
 * del teléfono, además las acciones bajan debajo.
 */
export function AgendaItem({
  marker,
  state = 'idle',
  urgent = false,
  title,
  detail,
  actions,
}: {
  marker?: ReactNode;
  state?: AgendaState;
  /** Lo que ya va tarde: el rótulo de la izquierda sale en rojo. */
  urgent?: boolean;
  title: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 border-b border-border py-4 @md:grid-cols-[20px_minmax(0,1fr)_auto] @md:gap-x-4 @2xl:grid-cols-[104px_20px_minmax(0,1fr)_auto] @2xl:items-center @2xl:py-[18px]">
      {marker && (
        <span
          className={`col-start-2 row-start-1 mb-1 text-xs font-bold tabular-nums @2xl:col-start-1 @2xl:mb-0 @2xl:text-[13px] ${
            urgent ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'
          }`}
        >
          {marker}
        </span>
      )}
      {/* El punto va a la altura de la primera línea del título; en la fila completa, centrado. */}
      <span
        className="col-start-1 row-start-2 flex h-6 items-center justify-center @2xl:col-start-2 @2xl:row-start-1 @2xl:h-auto"
        aria-hidden="true"
      >
        <span className={`flex items-center justify-center rounded-full border-2 ${DOT[state]}`}>
          {state === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
        </span>
      </span>
      <div className="col-start-2 row-start-2 min-w-0 @2xl:col-start-3 @2xl:row-start-1">
        <p
          className={`text-base font-bold tracking-tight ${
            state === 'locked'
              ? 'text-muted-foreground'
              : state === 'done'
                ? 'text-muted-foreground line-through decoration-muted-foreground/50'
                : 'text-foreground'
          }`}
        >
          {title}
        </p>
        {detail && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0">
            {detail}
          </p>
        )}
      </div>
      {actions && (
        <div className="col-start-2 row-start-3 mt-2.5 flex flex-wrap items-center gap-2 @md:col-start-3 @md:row-start-2 @md:mt-0 @md:justify-end @md:self-center @2xl:col-start-4 @2xl:row-start-1">
          {actions}
        </div>
      )}
    </li>
  );
}

/** Panel de consulta de la columna lateral. */
export function SidePanel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
      <h2 className="mb-3.5 flex items-center justify-between gap-2 text-[15px] font-extrabold">
        {title}
        {aside && <small className="text-xs font-semibold text-muted-foreground">{aside}</small>}
      </h2>
      {children}
    </section>
  );
}

const BAR_TONE = {
  primary: 'bg-primary',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
} as const;

/** Fila de un panel con su cifra y, si la hay, su barra (0–100). */
export function MiniRow({
  label,
  value,
  percent,
  tone = 'primary',
  note,
}: {
  label: ReactNode;
  value: ReactNode;
  percent?: number;
  tone?: keyof typeof BAR_TONE;
  note?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-border py-2.5 text-[13px] last:border-b-0 last:pb-0">
      <span className="truncate font-semibold">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
      {percent !== undefined && (
        <span className="col-span-2 block h-[5px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className={`block h-full rounded-full ${BAR_TONE[tone]}`}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </span>
      )}
      {note && <span className="col-span-2 text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

/**
 * Cifras de la sede en una sola franja, separadas por líneas finas. `trend` es la novedad del
 * periodo («+3 este mes»), en verde; sin novedades no se pinta.
 */
export function KpiStrip({
  items,
}: {
  items: { label: string; value: ReactNode; detail?: ReactNode; trend?: ReactNode }[];
}) {
  return (
    <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-3xl border border-border bg-card lg:mt-9 lg:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`min-w-0 px-4 py-4 sm:px-6 sm:py-5 ${index % 2 === 1 ? 'border-l border-border' : ''} ${
            index >= 2 ? 'border-t border-border lg:border-t-0' : ''
          } ${index === 2 ? 'lg:border-l' : ''}`}
        >
          <span className="block text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {item.label}
          </span>
          <b className="mt-1.5 block text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em] tabular-nums sm:text-[2.1rem]">
            {item.value}
          </b>
          {item.detail && <p className="mt-1 text-[13px] text-muted-foreground">{item.detail}</p>}
          {item.trend && (
            <p className="mt-0.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">{item.trend}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Serie corta (una semana) dibujada a escala, con el último punto marcado. */
export function Sparkline({ values, label, className }: { values: number[]; label: string; className: string }) {
  const width = 160;
  const height = 44;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => [
    values.length > 1 ? (index * width) / (values.length - 1) : width,
    height - 4 - ((height - 8) * value) / max,
  ]);
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points.at(-1) ?? [width, height];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-11 w-28 shrink-0 overflow-visible sm:w-40 ${className}`}
      role="img"
      aria-label={label}
    >
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill="currentColor" opacity={0.15} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3.5} fill="currentColor" />
    </svg>
  );
}

/** Botón o enlace de la agenda, en sus dos pesos: el paso que toca y los demás. */
export const AGENDA_BUTTON = {
  primary:
    'inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60',
  outline:
    'inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60',
} as const;

/** Etiqueta pequeña de estado dentro de la agenda o de un panel. */
export function Tag({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  children: ReactNode;
}) {
  const color = {
    success: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-400',
    warning: 'bg-amber-500/12 text-amber-800 dark:text-amber-400',
    danger: 'bg-red-500/10 text-red-700 dark:text-red-400',
    info: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    neutral: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${color}`}
    >
      {children}
    </span>
  );
}
