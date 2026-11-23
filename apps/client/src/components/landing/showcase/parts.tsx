import type { CSSProperties, ReactNode } from 'react';
import { Bell, ChevronDown, GraduationCap } from 'lucide-react';

/**
 * Piezas comunes de la vitrina: dibujos de la interfaz del campus con datos de ejemplo. Su
 * tamaño sigue a la letra de la escena (`em`), que se ajusta al hueco disponible.
 */

/**
 * Dónde flota una pieza sobre su vista: `x` e `y` desde la esquina, `z` hacia quien mira y `turn`
 * su giro. `float` desfasa su vaivén para que no se muevan todas a la vez.
 */
export function placed({ x, y, z, turn, float }: { x: string; y: string; z: string; turn?: string; float?: string }) {
  return { '--sx': x, '--sy': y, '--sz': z, '--r': turn, '--f': float } as CSSProperties;
}

/** Un celular con la barra de estado; dentro, su pantalla. */
export function Phone({
  className = '',
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className={`phone ${className}`} style={style}>
      <div className="phone-screen">
        <span className="phone-notch" />
        <p className="phone-status">
          <span>9:41</span>
          <span className="phone-signal">
            <i />
            <i />
            <i />
          </span>
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * Barra superior del campus: la marca, las pestañas del papel —la abierta, en píldora oscura— y, a la
 * derecha, la sede, los avisos y la cuenta. Es la misma barra que lleva el campus.
 */
export function AppTopBar({
  platformName,
  site,
  tabs,
  more = false,
  initials,
}: {
  platformName: string;
  /** La sede, con su bandera. */
  site: ReactNode;
  tabs: { label: string; current?: boolean; count?: number }[];
  /** Si el papel tiene el menú «Más» con el resto de secciones. */
  more?: boolean;
  initials: string;
}) {
  return (
    <div className="app-top">
      <p className="app-brand">
        <span className="tile">
          <GraduationCap className="i" />
        </span>
        <span>{platformName}</span>
      </p>
      <p className="app-tabs">
        {tabs.map((tab) => (
          <span key={tab.label} className={tab.current ? 'on' : undefined}>
            {tab.label}
            {tab.count !== undefined && <em className="count">{tab.count}</em>}
          </span>
        ))}
        {more && (
          <span>
            Más
            <ChevronDown className="i" />
          </span>
        )}
      </p>
      <span className="app-pill">{site}</span>
      <span className="app-icon">
        <Bell className="i" />
      </span>
      <span className="avatar">{initials}</span>
    </div>
  );
}

/** Encabezado de «Hoy»: la fecha (o la sede), el saludo y una frase con lo importante. */
export function TodayHello({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: ReactNode }) {
  return (
    <div className="today-hello">
      <small>{eyebrow}</small>
      <b>{title}</b>
      <p>{lead}</p>
    </div>
  );
}

/** Título de una sección de la agenda, con su dato a la derecha. */
export function AgendaHead({ title, aside }: { title: string; aside: string }) {
  return (
    <p className="ag-head">
      <b>{title}</b>
      <small>{aside}</small>
    </p>
  );
}

/** Un paso de la agenda: lo que lo sitúa, el punto de su estado, el qué y lo que se puede hacer. */
export function AgendaRow({
  marker,
  state = 'idle',
  title,
  detail,
  action,
}: {
  marker: string;
  state?: 'now' | 'idle' | 'locked';
  title: string;
  detail: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className={`ag-row ${state}`}>
      <span className="ag-when">{marker}</span>
      <span className="ag-dot" />
      <span className="ag-what">
        <b>{title}</b>
        <small>{detail}</small>
      </span>
      {action ?? <span />}
    </li>
  );
}

/** Intensidad de cada día de «Tu semana» (0 sin estudio, 3 el que más) y cuál es hoy. */
export function StudyWeek({ levels, today }: { levels: number[]; today: number }) {
  const days = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  return (
    <ol className="week7">
      {days.map((day, index) => (
        <li key={day} className={`l${levels[index] ?? 0}${index === today ? ' is-today' : ''}`}>
          <i />
          {day}
        </li>
      ))}
    </ol>
  );
}
