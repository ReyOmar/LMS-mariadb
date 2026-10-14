import { BadRequestException } from '@nestjs/common';
import {
  QuizConfig,
  parseQuizConfig,
  correctAnswers,
  withoutAnswers,
  quizOverview,
  validateQuizConfig,
  serializeQuizConfig,
  quizConfigForEditor,
  quizDisplayTitle,
  allowedAttemptsOf,
} from './quiz-config';

const VALID_CONFIG: QuizConfig = {
  allowedAttempts: 2,
  timeLimitMinutes: 15,
  questions: [
    {
      id: 'p1',
      prompt: '¿Velocidad máxima en zona escolar?',
      options: [
        { id: 'a', text: '30 km/h', isCorrect: true },
        { id: 'b', text: '60 km/h', isCorrect: false },
      ],
    },
    {
      id: 'p2',
      prompt: '¿Qué hacer ante un semáforo en ámbar?',
      options: [
        { id: 'a', text: 'Acelerar', isCorrect: false },
        { id: 'b', text: 'Detenerse si es seguro', isCorrect: true },
      ],
    },
  ],
};

/** Así está guardado en la base un cuestionario existente: con las claves en español. */
const STORED = JSON.stringify({
  intentos_permitidos: 2,
  tiempo_minutos: 15,
  preguntas: VALID_CONFIG.questions.map((q) => ({
    id: q.id,
    enunciado: q.prompt,
    opciones: q.options.map((o) => ({ id: o.id, texto: o.text, es_correcta: o.isCorrect })),
  })),
});

describe('configuración de cuestionarios', () => {
  describe('withoutAnswers', () => {
    it('elimina isCorrect de todas las opciones', () => {
      const studentView = withoutAnswers(VALID_CONFIG);

      for (const question of studentView.questions) {
        for (const option of question.options) {
          expect(option).not.toHaveProperty('isCorrect');
        }
      }
    });

    it('no deja rastro de la respuesta correcta al serializar', () => {
      // Es la comprobación que importa: lo que viaja al navegador es el JSON.
      expect(JSON.stringify(withoutAnswers(VALID_CONFIG))).not.toContain('isCorrect');
    });

    it('conserva enunciados, opciones y ajustes del intento', () => {
      const studentView = withoutAnswers(VALID_CONFIG);

      expect(studentView.allowedAttempts).toBe(2);
      expect(studentView.timeLimitMinutes).toBe(15);
      expect(studentView.questions).toHaveLength(2);
      expect(studentView.questions[0].options.map((o) => o.text)).toEqual(['30 km/h', '60 km/h']);
    });
  });

  describe('quizOverview', () => {
    it('resume el cuestionario sin preguntas ni respuestas', () => {
      const overview = quizOverview(VALID_CONFIG);

      expect(overview).toEqual({ allowedAttempts: 2, timeLimitMinutes: 15, questionCount: 2 });
      expect(JSON.stringify(overview)).not.toContain('Velocidad');
    });
  });

  describe('correctAnswers', () => {
    it('devuelve la opción correcta de cada pregunta', () => {
      const correct = correctAnswers(VALID_CONFIG);

      expect(correct.get('p1')).toBe('a');
      expect(correct.get('p2')).toBe('b');
    });
  });

  describe('parseQuizConfig', () => {
    it('lee los cuestionarios ya guardados, con sus claves en español', () => {
      expect(parseQuizConfig(STORED)).toEqual(VALID_CONFIG);
    });

    it('avisa cuando el recurso no tiene cuestionario', () => {
      expect(() => parseQuizConfig(null)).toThrow(BadRequestException);
    });

    it('avisa cuando el JSON está dañado en lugar de devolver un quiz vacío', () => {
      expect(() => parseQuizConfig('{roto')).toThrow(/dañada/);
    });
  });

  describe('serializeQuizConfig', () => {
    it('guarda con el formato de la base, de modo que lo viejo y lo nuevo se leen igual', () => {
      expect(JSON.parse(serializeQuizConfig(VALID_CONFIG))).toEqual(JSON.parse(STORED));
      expect(parseQuizConfig(serializeQuizConfig(VALID_CONFIG))).toEqual(VALID_CONFIG);
    });
  });

  describe('quizDisplayTitle', () => {
    it('quita la marca interna con la que se guarda el título de un cuestionario', () => {
      expect(quizDisplayTitle('[QUIZ] Evaluación del módulo 1')).toBe('Evaluación del módulo 1');
    });

    it('deja igual un título sin marca y no toca una marca que no esté al principio', () => {
      expect(quizDisplayTitle('Evaluación final')).toBe('Evaluación final');
      expect(quizDisplayTitle('Repaso [QUIZ] previo')).toBe('Repaso [QUIZ] previo');
    });
  });

  describe('quizConfigForEditor', () => {
    it('entrega al editor el formato de la API, con las respuestas', () => {
      expect(JSON.parse(quizConfigForEditor(STORED) ?? '')).toEqual(VALID_CONFIG);
    });

    it('con una configuración dañada devuelve null para que el editor pueda rehacerla', () => {
      expect(quizConfigForEditor('{roto')).toBeNull();
      expect(quizConfigForEditor(null)).toBeNull();
    });
  });

  describe('allowedAttemptsOf', () => {
    it('lee los intentos permitidos de la configuración guardada', () => {
      expect(allowedAttemptsOf(STORED)).toBe(2);
    });

    it('sin configuración o con ella dañada no los da por ilimitados', () => {
      expect(allowedAttemptsOf(null)).toBeNull();
      expect(allowedAttemptsOf('{roto')).toBeNull();
    });
  });

  describe('validateQuizConfig', () => {
    it('exige al menos una pregunta', () => {
      expect(() => validateQuizConfig(JSON.stringify({ questions: [] }))).toThrow(/al menos una pregunta/);
    });

    it('exige al menos dos opciones por pregunta', () => {
      const config = {
        questions: [{ id: 'p1', prompt: 'x', options: [{ id: 'a', text: 'sí', isCorrect: true }] }],
      };
      expect(() => validateQuizConfig(JSON.stringify(config))).toThrow(/dos opciones/);
    });

    it('exige exactamente una opción correcta', () => {
      const twoCorrect = {
        questions: [
          {
            id: 'p1',
            prompt: 'x',
            options: [
              { id: 'a', text: 'sí', isCorrect: true },
              { id: 'b', text: 'también', isCorrect: true },
            ],
          },
        ],
      };
      expect(() => validateQuizConfig(JSON.stringify(twoCorrect))).toThrow(/exactamente una opción correcta/);

      const noneCorrect = {
        questions: [
          {
            id: 'p1',
            prompt: 'x',
            options: [
              { id: 'a', text: 'sí', isCorrect: false },
              { id: 'b', text: 'no', isCorrect: false },
            ],
          },
        ],
      };
      expect(() => validateQuizConfig(JSON.stringify(noneCorrect))).toThrow(/exactamente una opción correcta/);
    });

    it('rechaza una opción sin texto', () => {
      const config = {
        questions: [
          {
            id: 'p1',
            prompt: 'x',
            options: [
              { id: 'a', text: '  ', isCorrect: true },
              { id: 'b', text: 'no', isCorrect: false },
            ],
          },
        ],
      };
      expect(() => validateQuizConfig(JSON.stringify(config))).toThrow(/está vacía/);
    });

    it('normaliza los ajustes numéricos ausentes a 0 (sin límite)', () => {
      const config = { questions: VALID_CONFIG.questions };
      const validated = validateQuizConfig(JSON.stringify(config));

      expect(validated.allowedAttempts).toBe(0);
      expect(validated.timeLimitMinutes).toBe(0);
    });

    it('rechaza un número de intentos inválido en lugar de dejarlo ilimitado', () => {
      for (const allowedAttempts of [-3, 1.5, '2', true, 101]) {
        const config = { ...VALID_CONFIG, allowedAttempts };
        expect(() => validateQuizConfig(JSON.stringify(config))).toThrow(/número de intentos/);
      }
    });

    it('rechaza un límite de tiempo inválido en lugar de dejarlo sin límite', () => {
      for (const timeLimitMinutes of ['diez', -5, 0.5, 601]) {
        const config = { ...VALID_CONFIG, timeLimitMinutes };
        expect(() => validateQuizConfig(JSON.stringify(config))).toThrow(/límite de tiempo/);
      }
    });

    it('rechaza dos preguntas con el mismo identificador', () => {
      const config = {
        ...VALID_CONFIG,
        questions: [VALID_CONFIG.questions[0], { ...VALID_CONFIG.questions[1], id: 'p1' }],
      };

      expect(() => validateQuizConfig(JSON.stringify(config))).toThrow(/dos preguntas con el mismo identificador/);
    });

    it('rechaza dos opciones con el mismo identificador en una pregunta', () => {
      const config = {
        questions: [
          {
            id: 'p1',
            prompt: 'x',
            options: [
              { id: 'a', text: 'sí', isCorrect: true },
              { id: 'a', text: 'no', isCorrect: false },
            ],
          },
        ],
      };

      expect(() => validateQuizConfig(JSON.stringify(config))).toThrow(/dos opciones con el mismo identificador/);
    });

    it('admite el mismo identificador de opción en preguntas distintas', () => {
      // Es lo habitual («a», «b»…): la respuesta se busca dentro de su pregunta.
      expect(validateQuizConfig(JSON.stringify(VALID_CONFIG))).toEqual(VALID_CONFIG);
    });
  });
});
