import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  BookCheck,
  BookOpen,
  Check,
  ClipboardList,
  FileSignature,
  Plug,
  Shield,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AppSidebar, placed } from './parts';

/** Las líneas de la actividad semanal: recursos completados y entregas. */
const RESOURCES_LINE =
  'M10,82 C33.3,82 33.3,59.5 56.7,59.5 C80,59.5 80,73 103.3,73 C126.7,73 126.7,37 150,37 C173.3,37 173.3,50.5 196.7,50.5 C220,50.5 220,19 243.3,19 C266.7,19 266.7,32.5 290,32.5';
const SUBMISSIONS_LINE =
  'M10,91 C33.3,91 33.3,82 56.7,82 C80,82 80,86.5 103.3,86.5 C126.7,86.5 126.7,68.5 150,68.5 C173.3,68.5 173.3,73 196.7,73 C220,73 220,59.5 243.3,59.5 C266.7,59.5 266.7,64 290,64';
const UNDER_LINE = ' L290,100 L10,100 Z';
const WEEK = ['Vie', 'Sáb', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue'];
const WEEK_X = [10, 50, 96, 143, 189, 236, 276];

/** Matrículas por curso: porción del anillo y dónde empieza. */
const ENROLLMENTS = [
  { color: 'hsl(var(--primary))', share: 33, offset: 25 },
  { color: 'hsl(var(--accent))', share: 23, offset: -9 },
  { color: 'hsl(var(--success))', share: 17, offset: -33 },
  { color: 'hsl(207 80% 52%)', share: 13, offset: -51 },
  { color: 'hsl(var(--muted-foreground) / .5)', share: 9, offset: -65 },
];

const legendDot = (color: string) => ({ '--dot': color }) as CSSProperties;

type StatProps = { label: string; value: ReactNode; note: string; warn?: boolean; icon: LucideIcon };

function Stat({ label, value, note, warn, icon: Icon }: StatProps) {
  return (
    <div className="app-card stat">
      <small>{label}</small>
      <b>{value}</b>
      <p className={warn ? 'warn' : undefined}>{note}</p>
      <Icon className="i" />
    </div>
  );
}

/** El panel de la sede, con las solicitudes y el sistema PESV al lado. Vista de «Funciones». */
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
      <div className="app">
        <AppSidebar
          platformName={platformName}
          site={site}
          groups={[
            { title: 'Visión general', links: [{ icon: BarChart3, label: 'Panel de la sede', current: true }] },
            {
              title: 'Formación',
              links: [
                { icon: BookOpen, label: 'Gestión de cursos' },
                { icon: ClipboardList, label: 'Asignación y matrículas' },
                { icon: BookCheck, label: 'Calificación de entregas' },
              ],
            },
            {
              title: 'Administración',
              links: [
                { icon: Users, label: 'Usuarios' },
                { icon: Shield, label: 'Solicitudes de acceso', count: 8 },
                { icon: FileSignature, label: 'Certificados' },
                { icon: Plug, label: 'Integraciones' },
              ],
            },
          ]}
        />
        <div className="app-main">
          <p className="app-hello">
            <small>Buenas tardes,</small>
            <b>Sede {siteName}</b>
          </p>
          <div className="stats four">
            <Stat label="Usuarios" value="164" note="120 estudiantes · 32 examinadores" icon={Users} />
            <Stat label="Cursos" value="86" note="64 publicados · 22 en borrador" icon={BookOpen} />
            <Stat label="Solicitudes" value="8" note="Requieren revisión" warn icon={Shield} />
            <Stat
              label="Calificación media"
              value={
                <>
                  78,7<em> /100</em>
                </>
              }
              note="En los cuestionarios"
              icon={Award}
            />
          </div>
          <div className="chart-row">
            <div className="app-card chart">
              <div className="chart-head">
                <p>
                  <b>Actividad semanal</b>
                  <br />
                  <small>Recursos completados y entregas, últimos 7 días</small>
                </p>
                <p className="legend">
                  <span style={legendDot('hsl(var(--primary))')}>Recursos</span>
                  <span style={legendDot('hsl(var(--accent))')}>Entregas</span>
                </p>
              </div>
              <svg viewBox="0 0 300 120" aria-hidden="true">
                <defs>
                  <linearGradient id="landing-fill-resources" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.28 }} />
                    <stop offset="1" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0 }} />
                  </linearGradient>
                  <linearGradient id="landing-fill-submissions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{ stopColor: 'hsl(var(--accent))', stopOpacity: 0.25 }} />
                    <stop offset="1" style={{ stopColor: 'hsl(var(--accent))', stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                {[10, 40, 70, 100].map((y) => (
                  <line key={y} className="grid-line" x1="10" y1={y} x2="290" y2={y} />
                ))}
                <path className="area" d={RESOURCES_LINE + UNDER_LINE} fill="url(#landing-fill-resources)" />
                <path className="area" d={SUBMISSIONS_LINE + UNDER_LINE} fill="url(#landing-fill-submissions)" />
                <path
                  className="line"
                  pathLength={1}
                  d={RESOURCES_LINE}
                  fill="none"
                  style={{ stroke: 'hsl(var(--primary))' }}
                  strokeWidth="2"
                />
                <path
                  className="line"
                  pathLength={1}
                  d={SUBMISSIONS_LINE}
                  fill="none"
                  style={{ stroke: 'hsl(var(--accent))' }}
                  strokeWidth="2"
                />
                <circle
                  cx="243.3"
                  cy="19"
                  r="3"
                  style={{ fill: 'hsl(var(--card))', stroke: 'hsl(var(--primary))' }}
                  strokeWidth="2"
                />
                {WEEK.map((day, index) => (
                  <text key={day} className="axis" x={WEEK_X[index]} y="115">
                    {day}
                  </text>
                ))}
              </svg>
            </div>
            <div className="app-card chart">
              <div className="chart-head">
                <p>
                  <b>Distribución por curso</b>
                  <br />
                  <small>Matrículas activas</small>
                </p>
              </div>
              <div className="donut-wrap">
                <svg className="donut" viewBox="0 0 42 42" aria-hidden="true">
                  {ENROLLMENTS.map((slice) => (
                    <circle
                      key={slice.color}
                      cx="21"
                      cy="21"
                      r="15.915"
                      pathLength={100}
                      style={{ stroke: slice.color }}
                      strokeDasharray={`${slice.share} ${100 - slice.share}`}
                      strokeDashoffset={slice.offset}
                    />
                  ))}
                  <text className="total" x="21" y="19.5">
                    128
                  </text>
                  <text className="unit" x="21" y="26">
                    matrículas
                  </text>
                </svg>
              </div>
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
