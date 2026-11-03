'use client';

import { useState } from 'react';
import { ArrowRight, BadgeCheck, Layers, ListChecks, Star, type LucideIcon } from 'lucide-react';
import { QuizPhone } from './showcase/QuizPhone';
import { enterDelay } from './screens';

/** Piezas de la vitrina que una función de «Plataforma» puede destacar. */
export type Piece = 'builder' | 'quiz' | 'cert';

interface Feature {
  piece: Piece;
  icon: LucideIcon;
  title: string;
  text: string;
}

const FEATURES: readonly Feature[] = [
  {
    piece: 'builder',
    icon: Layers,
    title: 'Constructor de cursos',
    text: 'Módulos, recursos y evaluaciones organizados de forma visual, sin conocimientos técnicos.',
  },
  {
    piece: 'quiz',
    icon: ListChecks,
    title: 'Cuestionarios evaluados',
    text: 'Corrección automática en el servidor, control de intentos y límite de tiempo por examen.',
  },
  {
    piece: 'cert',
    icon: BadgeCheck,
    title: 'Certificados verificables',
    text: 'Cada certificado lleva un código con el que cualquier tercero puede comprobar su validez.',
  },
];

/**
 * Qué pieza de la vitrina se destaca. Pasar el puntero o el foco por una función la resalta
 * mientras están encima; un clic la deja fijada, y sólo eso cuenta como «pulsado».
 */
export function usePieceFocus() {
  const [hovered, setHovered] = useState<Piece | null>(null);
  const [pinned, setPinned] = useState<Piece | null>(null);
  return {
    focused: hovered ?? pinned,
    pinned,
    hover: setHovered,
    toggle: (piece: Piece) => setPinned((current) => (current === piece ? null : piece)),
  };
}

type PieceFocus = ReturnType<typeof usePieceFocus>;

/**
 * Las funciones de la plataforma. Desde 1100 px señalan su pieza en la vitrina; por debajo, sin
 * vitrina, son una lista y el celular del cuestionario va dentro de la pantalla.
 */
export function PlatformSection({
  wide,
  quizRunning,
  pieceFocus,
}: {
  wide: boolean;
  quizRunning: boolean;
  pieceFocus: PieceFocus;
}) {
  return (
    <section className="screen" id="plataforma" aria-labelledby="t-plataforma">
      <div className="wrap">
        <div className="column">
          <div className="split-head" data-enter style={enterDelay(0)}>
            <p className="badge">
              <Star className="i" />
              La plataforma
            </p>
            <h2 className="title" id="t-plataforma">
              Diseñada para <span className="text-primary">capacitar</span>
            </h2>
          </div>
          <ul className="features">
            {FEATURES.map((feature, index) => {
              const content = (
                <>
                  <span className="icon-tile icon-tile-sm">
                    <feature.icon className="i" />
                  </span>
                  <span>
                    <b>{feature.title}</b>
                    <span>{feature.text}</span>
                  </span>
                </>
              );
              return (
                <li key={feature.piece} data-enter style={enterDelay(1 + index)}>
                  {wide ? (
                    <button
                      className={`feature ${pieceFocus.focused === feature.piece ? 'is-on' : ''}`}
                      type="button"
                      aria-pressed={pieceFocus.pinned === feature.piece}
                      onPointerEnter={() => pieceFocus.hover(feature.piece)}
                      onPointerLeave={() => pieceFocus.hover(null)}
                      onFocus={() => pieceFocus.hover(feature.piece)}
                      onBlur={() => pieceFocus.hover(null)}
                      onClick={() => pieceFocus.toggle(feature.piece)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="feature">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {wide ? (
            <p className="try-hint" data-enter style={enterDelay(4)}>
              <ArrowRight className="i" />
              Toca una respuesta en el celular: así lo ve quien se capacita.
            </p>
          ) : (
            <div className="mobile-piece">
              <QuizPhone running={quizRunning} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
