import type { CSSProperties, ReactNode } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Compass,
  GraduationCap,
  ListChecks,
  MessageSquare,
  Play,
} from 'lucide-react';
import { AppSidebar, Phone, placed } from './parts';

const WEEKDAYS = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
/** Octubre de 2026 empieza en jueves; hoy es el 29 y hay actividades en los días marcados. */
const MONTH = { leadingBlanks: 4, days: 31, today: 29, events: [23, 24, 27, 28] };

function Calendar() {
  return (
    <div className="app-card calendar">
      <p className="cal-head">
        <ChevronLeft className="i" />
        Octubre 2026
        <ChevronRight className="i" />
      </p>
      <div className="cal-grid">
        {WEEKDAYS.map((day) => (
          <span key={day} className="wd">
            {day}
          </span>
        ))}
        {Array.from({ length: MONTH.leadingBlanks }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: MONTH.days }, (_, index) => {
          const day = index + 1;
          const kind = day === MONTH.today ? 'today' : MONTH.events.includes(day) ? 'ev' : undefined;
          return (
            <span key={day} className={kind}>
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** El tablero de quien se capacita, con su celular al lado. Vista de la portada. */
export function StudentView({ platformName, site }: { platformName: string; site: ReactNode }) {
  return (
    <>
      <div className="app">
        <AppSidebar
          platformName={platformName}
          site={site}
          groups={[
            {
              title: 'Área de aprendizaje',
              links: [
                { icon: Compass, label: 'Mi tablero', current: true },
                { icon: BookOpen, label: 'Mis cursos' },
                { icon: Award, label: 'Mis certificados' },
                { icon: MessageSquare, label: 'Mensajes' },
              ],
            },
          ]}
          user={{ initials: 'JR', name: 'Juana Ramírez', role: 'En capacitación' }}
        />
        <div className="app-main">
          <p className="app-hello">
            <small>Hola,</small>
            <b>Juana Ramírez</b>
          </p>
          <div className="dash-top">
            <div className="next-course">
              <span className="tag">Tu próximo curso</span>
              <b>Manejo defensivo</b>
              <p>4 módulos · 9/12 recursos completados</p>
              <span className="go">
                <Play className="i" />
                Continuar curso
              </span>
              <svg className="ring" viewBox="0 0 80 80">
                <circle className="track" cx="40" cy="40" r="34" />
                <circle className="value" cx="40" cy="40" r="34" pathLength={100} />
                <text x="40" y="40">
                  75%
                </text>
              </svg>
            </div>
            <Calendar />
          </div>
          <div className="stats">
            <div className="app-card stat">
              <small>Tiempo de estudio</small>
              <b>
                12,5<em> h</em>
              </b>
              <Clock className="i" />
            </div>
            <div className="app-card stat">
              <small>Cursos completados</small>
              <b>3</b>
              <p>de 4 asignados</p>
              <GraduationCap className="i" />
            </div>
            <div className="app-card stat">
              <small>Cursos activos</small>
              <b>1</b>
              <p>Manejo defensivo</p>
              <BookOpen className="i" />
            </div>
          </div>
        </div>
      </div>

      <div className="sat floaty" style={placed({ x: '-5%', y: '7%', z: '90px', float: '-1s' })}>
        <span className="sat-icon ok">
          <CircleCheck className="i" />
        </span>
        <p>
          <b>Entrega calificada</b>
          <small>Inspección preoperacional · 92/100</small>
        </p>
      </div>

      <Phone className="floaty" style={placed({ x: '77%', y: '20%', z: '140px', float: '-3s' })}>
        <div className="phone-body">
          <div className="phone-top">
            <p className="phone-hello">
              <small>Hola,</small>
              <b>Juana</b>
            </p>
            <span className="bell">
              <Bell className="i" />
            </span>
          </div>
          <div className="mini-course">
            <span className="tag">Tu próximo curso</span>
            <b>Manejo defensivo</b>
            <span className="mini-bar">
              <i style={{ '--w': 0.75 } as CSSProperties} />
            </span>
            <small>9 de 12 recursos · 75 %</small>
          </div>
          <p className="phone-label">Esta semana</p>
          <ul className="mini-list">
            <li>
              <CircleCheck className="i ok" />
              Distancia de seguimiento<small>Hecho</small>
            </li>
            <li>
              <ListChecks className="i" />
              Evaluación final<small>Vie 30</small>
            </li>
          </ul>
        </div>
        <nav className="phone-tabs">
          <Compass className="i on" />
          <BookOpen className="i" />
          <Award className="i" />
          <MessageSquare className="i" />
        </nav>
      </Phone>
    </>
  );
}
