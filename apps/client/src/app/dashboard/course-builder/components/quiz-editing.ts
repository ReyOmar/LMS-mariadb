import type { OptionWithAnswer, QuestionWithAnswers, QuizConfig } from '@/types/models';

/** Los mismos topes que valida la API (`apps/api/src/courses/quiz-config.ts`). */
export const QUIZ_LIMITS = {
  maxQuestions: 200,
  minOptions: 2,
  maxOptions: 10,
  maxAttempts: 100,
  maxTimeLimitMinutes: 600,
} as const;

export const EMPTY_QUIZ: QuizConfig = { allowedAttempts: 1, timeLimitMinutes: 0, questions: [] };

type NewId = () => string;

const randomId: NewId = () => crypto.randomUUID();

function updateQuestion(
  config: QuizConfig,
  questionId: string,
  change: (question: QuestionWithAnswers) => QuestionWithAnswers,
): QuizConfig {
  return { ...config, questions: config.questions.map((q) => (q.id === questionId ? change(q) : q)) };
}

function updateOptions(
  config: QuizConfig,
  questionId: string,
  change: (options: OptionWithAnswer[]) => OptionWithAnswer[],
): QuizConfig {
  return updateQuestion(config, questionId, (question) => ({ ...question, options: change(question.options) }));
}

/** Pregunta nueva con dos opciones vacías, la primera marcada como correcta. */
export function addQuestion(config: QuizConfig, newId: NewId = randomId): QuizConfig {
  if (config.questions.length >= QUIZ_LIMITS.maxQuestions) return config;
  const question: QuestionWithAnswers = {
    id: newId(),
    prompt: '',
    options: [
      { id: newId(), text: '', isCorrect: true },
      { id: newId(), text: '', isCorrect: false },
    ],
  };
  return { ...config, questions: [...config.questions, question] };
}

export function removeQuestion(config: QuizConfig, questionId: string): QuizConfig {
  return { ...config, questions: config.questions.filter((q) => q.id !== questionId) };
}

export function setPrompt(config: QuizConfig, questionId: string, prompt: string): QuizConfig {
  return updateQuestion(config, questionId, (question) => ({ ...question, prompt }));
}

export function addOption(config: QuizConfig, questionId: string, newId: NewId = randomId): QuizConfig {
  return updateOptions(config, questionId, (options) =>
    options.length >= QUIZ_LIMITS.maxOptions ? options : [...options, { id: newId(), text: '', isCorrect: false }],
  );
}

/** Si se quita la opción correcta, pasa a serlo la primera que queda: la pregunta nunca se queda sin ella. */
export function removeOption(config: QuizConfig, questionId: string, optionId: string): QuizConfig {
  return updateOptions(config, questionId, (options) => {
    if (options.length <= QUIZ_LIMITS.minOptions) return options;
    const remaining = options.filter((option) => option.id !== optionId);
    if (remaining.some((option) => option.isCorrect)) return remaining;
    return remaining.map((option, index) => ({ ...option, isCorrect: index === 0 }));
  });
}

export function markCorrect(config: QuizConfig, questionId: string, optionId: string): QuizConfig {
  return updateOptions(config, questionId, (options) =>
    options.map((option) => ({ ...option, isCorrect: option.id === optionId })),
  );
}

export function setOptionText(config: QuizConfig, questionId: string, optionId: string, text: string): QuizConfig {
  return updateOptions(config, questionId, (options) =>
    options.map((option) => (option.id === optionId ? { ...option, text } : option)),
  );
}

/** Ajuste numérico tecleado (intentos, minutos): entero entre 0, que es «sin límite», y su tope. */
export function clampSetting(typed: string, max: number): number {
  return Math.min(max, Math.max(0, Number.parseInt(typed, 10) || 0));
}

/** Lo primero que la API rechazaría del cuestionario, o `null` si se puede guardar. */
export function quizProblem(config: QuizConfig): string | null {
  if (config.questions.length === 0) return 'El cuestionario debe tener al menos una pregunta.';
  for (const [index, question] of config.questions.entries()) {
    if (!question.prompt.trim()) return `La pregunta ${index + 1} no tiene enunciado.`;
    const empty = question.options.findIndex((option) => !option.text.trim());
    if (empty >= 0) return `La opción ${empty + 1} de la pregunta ${index + 1} está vacía.`;
  }
  return null;
}
