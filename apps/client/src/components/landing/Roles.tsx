import { BookCheck, ChartColumn, GraduationCap, Layers } from 'lucide-react';
import { enterDelay } from './screens';

/** Lo que hace cada papel en el campus. */
const ROLES = [
  {
    icon: ChartColumn,
    title: 'Administración de la sede',
    text: 'Arma los cursos por módulos, asigna cursos con cupo, revisa las solicitudes de acceso y ajusta la marca, la portada, los correos y los textos legales.',
  },
  {
    icon: BookCheck,
    title: 'Examinador',
    text: 'Califica las tareas o las devuelve con un comentario, sigue el avance de cada alumno y las pruebas en curso, y firma los certificados de sus cursos.',
  },
  {
    icon: GraduationCap,
    title: 'Conductor',
    text: 'Ve en su tablero el curso que sigue y su calendario, avanza módulo a módulo, presenta los cuestionarios y descarga sus certificados.',
  },
] as const;

export function Roles() {
  return (
    <section className="screen" id="servicios" aria-labelledby="t-servicios">
      <div className="wrap">
        <div className="column">
          <p className="badge" data-enter style={enterDelay(0)}>
            <Layers className="i" />
            Funciones
          </p>
          <h2 className="title" id="t-servicios" data-enter style={enterDelay(1)}>
            Cada papel, con su <span className="text-primary">propia vista</span>
          </h2>
          <p className="lead" data-enter style={enterDelay(2)}>
            La administración de la sede organiza, el examinador evalúa y el conductor se capacita.
          </p>
          <ul className="duty-stack">
            {ROLES.map((role, index) => (
              <li key={role.title} className="duty-row" data-enter style={enterDelay(3 + index)}>
                <span className="icon-tile icon-tile-sm">
                  <role.icon className="i" />
                </span>
                <div>
                  <h3>{role.title}</h3>
                  <p>{role.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
