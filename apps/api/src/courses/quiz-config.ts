import { BadRequestException } from '@nestjs/common';

/**
 * Configuración de un cuestionario. Contiene las respuestas correctas, así que hacia un
 * alumno sólo sale la versión de `withoutAnswers`.
 *
 * En la base (`lms_recursos.quiz_config`) se guarda con las claves en español que ya tienen
 * los cuestionarios existentes; en la API viaja con claves en inglés. La conversión se hace
 * sólo aquí, al leer (`parseQuizConfig`) y al escribir (`serializeQuizConfig`).
 */

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

export interface QuizConfig {
  /** 0 = intentos ilimitados. */
  allowedAttempts: number;
  /** 0 = sin límite de tiempo. */
  timeLimitMinutes: number;
  questions: QuizQuestion[];
}

export type StudentOption = Omit<QuizOption, 'isCorrect'>;
export type StudentQuestion = Omit<QuizQuestion, 'options'> & { options: StudentOption[] };
export type StudentQuizConfig = Omit<QuizConfig, 'questions'> & {
  questions: StudentQuestion[];
};

/** Máximos que evitan que un cuestionario mal construido degrade el servicio. */
const MAX_QUESTIONS = 200;
const MAX_OPTIONS = 10;

/** Configuración guardada en la base → formato de la API. */
export function parseQuizConfig(stored: string | null): QuizConfig {
  if (!stored) {
    throw new BadRequestException('Este recurso no tiene un cuestionario configurado.');
  }
  const data = parseJson(
    stored,
    'La configuración de este cuestionario está dañada. Avisa al administrador del curso.',
  );
  return validateConfig(fromStoredFormat(data));
}

/** Configuración enviada por el editor de cursos; se valida también aquí, no sólo en el navegador. */
export function validateQuizConfig(raw: string): QuizConfig {
  return validateConfig(parseJson(raw, 'La configuración del cuestionario no es un JSON válido.'));
}

/** Formato de la API → texto que se guarda en la base. */
export function serializeQuizConfig(config: QuizConfig): string {
  return JSON.stringify({
    intentos_permitidos: config.allowedAttempts,
    tiempo_minutos: config.timeLimitMinutes,
    preguntas: config.questions.map((question) => ({
      id: question.id,
      enunciado: question.prompt,
      opciones: question.options.map((option) => ({
        id: option.id,
        texto: option.text,
        es_correcta: option.isCorrect,
      })),
    })),
  });
}

/**
 * Configuración guardada → texto en el formato de la API, con las respuestas: sólo para
 * quien edita el curso. Si está dañada devuelve null, para que el editor pueda abrir el
 * recurso y rehacerla en lugar de encontrarse un error.
 */
export function quizConfigForEditor(stored: string | null): string | null {
  if (!stored) return null;
  try {
    return JSON.stringify(parseQuizConfig(stored));
  } catch {
    return null;
  }
}

/** Versión que puede viajar al navegador de un alumno. */
export function withoutAnswers(config: QuizConfig): StudentQuizConfig {
  return {
    allowedAttempts: config.allowedAttempts,
    timeLimitMinutes: config.timeLimitMinutes,
    questions: config.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options.map(({ id, text }) => ({ id, text })),
    })),
  };
}

/** Identificador de la opción correcta de cada pregunta. Sólo se usa al calificar. */
export function correctAnswers(config: QuizConfig): Map<string, string> {
  const correct = new Map<string, string>();
  for (const question of config.questions) {
    const correctOption = question.options.find((option) => option.isCorrect);
    if (correctOption) correct.set(question.id, correctOption.id);
  }
  return correct;
}

function parseJson(raw: string, errorMessage: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException(errorMessage);
  }
}

/** Claves guardadas en la base → claves de la API. Lo que no tenga la forma esperada lo rechaza la validación. */
function fromStoredFormat(data: unknown): unknown {
  if (!isObject(data)) return data;
  return {
    allowedAttempts: data.intentos_permitidos,
    timeLimitMinutes: data.tiempo_minutos,
    questions: mapObjects(data.preguntas, (question) => ({
      id: question.id,
      prompt: question.enunciado,
      options: mapObjects(question.opciones, (option) => ({
        id: option.id,
        text: option.texto,
        isCorrect: option.es_correcta,
      })),
    })),
  };
}

/** Transforma los objetos de una lista; lo que no sea lista u objeto pasa tal cual y lo rechaza la validación. */
function mapObjects(value: unknown, transform: (item: Record<string, unknown>) => unknown): unknown {
  return Array.isArray(value) ? value.map((item) => (isObject(item) ? transform(item) : item)) : value;
}

function validateConfig(data: unknown): QuizConfig {
  if (!isObject(data)) {
    throw new BadRequestException('La configuración del cuestionario no tiene el formato esperado.');
  }

  const rawQuestions = data.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new BadRequestException('El cuestionario debe tener al menos una pregunta.');
  }
  if (rawQuestions.length > MAX_QUESTIONS) {
    throw new BadRequestException(`Un cuestionario no puede superar las ${MAX_QUESTIONS} preguntas.`);
  }

  return {
    allowedAttempts: nonNegativeInteger(data.allowedAttempts),
    timeLimitMinutes: nonNegativeInteger(data.timeLimitMinutes),
    questions: rawQuestions.map((question, index) => validateQuestion(question, index)),
  };
}

function validateQuestion(question: unknown, index: number): QuizQuestion {
  const questionNumber = index + 1;
  if (!isObject(question) || typeof question.id !== 'string' || !question.id) {
    throw new BadRequestException(`La pregunta ${questionNumber} no tiene identificador.`);
  }
  if (typeof question.prompt !== 'string' || !question.prompt.trim()) {
    throw new BadRequestException(`La pregunta ${questionNumber} no tiene enunciado.`);
  }

  const rawOptions = question.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
    throw new BadRequestException(`La pregunta ${questionNumber} debe tener al menos dos opciones.`);
  }
  if (rawOptions.length > MAX_OPTIONS) {
    throw new BadRequestException(`La pregunta ${questionNumber} no puede tener más de ${MAX_OPTIONS} opciones.`);
  }

  const options: QuizOption[] = rawOptions.map((option, i) => {
    if (!isObject(option) || typeof option.id !== 'string' || !option.id) {
      throw new BadRequestException(`La opción ${i + 1} de la pregunta ${questionNumber} no tiene identificador.`);
    }
    if (typeof option.text !== 'string' || !option.text.trim()) {
      throw new BadRequestException(`La opción ${i + 1} de la pregunta ${questionNumber} está vacía.`);
    }
    return { id: option.id, text: option.text, isCorrect: option.isCorrect === true };
  });

  const correctCount = options.filter((option) => option.isCorrect).length;
  if (correctCount !== 1) {
    throw new BadRequestException(
      `La pregunta ${questionNumber} debe tener exactamente una opción correcta (tiene ${correctCount}).`,
    );
  }

  return { id: question.id, prompt: question.prompt, options };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 ? num : 0;
}
