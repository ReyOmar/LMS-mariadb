import type { ReactNode } from 'react';
import { ArrowRight, Check, Plug, Shield, X } from 'lucide-react';
import { AgendaHead, AgendaRow, AppTopBar, TodayHello, placed } from './parts';

/** Recursos completados y tareas entregadas por día de la semana, para las líneas de «Esta semana». */
const RESOURCES = [42, 55, 38, 61, 70, 66, 84];
const SUBMISSIONS = [9, 14, 11, 12, 18, 15, 21];

/** La serie dibujada en una caja de 100 × 30, con aire arriba y abajo. */
function sparkPath(values: number[]): string {
  const max = Math.max(...values);
  return values
    .map((value, index) => {
      const x = (index * 100) / (values.length - 1);
      const y = 27 - (value / max) * 24;
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function Kpi({ label, value, note, trend }: { label: string; value: ReactNode; note: string; trend?: string }) {
  return (
    <div className="kpi">
      <small>{label}</small>
      <b>{value}</b>
      <p>{note}</p>
      {trend && <p className="up">{trend}</p>}
    </div>
  );
}

function SparkRow({ title, note, values, color }: { title: string; note: string; values: number[]; color: string }) {
  const path = sparkPath(values);
  return (
    <div className="spark-row">
      <p>
        <b>{title}</b>
        <small>{note}</small>
      </p>
      <svg viewBox="0 0 100 30" aria-hidden="true">
        <path className="area" d={`${path} L100,30 L0,30 Z`} style={{ fill: color }} fillOpacity={0.14} />
        <path className="line" pathLength={1} d={path} fill="none" style={{ stroke: color }} strokeWidth="2.2" />
      </svg>
    </div>
  );
}

/** Una decisión pendiente: rechazar o aprobar, como en «Hoy» de la administración. */
const decide = (
  <span className="ag-btns">
    <span className="ag-ghost">
      <X className="i" />
      Rechazar
    </span>
    <span className="ag-go">
      <Check className="i" />
      Aprobar
    </span>
  </span>
);

/** «Hoy» de la sede, con las solicitudes y el sistema PESV al lado. Vista de «Funciones». */
export function SiteAdminView({
  platformName,
  site,
  siteName,
  infraction,
}: {
  platformName: string;
  site: ReactNode;
  siteName: string;
  infraction: string;
}) {
  return (
    <>
      <div className="app with-top">
        <AppTopBar
          platformName={platformName}
          site={site}
          initials="CA"
          more
          tabs={[
            { label: 'Hoy', current: true },
            { label: 'Cursos' },
            { label: 'Usuarios' },
            { label: 'Solicitudes', count: 8 },
            { label: 'Mensajes' },
          ]}
        />
        <div className="app-main hoy admin">
          <TodayHello
            eyebrow={`Sede ${siteName} · lunes, 26 de octubre`}
            title="Buenas tardes, Carolina."
            lead={
              <>
                <b>3 decisiones</b> te esperan hoy.
              </>
            }
          />
          <div className="kpis">
            <Kpi label="Usuarios" value="164" note="120 estudiantes · 32 examinadores" trend="+12 este mes" />
            <Kpi label="Cursos" value="86" note="64 publicados · 22 en borrador" />
            <Kpi label="Matrículas" value="128" note="Activas en la sede" trend="+9 esta semana" />
            <Kpi
              label="Calificación media"
              value={
                <>
                  78,7<em> /100</em>
                </>
              }
              note="Por debajo del umbral de 80"
            />
          </div>
          <div className="today-cols">
            <div>
              <AgendaHead title="Decisiones pendientes" aside="3 por resolver" />
              <ol className="ag-list">
                <AgendaRow marker="26 oct" title="Sofía Castaño" detail="Pide acceso como estudiante" action={decide} />
                <AgendaRow marker="25 oct" title="Andrés Mejía" detail="Pide acceso como examinador" action={decide} />
                <AgendaRow
                  marker="24 oct"
                  title="Valentina Ríos"
                  detail="Pide acceso como estudiante"
                  action={decide}
                />
              </ol>
            </div>
            <div className="app-card chart side-card">
              <p className="side-head">
                <b>Esta semana</b>
                <small>Por día</small>
              </p>
              <SparkRow
                title="416 recursos completados"
                note="El de más avance, el domingo"
                values={RESOURCES}
                color="hsl(var(--primary))"
              />
              <SparkRow
                title="100 tareas entregadas"
                note="Por calificar en «Entregas»"
                values={SUBMISSIONS}
                color="hsl(var(--accent))"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="sat sat-card floaty" style={placed({ x: '62%', y: '-8%', z: '110px', float: '-2s' })}>
        <p className="sat-head">
          <Shield className="i" />
          Solicitudes de acceso<em className="count">2</em>
        </p>
        <ul className="sat-rows">
          {[
            { initials: 'LP', name: 'Luis Pardo', role: 'Estudiante' },
            { initials: 'MR', name: 'Marta Ruiz', role: 'Examinadora' },
          ].map((person) => (
            <li key={person.name}>
              <span className="avatar sm">{person.initials}</span>
              <span>
                <b>{person.name}</b>
                <small>{person.role}</small>
              </span>
              <span className="mini-btn ok">
                <Check className="i" />
              </span>
              <span className="mini-btn">
                <X className="i" />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="sat sat-card floaty" style={placed({ x: '-6%', y: '68%', z: '130px', float: '-4s' })}>
        <p className="sat-head">
          <Plug className="i" />
          Sistema PESV de la empresa
        </p>
        <p className="sat-flow">
          <span className="chip-mini amber">{infraction}</span>
          <ArrowRight className="i" />
          <span className="chip-mini">Manejo defensivo</span>
        </p>
        <p className="sat-status">
          <span className="dot-ok" />
          Matriculado · aviso enviado
        </p>
      </div>
    </>
  );
}
