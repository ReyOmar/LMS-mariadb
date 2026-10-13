import type { QuizConfig } from '@/types/models';

/** Lo que se resume de un cuestionario, sin preguntas ni respuestas. */
export interface QuizSummary {
  allowedAttempts: number;
  timeLimitMinutes: number;
  questions: number;
}

/**
 * La configuración guardada de un cuestionario, tal como llega en la vista de gestión. Los
 * campos que falten cuentan como cero; si no hay o está dañada, `null` en vez de romper la vista.
 */
export function parseQuizConfig(stored: string | null | undefined): QuizConfig | null {
  if (!stored) return null;
  try {
    const data = JSON.parse(stored) as Partial<QuizConfig> | null;
    if (!data || typeof data !== 'object') return null;
    return {
      allowedAttempts: data.allowedAttempts ?? 0,
      timeLimitMinutes: data.timeLimitMinutes ?? 0,
      questions: Array.isArray(data.questions) ? data.questions : [],
    };
  } catch {
    return null;
  }
}

export function quizSummary(stored: string | null | undefined): QuizSummary | null {
  const config = parseQuizConfig(stored);
  if (!config) return null;
  return {
    allowedAttempts: config.allowedAttempts,
    timeLimitMinutes: config.timeLimitMinutes,
    questions: config.questions.length,
  };
}
