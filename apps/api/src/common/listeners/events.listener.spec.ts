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
