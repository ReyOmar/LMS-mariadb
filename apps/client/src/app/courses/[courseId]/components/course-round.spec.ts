import { INITIAL_ROUND, roundReducer, shouldAskRound, type RoundEvent, type RoundState } from './course-round';

function after(...events: RoundEvent[]): RoundState {
  return events.reduce(roundReducer, INITIAL_ROUND);
}

describe('roundReducer', () => {
  it('abrir una vuelta en curso deja estudiar', () => {
    expect(after({ type: 'checked', finished: false }).stage).toBe('studying');
  });

  it('abrir una vuelta ya cerrada ofrece el certificado y, al elegir, el repaso', () => {
    const opened = after({ type: 'checked', finished: true });
    expect(opened.stage).toBe('already-finished');
    expect(roundReducer(opened, { type: 'review' }).stage).toBe('reviewing');
  });

  it('terminar durante la visita se celebra, después de cerrar el resultado, y queda en repaso', () => {
    const finished = after({ type: 'checked', finished: false }, { type: 'certificate-issued' });
    expect(finished.stage).toBe('celebration-pending');

    const celebrating = roundReducer(finished, { type: 'celebrate' });
    expect(celebrating.stage).toBe('celebrating');
    expect(roundReducer(celebrating, { type: 'review' }).stage).toBe('reviewing');
  });

  it('una comprobación que encuentra la vuelta cerrada durante la visita también se celebra', () => {
    expect(after({ type: 'checked', finished: false }, { type: 'checked', finished: true }).stage).toBe(
      'celebration-pending',
    );
  });

  it('la felicitación sale una sola vez aunque el aviso llegue repetido', () => {
    const reviewing = after(
      { type: 'checked', finished: false },
      { type: 'certificate-issued' },
      { type: 'celebrate' },
      { type: 'review' },
    );
    expect(roundReducer(reviewing, { type: 'certificate-issued' }).stage).toBe('reviewing');
    expect(roundReducer(reviewing, { type: 'checked', finished: true }).stage).toBe('reviewing');
  });

  it('una vuelta abierta ya terminada no se celebra al comprobarla otra vez', () => {
    const opened = after({ type: 'checked', finished: true });
    expect(roundReducer(opened, { type: 'certificate-issued' }).stage).toBe('already-finished');
  });

  it('el aviso de tareas por calificar sale una vez por visita', () => {
    const open = after({ type: 'checked', finished: false }, { type: 'awaiting-grades' });
    expect(open.ungradedNotice).toBe('open');

    const seen = roundReducer(open, { type: 'acknowledge-ungraded' });
    expect(roundReducer(seen, { type: 'awaiting-grades' }).ungradedNotice).toBe('seen');
  });

  it('la felicitación sustituye al aviso de tareas por calificar', () => {
    const celebrating = after(
      { type: 'checked', finished: false },
      { type: 'awaiting-grades' },
      { type: 'certificate-issued' },
      { type: 'celebrate' },
    );
    expect(celebrating).toEqual({ stage: 'celebrating', ungradedNotice: 'seen' });
  });

  it('el aviso de tareas no sale si la vuelta no está en curso', () => {
    expect(after({ type: 'awaiting-grades' }).ungradedNotice).toBe('unseen');
    expect(after({ type: 'checked', finished: true }, { type: 'awaiting-grades' }).ungradedNotice).toBe('unseen');
  });
});

describe('shouldAskRound', () => {
  it('al abrir el curso se pregunta por la vuelta aunque falte un recurso añadido después del certificado', () => {
    expect(shouldAskRound(true, false)).toBe(true);
  });

  it('durante la visita sólo se vuelve a preguntar al completarlo todo', () => {
    expect(shouldAskRound(false, false)).toBe(false);
    expect(shouldAskRound(false, true)).toBe(true);
  });
});
