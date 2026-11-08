import type { CSSProperties } from 'react';
import { Award, Bell, BookOpen, CircleCheck, Compass, ListChecks, MessageSquare } from 'lucide-react';
import { Phone } from './parts';

/**
 * El tablero de quien se capacita, en su celular. Flota junto al de escritorio en la vitrina o,
 * en pantallas estrechas, va dentro de la portada.
 */
export function StudentPhone({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <Phone className={className} style={style}>
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
  );
}
