'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Clock } from 'lucide-react';
import { Phone } from './parts';

const ANSWERS = ['Curva peligrosa a la derecha', 'Desvío obligatorio a la derecha', 'Incorporación de tránsito'];
const TIME_LEFT_S = 9 * 60 + 12;

/** El reloj del cuestionario: descuenta sólo mientras su pantalla está a la vista. */
function useQuizClock(running: boolean): string {
  const [seconds, setSeconds] = useState(TIME_LEFT_S);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setSeconds((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/**
 * El cuestionario tal como lo ve quien se capacita, en su celular. Se puede contestar: una
 * respuesta por pregunta. Va en la vitrina o, en pantallas estrechas, dentro de «Plataforma».
 */
export function QuizPhone({ running, style }: { running: boolean; style?: CSSProperties }) {
  const [answer, setAnswer] = useState<number | null>(null);
  const clock = useQuizClock(running);

  return (
    <Phone className="piece piece-quiz" style={style}>
      <div className="phone-body quiz-body">
        <p className="quiz-bar">
          <span>Pregunta 3 de 10</span>
          <span className="timer">
            <Clock className="i" />
            <span>{clock}</span>
          </span>
        </p>
        <span className="quiz-track">
          <span />
        </span>
        <span
          className="road-sign"
          role="img"
          aria-label="Señal preventiva amarilla con una flecha que gira a la derecha"
        >
          <svg viewBox="0 0 24 24">
            <path d="M9 20v-8a5 5 0 0 1 5-5h2" />
            <path d="m14 4 3 3-3 3" />
          </svg>
        </span>
        <p className="quiz-q">¿Qué indica esta señal?</p>
        <div className="q-options" role="group" aria-label="Respuestas">
          {ANSWERS.map((text, index) => (
            <button
              key={text}
              className="q-option"
              type="button"
              aria-pressed={answer === index}
              onClick={() => setAnswer(index)}
            >
              <span className="dot" />
              {text}
            </button>
          ))}
        </div>
        <p className="quiz-foot">
          <span>Intento 1 de 3</span>
          <span className="btn-mini">Siguiente</span>
        </p>
      </div>
    </Phone>
  );
}
