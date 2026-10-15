/** Momento de la vuelta del alumno por el curso, que decide qué ve el visor. */
export type RoundStage =
  /** Aún no se sabe si la vuelta está cerrada. */
  | 'checking'
  | 'studying'
  /** La abrió terminada: se le ofrece el certificado o repasar. */
  | 'already-finished'
  /** La acaba de terminar: la felicitación espera a que se cierre el resultado del cuestionario. */
  | 'celebration-pending'
  | 'celebrating'
  /** Terminada, repasando el contenido en modo lectura. */
  | 'reviewing';

export interface RoundState {
  stage: RoundStage;
  /** Sale una sola vez por visita y la felicitación lo sustituye. */
  ungradedNotice: 'unseen' | 'open' | 'seen';
}

export type RoundEvent =
  /** El servidor dijo si la vuelta está cerrada. */
  | { type: 'checked'; finished: boolean }
  /** Llegó el certificado de esta vuelta por tiempo real. */
  | { type: 'certificate-issued' }
  | { type: 'celebrate' }
  /** Cerró la felicitación o eligió repasar. */
  | { type: 'review' }
  | { type: 'awaiting-grades' }
  | { type: 'acknowledge-ungraded' };

export const INITIAL_ROUND: RoundState = { stage: 'checking', ungradedNotice: 'unseen' };

/**
 * Al abrir el curso se pregunta aunque falte algo: un recurso añadido tras el certificado no reabre
 * la vuelta. Después, sólo al completarlo todo, que es cuando el servidor puede cerrarla.
 */
export function shouldAskRound(courseJustOpened: boolean, pathCompleted: boolean): boolean {
  return courseJustOpened || pathCompleted;
}

export function roundReducer(state: RoundState, event: RoundEvent): RoundState {
  switch (event.type) {
    case 'checked':
      if (state.stage === 'checking') return { ...state, stage: event.finished ? 'already-finished' : 'studying' };
      return event.finished ? finishNow(state) : state;
    case 'certificate-issued':
      return finishNow(state);
    case 'celebrate':
      if (state.stage !== 'celebration-pending') return state;
      return { stage: 'celebrating', ungradedNotice: state.ungradedNotice === 'open' ? 'seen' : state.ungradedNotice };
    case 'review':
      return state.stage === 'already-finished' || state.stage === 'celebrating'
        ? { ...state, stage: 'reviewing' }
        : state;
    case 'awaiting-grades':
      return state.stage === 'studying' && state.ungradedNotice === 'unseen'
        ? { ...state, ungradedNotice: 'open' }
        : state;
    case 'acknowledge-ungraded':
      return state.ungradedNotice === 'open' ? { ...state, ungradedNotice: 'seen' } : state;
  }
}

/** Terminar sólo se celebra una vez, y sólo si se estaba haciendo el curso. */
function finishNow(state: RoundState): RoundState {
  return state.stage === 'checking' || state.stage === 'studying' ? { ...state, stage: 'celebration-pending' } : state;
}
