import { Award, BadgeCheck, BookOpen, Layers, Play } from 'lucide-react';
import { QuizPhone } from './QuizPhone';
import { placed } from './parts';

/**
 * La plataforma por dentro: el constructor de cursos, el cuestionario en el celular y el
 * certificado. Vista de «Plataforma»; la función que se señala a la izquierda destaca su pieza.
 */
export function PlatformView({ siteName, quizRunning }: { siteName: string; quizRunning: boolean }) {
  return (
    <>
      <article
        className="piece piece-builder"
        style={placed({ x: '-2%', y: '12%', z: '-70px', turn: '14deg' })}
        aria-label="Constructor de cursos"
      >
        <header className="piece-head">
          <span className="tile-em">
            <Layers className="i" />
          </span>
          <div>
            <p className="piece-kicker">Gestión de cursos</p>
            <p className="piece-title">Manejo defensivo</p>
          </div>
          <span className="status">Publicado</span>
        </header>
        <ol className="modules">
          <li>
            <span className="mod-num">1</span>
            <div>
              <b>Normativa de tránsito</b>
              <small>3 recursos · 40 min</small>
            </div>
          </li>
          <li className="open">
            <span className="mod-num">2</span>
            <div>
              <b>Conducción preventiva</b>
              <small>4 recursos · 1 h 10 min</small>
            </div>
            <ul className="resources">
              <li>
                <BookOpen className="i" />
                Lectura · Distancia de seguimiento
              </li>
              <li>
                <Play className="i" />
                Video · Frenado en vía mojada
              </li>
            </ul>
          </li>
          <li>
            <span className="mod-num">3</span>
            <div>
              <b>Evaluación final</b>
              <small>Cuestionario · 10 preguntas</small>
            </div>
          </li>
        </ol>
      </article>

      <QuizPhone running={quizRunning} style={placed({ x: '37%', y: '0%', z: '60px' })} />

      <article
        className="piece piece-cert"
        style={placed({ x: '67%', y: '8%', z: '-40px', turn: '-14deg' })}
        aria-label="Certificado"
      >
        <div className="cert-card">
          <span className="cert-seal">
            <Award className="i" />
          </span>
          <p className="cert-kicker">Certificado de aprobación</p>
          <p className="cert-name">Juana Ramírez Ortiz</p>
          <p className="cert-course">Manejo defensivo · 20 horas</p>
          <p className="cert-meta">
            <span>29 oct 2026</span>
            <span>Sede {siteName}</span>
          </p>
          <p className="cert-code">
            <BadgeCheck className="i" />
            <span>CERT-7C1E94A0B2-MHC4Q1ZK</span>
          </p>
        </div>
      </article>
    </>
  );
}
