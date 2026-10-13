import type { QuizConfig } from '@/types/models';
import {
  EMPTY_QUIZ,
  QUIZ_LIMITS,
  addOption,
  addQuestion,
  clampSetting,
  markCorrect,
  quizProblem,
  removeOption,
  removeQuestion,
  setOptionText,
  setPrompt,
} from './quiz-editing';

function sequentialIds() {
  let next = 0;
  return () => `id-${++next}`;
}

/** Una pregunta con tres opciones; la correcta es la indicada. */
function quizWithQuestion(correct: string): QuizConfig {
  return {
    ...EMPTY_QUIZ,
    questions: [
      {
        id: 'q',
        prompt: '¿Color del semáforo para parar?',
        options: ['a', 'b', 'c'].map((id) => ({ id, text: id, isCorrect: id === correct })),
      },
    ],
  };
}

const optionsOf = (config: QuizConfig) => config.questions[0].options;

describe('preguntas', () => {
  it('una pregunta nueva trae dos opciones y la primera es la correcta', () => {
    const [question] = addQuestion(EMPTY_QUIZ, sequentialIds()).questions;

    expect(question.options.map((option) => option.isCorrect)).toEqual([true, false]);
  });

  it('cambia el enunciado y la quita sin tocar las demás', () => {
    const config = setPrompt(quizWithQuestion('a'), 'q', 'Nuevo enunciado');

    expect(config.questions[0].prompt).toBe('Nuevo enunciado');
    expect(removeQuestion(config, 'q').questions).toEqual([]);
  });
});

describe('opciones', () => {
  it('al quitar la opción correcta, pasa a serlo la primera que queda', () => {
    const config = removeOption(quizWithQuestion('a'), 'q', 'a');

    expect(optionsOf(config).map((option) => [option.id, option.isCorrect])).toEqual([
      ['b', true],
      ['c', false],
    ]);
  });

  it('al quitar otra opción, la correcta sigue siendo la misma', () => {
    const config = removeOption(quizWithQuestion('c'), 'q', 'a');

    expect(optionsOf(config).find((option) => option.isCorrect)?.id).toBe('c');
  });

  it('no deja menos de dos opciones ni más de las que admite la API', () => {
    const twoOptions = removeOption(quizWithQuestion('a'), 'q', 'c');
    expect(optionsOf(removeOption(twoOptions, 'q', 'b'))).toHaveLength(2);

    let config = quizWithQuestion('a');
    const ids = sequentialIds();
    for (let i = 0; i < QUIZ_LIMITS.maxOptions + 5; i++) config = addOption(config, 'q', ids);
    expect(optionsOf(config)).toHaveLength(QUIZ_LIMITS.maxOptions);
  });

  it('marcar una opción como correcta desmarca las demás', () => {
    const config = markCorrect(quizWithQuestion('a'), 'q', 'b');

    expect(
      optionsOf(config)
        .filter((option) => option.isCorrect)
        .map((option) => option.id),
    ).toEqual(['b']);
  });

  it('cambia el texto de una sola opción', () => {
    const config = setOptionText(quizWithQuestion('a'), 'q', 'b', 'Rojo');

    expect(optionsOf(config).map((option) => option.text)).toEqual(['a', 'Rojo', 'c']);
  });
});

describe('clampSetting', () => {
  it('se queda entre 0 y el tope, y lo que no es número vale 0', () => {
    expect(clampSetting('3', QUIZ_LIMITS.maxAttempts)).toBe(3);
    expect(clampSetting('500', QUIZ_LIMITS.maxAttempts)).toBe(QUIZ_LIMITS.maxAttempts);
    expect(clampSetting('-2', QUIZ_LIMITS.maxAttempts)).toBe(0);
    expect(clampSetting('', QUIZ_LIMITS.maxAttempts)).toBe(0);
  });
});

describe('quizProblem', () => {
  it('un cuestionario sin preguntas no se puede guardar: el alumno se quedaría atascado en él', () => {
    expect(quizProblem(EMPTY_QUIZ)).toBe('El cuestionario debe tener al menos una pregunta.');
  });

  it('señala la pregunta sin enunciado y la opción vacía, como la API', () => {
    expect(quizProblem(setPrompt(quizWithQuestion('a'), 'q', ' '))).toBe('La pregunta 1 no tiene enunciado.');
    expect(quizProblem(setOptionText(quizWithQuestion('a'), 'q', 'b', ''))).toBe(
      'La opción 2 de la pregunta 1 está vacía.',
    );
  });

  it('uno completo se puede guardar', () => {
    expect(quizProblem(quizWithQuestion('a'))).toBeNull();
  });
});
