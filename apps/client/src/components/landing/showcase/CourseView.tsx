import {
  Award,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheck,
  Layers,
  ListChecks,
  Lock,
  PanelLeft,
  Paperclip,
  Play,
  Route,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { placed } from './parts';

/** Recursos completados del curso de ejemplo según los pasos cumplidos del recorrido. */
function completedResources(reached: number): number {
  if (reached >= 3) return 12;
  return reached >= 2 ? 10 : 9;
}

function Resource({ icon: Icon, title, className }: { icon: LucideIcon; title: string; className?: string }) {
  return (
    <p className={`res ${className ?? ''}`}>
      <Icon className="i" />
      {title}
      <CircleCheck className="i tick" />
    </p>
  );
}

/**
 * El curso por dentro: el temario y una lectura. Avanza con los pasos del recorrido, que llegan
 * con sus piezas (la matrícula automática y el certificado). Vista de «Cómo funciona».
 */
export function CourseView({ reached, infraction }: { reached: number; infraction: string }) {
  return (
    <>
      <div className="app course">
        <div className="course-top">
          <ArrowLeft className="i" />
          <span className="hide">
            <PanelLeft className="i" />
            Ocultar
          </span>
          <b>Manejo defensivo</b>
          <span className="done">{completedResources(reached)} de 12 recursos</span>
        </div>
        <aside className="syllabus">
          <p className="app-label">
            <Layers className="i" />
            Temario del curso
          </p>
          <div className="mod">
            <p className="mod-title">
              <BookOpen className="i" />
              Normativa de tránsito
            </p>
            <Resource icon={Type} title="Código de tránsito" className="ok" />
            <Resource icon={Play} title="Señales preventivas" className="ok" />
          </div>
          <div className="mod">
            <p className="mod-title">
              <BookOpen className="i" />
              Conducción preventiva
            </p>
            <Resource icon={Type} title="Distancia de seguimiento" className="on res-current" />
            <Resource icon={Play} title="Frenado en vía mojada" />
          </div>
          <div className="mod locked mod-exam">
            <p className="mod-title">
              <Lock className="i i-lock" />
              <ListChecks className="i i-open" />
              Evaluación final
              <span className="exam-result">94/100</span>
            </p>
          </div>
        </aside>
        <div className="reading">
          <p className="kind">Lectura</p>
          <h4>Distancia de seguimiento</h4>
          <p className="app-card content">
            Deja al menos <b>tres segundos</b> entre tu vehículo y el de adelante: cuenta desde que pasa un punto fijo
            hasta que lo pasas tú. Con lluvia o de noche, el doble.
          </p>
          <div className="app-card attach">
            <span className="tile">
              <Paperclip className="i" />
            </span>
            <p>
              <b>guia-distancias.pdf</b>
              <small>Descargar documento</small>
            </p>
          </div>
          <span className="mark">
            <CircleCheck className="i" />
            Marcar como completado
          </span>
        </div>
      </div>

      <div className="sat sat-card sat-step sat-assigned" style={placed({ x: '50%', y: '-9%', z: '120px' })}>
        <p className="sat-head">
          <Route className="i" />
          Matrícula automática
        </p>
        <p className="sat-flow">
          <span className="chip-mini amber">{infraction}</span>
          <ArrowRight className="i" />
          <span className="chip-mini">Manejo defensivo</span>
        </p>
      </div>

      <div className="sat sat-step sat-issued" style={placed({ x: '52%', y: '76%', z: '150px' })}>
        <span className="sat-icon ok">
          <Award className="i" />
        </span>
        <p>
          <b>Certificado emitido</b>
          <small className="mono">CERT-7C1E94A0B2-MHC4Q1ZK</small>
        </p>
        <span className="mini-go">Ver</span>
      </div>
    </>
  );
}
