import type { CSSProperties } from 'react';
import { Route } from 'lucide-react';
import { ROUTE_STEP_COUNT } from './useRouteSteps';
import { enterDelay } from './screens';

const STEPS = [
  {
    title: 'Matrícula',
    text: 'La empresa inscribe a su personal, o su sistema PESV lo pide al registrar una infracción.',
  },
  { title: 'Formación', text: 'Módulos, lecturas y videos, en el orden que define cada curso.' },
  { title: 'Evaluación', text: 'Cuestionarios corregidos en el servidor, con intentos y tiempo controlados.' },
  { title: 'Certificado', text: 'Al aprobar se emite solo, y cualquiera puede comprobarlo con su código.' },
] as const;

/**
 * De la matrícula al certificado. `reached` dice cuántos pasos van cumplidos; la línea los une
 * a medida que avanzan. `enrollment` es el ejemplo de matrícula de la sede.
 */
export function HowItWorks({ reached, enrollment }: { reached: number; enrollment: string }) {
  const line = { '--progress': Math.max(0, reached - 1) / (ROUTE_STEP_COUNT - 1) } as CSSProperties;

  return (
    <section className="screen" id="ruta" aria-labelledby="t-ruta">
      <div className="wrap">
        <div className="column">
          <div className="card route-card" data-enter style={enterDelay(0)}>
            <div className="split-head">
              <p className="badge">
                <Route className="i" />
                Cómo funciona
              </p>
              <h2 className="title" id="t-ruta">
                De la matrícula al <span className="text-primary">certificado</span>
              </h2>
            </div>
            <ol className="steps" style={line}>
              {STEPS.map((step, index) => (
                <li key={step.title} className={`step ${index < reached ? 'is-reached' : ''}`}>
                  <span className="step-num">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                    {index === 0 && (
                      <p className="step-example">
                        <Route className="i" />
                        <span>{enrollment}</span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
