import type { CSSProperties } from 'react';
import { Award, Bell, BookOpen, Lock, MessageSquare, Play, Sun } from 'lucide-react';
import { Phone, StudyWeek } from './parts';

/** La barra inferior del campus en el teléfono; la primera, «Hoy», abierta. */
const TABS = [
  { icon: Sun, label: 'Hoy' },
  { icon: BookOpen, label: 'Cursos' },
  { icon: Award, label: 'Certificados' },
  { icon: MessageSquare, label: 'Mensajes' },
];

/**
 * «Hoy» de quien se capacita, en su celular: lo que toca, su semana y la barra inferior del campus.
 * Flota junto al de escritorio en la vitrina o, en pantallas estrechas, va dentro de la portada.
 */
export function StudentPhone({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <Phone className={className} style={style}>
      <div className="phone-body">
        <div className="phone-top">
          <p className="phone-hello">
            <small>Lunes, 26 de octubre</small>
            <b>Buenas tardes, Juana.</b>
          </p>
          <span className="bell">
            <Bell className="i" />
          </span>
        </div>
        <p className="phone-lead">
          Te faltan <b>3 recursos</b> para terminar <b>Manejo defensivo</b>.
        </p>
        <div>
          <p className="phone-label">Para hoy</p>
          <span className="row-bar">
            <i style={{ '--w': 0.75 } as CSSProperties} />
          </span>
        </div>
        <ol className="phone-agenda">
          <li className="ag-row now">
            <span className="ag-dot" />
            <span>
              <b>Conducción nocturna</b>
              <small>Vídeo · Módulo 4</small>
              <span className="ag-go">
                <Play className="i" />
                Continuar
              </span>
            </span>
          </li>
          <li className="ag-row locked">
            <span className="ag-dot" />
            <span>
              <b>Plan de viaje con lluvia</b>
              <small>
                <Lock className="i" />
                Se abre al completar lo anterior
              </small>
            </span>
          </li>
        </ol>
        <div>
          <p className="phone-label">Tu semana</p>
          <StudyWeek levels={[2, 3, 0, 1, 3, 0, 0]} today={0} />
        </div>
      </div>
      <nav className="phone-tabs">
        {TABS.map(({ icon: Icon, label }, index) => (
          <span key={label} className={index === 0 ? 'on' : undefined}>
            <i>
              <Icon className="i" />
            </i>
            <small>{label}</small>
          </span>
        ))}
      </nav>
    </Phone>
  );
}
