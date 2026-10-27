import { EventsListener } from './events.listener';

/**
 * El certificado no puede depender de que salgan los avisos.
 *
 * Al calificar la última tarea de un curso pasan dos cosas: se avisa al alumno y se le
 * emite el certificado. Si un fallo del aviso —crear la notificación o preparar el correo
 * consultan la base— saltara la emisión, no llegaría ningún evento más que la reintentara.
 */
describe('EventsListener · el certificado va aparte de los avisos', () => {
  const EVENT = {
    userGuid: 'alumna',
    country: 'COLOMBIA' as const,
    submissionGuid: 'entrega-1',
    assignmentGuid: 'tarea-1',
    courseGuid: 'curso-1',
    assignmentTitle: 'Informe final',
    score: 95,
    passingScore: 80,
    passed: true,
    feedback: null,
  };

  function listenerWith({ notificationFails }: { notificationFails: boolean }) {
    const certificates = { issueIfEligible: jest.fn().mockResolvedValue(undefined) };
    const notifications = {
      create: notificationFails ? jest.fn().mockRejectedValue(new Error('la base no responde')) : jest.fn(),
    };
    const prisma = { user: { findUnique: async () => ({ firstName: 'Ana', email: 'ana@pesv.test' }) } };
    const email = { sendGrade: jest.fn().mockResolvedValue(true) };

    const listener = new EventsListener(
      prisma as never,
      notifications as never,
      email as never,
      certificates as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(listener['logger'], 'error').mockImplementation(() => undefined);

    return { listener, certificates };
  }

  it('si el aviso falla, el certificado se intenta igual', async () => {
    const { listener, certificates } = listenerWith({ notificationFails: true });

    await listener.onSubmissionGraded(EVENT);

    expect(certificates.issueIfEligible).toHaveBeenCalledWith('curso-1', 'alumna', 'COLOMBIA');
  });

  it('una entrega suspendida no intenta certificar', async () => {
    const { listener, certificates } = listenerWith({ notificationFails: false });

    await listener.onSubmissionGraded({ ...EVENT, passed: false });

    expect(certificates.issueIfEligible).not.toHaveBeenCalled();
  });

  it('el fallo de un aviso no escapa: la petición que lo originó ya terminó', async () => {
    const { listener } = listenerWith({ notificationFails: true });

    await expect(listener.onSubmissionGraded(EVENT)).resolves.toBeUndefined();
  });
});

describe('EventsListener · cuestionario no superado', () => {
  const EVENT = {
    userGuid: 'alumna',
    country: 'MEXICO' as const,
    resourceGuid: 'quiz-1',
    courseGuid: 'curso-1',
    courseTitle: 'Conducción defensiva',
    teacherGuid: 'profesor-1',
    score: 40,
    passingScore: 80,
    quizTitle: 'Evaluación del módulo 2',
  };

  function listenerWith(resource: { module: { title: string } } | null) {
    const prisma = {
      user: { findUnique: async () => ({ firstName: 'Ana', lastName: 'Ruiz', email: 'ana@pesv.test' }) },
      resource: { findUnique: async () => resource },
    };
    const mail = { sendQuizFailed: jest.fn().mockResolvedValue(true) };
    const listener = new EventsListener(
      prisma as never,
      { create: jest.fn() } as never,
      mail as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { listener, mail };
  }

  it('el correo nombra el módulo al que vuelve el alumno, no el curso', async () => {
    const { listener, mail } = listenerWith({ module: { title: 'Módulo 2: señales' } });

    await listener.onQuizFailed(EVENT);

    expect(mail.sendQuizFailed).toHaveBeenCalledWith(
      'ana@pesv.test',
      'Ana',
      'Evaluación del módulo 2',
      'Módulo 2: señales',
      40,
      'MEXICO',
    );
  });

  it('si el recurso ya no existe, nombra el curso', async () => {
    const { listener, mail } = listenerWith(null);

    await listener.onQuizFailed(EVENT);

    expect(mail.sendQuizFailed.mock.calls[0][3]).toBe('Conducción defensiva');
  });
});

describe('EventsListener · correo de tarea aprobada', () => {
  it('lleva el comentario del examinador', async () => {
    const mail = { sendGrade: jest.fn().mockResolvedValue(true) };
    const listener = new EventsListener(
      { user: { findUnique: async () => ({ firstName: 'Ana', email: 'ana@pesv.test' }) } } as never,
      { create: jest.fn() } as never,
      mail as never,
      { issueIfEligible: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
    );

    await listener.onSubmissionGraded({
      userGuid: 'alumna',
      country: 'COLOMBIA',
      submissionGuid: 'entrega-1',
      assignmentGuid: 'tarea-1',
      courseGuid: 'curso-1',
      assignmentTitle: 'Informe final',
      score: 95,
      passingScore: 80,
      passed: true,
      feedback: 'Excelente análisis.',
    });

    expect(mail.sendGrade).toHaveBeenCalledWith(
      'ana@pesv.test',
      'Ana',
      'Informe final',
      95,
      'COLOMBIA',
      'Excelente análisis.',
    );
  });
});

/** Cada aviso de cuestionario lleva a donde se actúa sobre él. */
describe('EventsListener · enlaces de los avisos de cuestionario', () => {
  const BASE = { userGuid: 'alumna', country: 'COLOMBIA' as const, resourceGuid: 'quiz-1', courseGuid: 'curso-1' };

  function listener() {
    const notifications = { create: jest.fn() };
    const prisma = {
      user: { findUnique: async () => null },
      resource: { findUnique: async () => null },
    };
    const certificates = { issueIfEligible: jest.fn().mockResolvedValue(undefined) };
    const instance = new EventsListener(
      prisma as never,
      notifications as never,
      {} as never,
      certificates as never,
      {} as never,
      {} as never,
    );
    return { instance, notifications };
  }

  const urlsOf = (notifications: { create: jest.Mock }) =>
    notifications.create.mock.calls.map(([notification]) => [notification.userGuid, notification.actionUrl]);

  it('aprobado y nuevo intento llevan al alumno a su curso', async () => {
    const { instance, notifications } = listener();

    await instance.onQuizPassed({ ...BASE, score: 90, quizTitle: 'Señales' });
    await instance.onAttemptEnabled({ ...BASE, quizTitle: 'Señales' });

    expect(urlsOf(notifications)).toEqual([
      ['alumna', '/courses/curso-1'],
      ['alumna', '/courses/curso-1'],
    ]);
  });

  it('no superado lleva al alumno a su curso y al examinador a su panel de cuestionarios', async () => {
    const { instance, notifications } = listener();

    await instance.onQuizFailed({
      ...BASE,
      courseTitle: 'Conducción defensiva',
      teacherGuid: 'profesor-1',
      score: 40,
      passingScore: 80,
      quizTitle: 'Señales',
    });

    expect(urlsOf(notifications)).toEqual([
      ['alumna', '/courses/curso-1'],
      ['profesor-1', '/dashboard/examiner/quizzes'],
    ]);
    // Al alumno, con el tipo que dice que vuelve al principio del módulo.
    expect(notifications.create.mock.calls[0][0]).toMatchObject({ type: 'MODULE_RESET' });
  });
});

/** Publicar un curso, ponerle código o ampliar su cupo deja pasar a quien lo esperaba desde otro sistema. */
describe('EventsListener · matrículas pedidas por otros sistemas', () => {
  function listenerWith(attendCourse: jest.Mock) {
    const listener = new EventsListener(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { attendCourse } as never,
    );
    const errors = jest.spyOn(listener['logger'], 'error').mockImplementation(() => undefined);
    return { listener, errors };
  }

  const opened = { courseGuid: 'curso-1', userGuid: 'admin', country: 'COLOMBIA' as const };

  it('al abrirse un curso se atienden las que lo esperaban', async () => {
    const attendCourse = jest.fn().mockResolvedValue(undefined);
    const { listener } = listenerWith(attendCourse);

    await listener.onCourseOpened(opened);

    expect(attendCourse).toHaveBeenCalledWith('curso-1');
  });

  it('un fallo al atenderlas se registra y no escapa: la publicación ya se guardó', async () => {
    const { listener, errors } = listenerWith(jest.fn().mockRejectedValue(new Error('Base caída')));

    await expect(listener.onCourseOpened(opened)).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalled();
  });
});
