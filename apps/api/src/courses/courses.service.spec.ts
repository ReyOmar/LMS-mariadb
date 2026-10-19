import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { sessionFor } from '../common/testing/test-campus';
import { fileOwnershipDouble } from '../common/testing/file-ownership-double';

const ADMIN = sessionFor('ADMIN', 'COLOMBIA', 'admin');
const DRAFT = { guid: 'curso-1', country: 'COLOMBIA', title: 'Curso', status: 'DRAFT', teacherGuid: 'admin' };
const PUBLISHED = { ...DRAFT, status: 'PUBLISHED', teacherGuid: 'profe' };

/**
 * Servicio con dobles de sus dependencias. Por defecto el curso no tiene matriculados; las
 * consultas que una prueba necesite se pasan en `prisma` y sustituyen a las de serie.
 */
function serviceWith(prisma: Record<string, unknown>, course: Record<string, unknown> = DRAFT) {
  const ownership = fileOwnershipDouble();
  const access = {
    managedCourse: async () => course,
    editableCourse: async () => {
      if (course.status !== 'DRAFT') throw new BadRequestException('El curso debe estar en Borrador.');
      return course;
    },
    courseInCountry: async () => course,
    ensureEnrollment: async () => undefined,
  };
  // A quién llega cada evento: la sede entera, el personal del curso o usuarios concretos.
  const emitted: { event: string; to: string }[] = [];
  const realtime = {
    emitToCountry: (event: string) => emitted.push({ event, to: 'sede' }),
    emitToCourseStaff: (event: string, _data: unknown, _country: unknown, teacherGuid: string) =>
      emitted.push({ event, to: `administradores y ${teacherGuid}` }),
    emitToUsers: (event: string, _data: unknown, _country: unknown, guids: string[]) => {
      if (guids.length > 0) emitted.push({ event, to: guids.join(', ') });
    },
  };
  const notifications = { create: jest.fn(async () => undefined) };
  const mail = {
    sendCourseUnderMaintenance: jest.fn(async () => undefined),
    sendCourseReactivated: jest.fn(async () => undefined),
    sendEnrollment: jest.fn(async () => undefined),
  };
  const storage = { downloadUrl: (key: string) => `/descargas/${key}` };
  const defaults = {
    enrollment: { findMany: async () => [] },
  };
  const client: Record<string, unknown> = {
    ...defaults,
    ...prisma,
    $transaction: (work: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
      typeof work === 'function' ? work(client) : Promise.all(work),
  };
  const removal = { remove: jest.fn(async () => undefined) };
  const service = new CoursesService(
    client as never,
    access as never,
    storage as never,
    mail as never,
    realtime as never,
    notifications as never,
    ownership.files,
    removal as never,
  );
  return { service, files: ownership, emitted, notifications, mail, removal, deletedFiles: ownership.retired };
}

/** Espera a que terminen los avisos que el servicio lanza sin bloquear la respuesta. */
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

/** Lo que deja de usarse al tocar un curso tiene que salir también del almacenamiento. */
describe('CoursesService · archivos del curso', () => {
  it('borrar un curso se lleva su contenido, sus entregas y sus archivos', async () => {
    const { service, removal } = serviceWith({});

    await service.deleteCourse('curso-1', ADMIN);

    expect(removal.remove).toHaveBeenCalledWith({ courseGuid: 'curso-1' });
  });

  it('un curso publicado no se borra', async () => {
    const { service, removal } = serviceWith({}, PUBLISHED);

    await expect(service.deleteCourse('curso-1', ADMIN)).rejects.toThrow(/Borrador/);
    expect(removal.remove).not.toHaveBeenCalled();
  });

  it('cambiar la portada comprueba que la nueva la subió quien guarda y retira la anterior', async () => {
    const { service, files, deletedFiles } = serviceWith({
      course: {
        findUnique: async () => ({ coverImage: 'portadas/vieja.jpg' }),
        update: async () => ({ guid: 'curso-1', title: 'Curso', status: 'DRAFT', coverImage: 'portadas/nueva.jpg' }),
      },
    });

    await service.updateCourse('curso-1', { coverImage: 'portadas/nueva.jpg' }, ADMIN);

    expect(files.assertCanUse).toHaveBeenCalledWith('portadas/nueva.jpg', 'portadas/vieja.jpg', 'portadas', {
      uploader: 'admin',
    });
    expect(deletedFiles()).toEqual(['portadas/vieja.jpg']);
  });

  it('una portada ajena no llega a guardarse ni se borra la anterior', async () => {
    const update = jest.fn();
    const { service, files, deletedFiles } = serviceWith({
      course: { findUnique: async () => ({ coverImage: 'portadas/vieja.jpg' }), update },
    });
    files.assertCanUse.mockRejectedValueOnce(new ForbiddenException('ajena'));

    await expect(service.updateCourse('curso-1', { coverImage: 'portadas/ajena.jpg' }, ADMIN)).rejects.toThrow(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
    expect(deletedFiles()).toEqual([]);
  });

  it('quitar la portada la retira del almacenamiento y deja de mostrarse', async () => {
    const update = jest.fn(async () => ({ guid: 'curso-1', title: 'Curso', status: 'DRAFT', coverImage: null }));
    const { service, deletedFiles } = serviceWith({
      course: { findUnique: async () => ({ coverImage: 'portadas/vieja.jpg' }), update },
    });

    await service.updateCourse('curso-1', { coverImage: null }, ADMIN);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { coverImage: null } }));
    expect(deletedFiles()).toEqual(['portadas/vieja.jpg']);
  });

  it('guardar la ficha sin tocar la portada no borra nada', async () => {
    const { service, deletedFiles } = serviceWith({
      course: {
        update: async () => ({ guid: 'curso-1', title: 'Otro título', status: 'DRAFT', coverImage: 'portadas/c.jpg' }),
      },
    });

    await service.updateCourse('curso-1', { title: 'Otro título' }, ADMIN);

    expect(deletedFiles()).toEqual([]);
  });
});

describe('CoursesService · cursos del alumno', () => {
  it('sólo lista los cursos con matrícula activa', async () => {
    const queries: { where: unknown }[] = [];
    const { service } = serviceWith({
      enrollment: {
        findMany: async (query: { where: unknown }) => {
          queries.push(query);
          return [];
        },
      },
    });

    await service.getCurrentUserCourses(sessionFor('STUDENT', 'COLOMBIA', 'alumna'));

    expect(queries[0].where).toEqual({ userGuid: 'alumna', active: true });
  });

  it('cada curso trae el avance y la finalización de la vuelta actual, sin pasar de 100 %', async () => {
    const enrolledAt = new Date('2026-09-01T12:00:00Z');
    const completedAt = new Date('2026-09-20T12:00:00Z');
    const course = (guid: string, resourcesPerModule: number[]) => ({
      guid,
      title: guid,
      modules: resourcesPerModule.map((resources) => ({ _count: { resources } })),
    });
    const { service } = serviceWith({
      enrollment: {
        findMany: async () => [
          { enrolledAt, completedAt: null, completedResources: 3, course: course('en-curso', [4, 4]) },
          // Retirar un recurso deja el recuento guardado por encima hasta la reconciliación.
          { enrolledAt, completedAt, completedResources: 6, course: course('terminado', [5]) },
        ],
      },
    });

    const courses = await service.getCurrentUserCourses(sessionFor('STUDENT', 'COLOMBIA', 'alumna'));

    expect(courses).toEqual([
      {
        guid: 'en-curso',
        title: 'en-curso',
        assignedAt: enrolledAt,
        completedAt: null,
        completedResources: 3,
        totalResources: 8,
        percent: 38,
      },
      {
        guid: 'terminado',
        title: 'terminado',
        assignedAt: enrolledAt,
        completedAt,
        completedResources: 5,
        totalResources: 5,
        percent: 100,
      },
    ]);
  });
});

describe('CoursesService · ficha del alumno', () => {
  it('de un cuestionario sólo entrega el resumen: ni preguntas ni respuestas', async () => {
    const stored = JSON.stringify({
      intentos_permitidos: 2,
      tiempo_minutos: 15,
      preguntas: [
        {
          id: 'p1',
          enunciado: '¿Velocidad máxima en zona escolar?',
          opciones: [
            { id: 'a', texto: '30 km/h', es_correcta: true },
            { id: 'b', texto: '60 km/h', es_correcta: false },
          ],
        },
      ],
    });
    const quizResource = {
      guid: 'q1',
      type: 'ASSIGNMENT',
      title: '[QUIZ] Repaso',
      quizConfig: stored,
      attachmentKey: null,
      fileUrl: null,
    };
    const { service } = serviceWith(
      {
        course: { findUnique: async () => ({ guid: 'curso-1', modules: [{ guid: 'm1', resources: [quizResource] }] }) },
      },
      PUBLISHED,
    );

    const course = await service.getCourseForStudent('curso-1', sessionFor('STUDENT', 'COLOMBIA', 'alumna'));
    const quiz = course.modules[0].resources[0];

    expect(quiz.quiz).toEqual({ allowedAttempts: 2, timeLimitMinutes: 15, questionCount: 1 });
    expect(quiz.quizConfig).toBeNull();
    expect(JSON.stringify(course)).not.toContain('Velocidad');
    expect(JSON.stringify(course)).not.toContain('es_correcta');
  });
});

/**
 * Pasar a Borrador un curso publicado.
 *
 * Se impide mientras alguien se examina, pero sólo cuenta quien lo hace de verdad ahora: un
 * intento abandonado no puede dejar el curso sin poder editarse nunca más.
 */
describe('CoursesService · paso a Borrador con cuestionarios abiertos', () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  const quizWithLimit = (minutes: number) =>
    JSON.stringify({
      intentos_permitidos: 0,
      tiempo_minutos: minutes,
      preguntas: [
        {
          id: 'p1',
          enunciado: 'x',
          opciones: [
            { id: 'a', texto: 'sí', es_correcta: true },
            { id: 'b', texto: 'no', es_correcta: false },
          ],
        },
      ],
    });

  function withOpenAttempts(attempts: { startedAt: Date; limit: number }[]) {
    const queries: { where: unknown }[] = [];
    const update = jest.fn(async () => ({ ...PUBLISHED, status: 'DRAFT' }));
    const { service } = serviceWith(
      {
        submission: {
          findMany: async (query: { where: unknown }) => {
            queries.push(query);
            return attempts.map((attempt, i) => ({
              userGuid: `alumno-${i}`,
              assignmentGuid: `quiz-${i}`,
              startedAt: attempt.startedAt,
            }));
          },
        },
        resource: {
          findMany: async () =>
            attempts.map((attempt, i) => ({ guid: `quiz-${i}`, quizConfig: quizWithLimit(attempt.limit) })),
        },
        course: { update },
      },
      PUBLISHED,
    );
    return { service, update, queries };
  }

  it('lo impide mientras alguien está dentro de su tiempo', async () => {
    const { service, update } = withOpenAttempts([{ startedAt: minutesAgo(5), limit: 30 }]);

    await expect(service.updateCourse('curso-1', { status: 'DRAFT' }, ADMIN)).rejects.toThrow(
      /un estudiante está realizando un cuestionario/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('no cuenta un intento cronometrado cuyo tiempo ya pasó', async () => {
    const { service, update } = withOpenAttempts([{ startedAt: minutesAgo(40), limit: 30 }]);

    await service.updateCourse('curso-1', { status: 'DRAFT' }, ADMIN);

    expect(update).toHaveBeenCalled();
  });

  it('no cuenta un intento sin límite abandonado hace horas, pero sí uno reciente', async () => {
    const abandoned = withOpenAttempts([{ startedAt: minutesAgo(5 * 60), limit: 0 }]);
    await abandoned.service.updateCourse('curso-1', { status: 'DRAFT' }, ADMIN);
    expect(abandoned.update).toHaveBeenCalled();

    const recent = withOpenAttempts([{ startedAt: minutesAgo(20), limit: 0 }]);
    await expect(recent.service.updateCourse('curso-1', { status: 'DRAFT' }, ADMIN)).rejects.toThrow(/Borrador/);
  });

  it('sólo mira intentos de alumnos con matrícula activa en el curso', async () => {
    const { service, queries } = withOpenAttempts([]);

    await service.updateCourse('curso-1', { status: 'DRAFT' }, ADMIN);

    expect(queries[0].where).toMatchObject({
      user: { enrollments: { some: { courseGuid: 'curso-1', active: true } } },
    });
  });
});

/**
 * Las reglas de un curso publicado —nota mínima, orden, horas— rigen lo que ya hacen sus
 * alumnos: como el contenido, sólo se cambian en Borrador. El cupo sí, sin quedar por debajo
 * de los ya matriculados.
 */
describe('CoursesService · ficha de un curso publicado', () => {
  function publishedWith(enrolled: number) {
    const update = jest.fn(async () => ({ ...PUBLISHED, maxStudents: 30 }));
    const steps: string[] = [];
    const { service } = serviceWith(
      {
        $queryRaw: async () => {
          steps.push('bloqueo del curso');
          return [{ maxStudents: 10 }];
        },
        enrollment: {
          findMany: async () => [],
          count: async () => {
            steps.push('recuento');
            return enrolled;
          },
        },
        course: { update },
      },
      PUBLISHED,
    );
    return { service, update, steps };
  }

  it('no deja cambiar la nota mínima, el orden ni las horas', async () => {
    for (const change of [{ passingScore: 30 }, { strictOrder: false }, { durationHours: 2 }, { title: 'Otro' }]) {
      const { service, update } = publishedWith(0);

      await expect(service.updateCourse('curso-1', change, ADMIN)).rejects.toThrow(/Borrador/);
      expect(update).not.toHaveBeenCalled();
    }
  });

  it('deja ampliar el cupo, contando las plazas con el curso bloqueado', async () => {
    const { service, update, steps } = publishedWith(12);

    await service.updateCourse('curso-1', { maxStudents: 30 }, ADMIN);

    expect(steps).toEqual(['bloqueo del curso', 'recuento']);
    expect(update).toHaveBeenCalled();
  });

  it('no deja un cupo por debajo de los ya matriculados', async () => {
    const { service, update } = publishedWith(12);

    await expect(service.updateCourse('curso-1', { maxStudents: 5 }, ADMIN)).rejects.toThrow(
      'El curso ya tiene 12 estudiantes matriculados: el cupo no puede ser menor.',
    );
    expect(update).not.toHaveBeenCalled();
  });
});

/** La nota mínima decide quién aprobó: una vez aplicada a algo calificado, ya no se cambia. */
describe('CoursesService · nota mínima', () => {
  function draftWith(graded: boolean) {
    const update = jest.fn(async () => ({ ...DRAFT, passingScore: 70 }));
    const { service } = serviceWith(
      {
        submission: { findFirst: async () => (graded ? { guid: 'entrega-1' } : null) },
        course: { update },
      },
      { ...DRAFT, passingScore: 80 },
    );
    return { service, update };
  }

  it('con algo ya calificado no se cambia', async () => {
    const { service, update } = draftWith(true);

    await expect(service.updateCourse('curso-1', { passingScore: 70 }, ADMIN)).rejects.toThrow(/ya no puede cambiarse/);
    expect(update).not.toHaveBeenCalled();
  });

  it('sin nada calificado se cambia, y guardar la misma no pregunta', async () => {
    const { service, update } = draftWith(false);
    await service.updateCourse('curso-1', { passingScore: 70 }, ADMIN);
    expect(update).toHaveBeenCalled();

    const unchanged = draftWith(true);
    await unchanged.service.updateCourse('curso-1', { passingScore: 80 }, ADMIN);
    expect(unchanged.update).toHaveBeenCalled();
  });
});

/** Los eventos de un curso llegan a quien lo tiene delante, no a toda la sede. */
describe('CoursesService · avisos en tiempo real', () => {
  const enrolled = { findMany: async () => [{ userGuid: 'alumna' }] };

  it('un curso nuevo sólo se anuncia al personal: es un borrador', async () => {
    const { service, emitted } = serviceWith({
      user: { findFirst: async () => ({ guid: 'profe' }) },
      course: { create: async () => ({ guid: 'curso-2', title: 'Nuevo' }) },
    });

    await service.createCourse({ title: 'Nuevo', teacherGuid: 'profe' }, ADMIN);

    expect(emitted).toEqual([{ event: 'course:created', to: 'administradores y profe' }]);
  });

  it('un cambio llega al personal y a los matriculados', async () => {
    const { service, emitted } = serviceWith({
      enrollment: enrolled,
      course: { update: async () => ({ ...DRAFT, title: 'Otro título' }) },
    });

    await service.updateCourse('curso-1', { title: 'Otro título' }, ADMIN);

    expect(emitted).toEqual([
      { event: 'course:updated', to: 'administradores y admin' },
      { event: 'course:updated', to: 'alumna' },
    ]);
  });

  it('borrar el curso avisa al personal y a quienes estaban matriculados', async () => {
    const { service, emitted } = serviceWith({ enrollment: enrolled });

    await service.deleteCourse('curso-1', ADMIN);

    expect(emitted).toEqual([
      { event: 'course:deleted', to: 'administradores y admin' },
      { event: 'course:deleted', to: 'alumna' },
    ]);
  });
});

/**
 * Mantenimiento y reactivación: correo y aviso en la campana a quien tiene el curso en
 * marcha. Quien ya lo terminó no tiene nada que retomar.
 */
describe('CoursesService · avisos de mantenimiento', () => {
  function withEnrollments() {
    const queries: { where: Record<string, unknown> }[] = [];
    const findMany = async (query: { where: Record<string, unknown> }) => {
      queries.push(query);
      return 'completedAt' in query.where
        ? [{ user: { guid: 'alumna', email: 'alumna@pesv.test', firstName: 'Ana' } }]
        : [{ userGuid: 'alumna' }, { userGuid: 'egresada' }];
    };
    return { queries, enrollment: { findMany } };
  }

  it('al pasar a Borrador avisa en la campana y por correo sólo a quien no lo ha terminado', async () => {
    const { queries, enrollment } = withEnrollments();
    const { service, notifications, mail, emitted } = serviceWith(
      {
        enrollment,
        submission: { findMany: async () => [] },
        course: { update: async () => ({ ...PUBLISHED, status: 'DRAFT' }) },
      },
      PUBLISHED,
    );

    await service.updateCourse('curso-1', { status: 'DRAFT' }, ADMIN);
    await flushPromises();

    expect(queries.map((query) => query.where)).toContainEqual({
      courseGuid: 'curso-1',
      active: true,
      completedAt: null,
    });
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userGuid: 'alumna', type: 'COURSE_ANNOUNCEMENT', actionUrl: '/courses/curso-1' }),
    );
    expect(mail.sendCourseUnderMaintenance).toHaveBeenCalledTimes(1);
    // La pantalla sí se entera en todos los matriculados: también quien lo repasa.
    expect(emitted).toContainEqual({ event: 'course:maintenance', to: 'alumna, egresada' });
  });

  function publish(withActivity: boolean) {
    const { enrollment } = withEnrollments();
    const activity = withActivity ? { id: 1 } : null;
    return serviceWith(
      {
        enrollment,
        resourceProgress: { findFirst: async () => activity },
        submission: { findFirst: async () => null },
        course: { update: async () => ({ ...PUBLISHED }) },
      },
      { ...PUBLISHED, status: 'DRAFT' },
    );
  }

  it('al volver a publicarse tras un mantenimiento avisa de la reactivación con enlace al curso', async () => {
    const { service, notifications, mail } = publish(true);

    await service.updateCourse('curso-1', { status: 'PUBLISHED' }, ADMIN);
    await flushPromises();

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userGuid: 'alumna', type: 'COURSE_REACTIVATED', actionUrl: '/courses/curso-1' }),
    );
    expect(mail.sendCourseReactivated).toHaveBeenCalledTimes(1);
  });

  it('la primera publicación no habla de mantenimiento: avisa de que el curso ya está disponible', async () => {
    const { service, notifications, mail } = publish(false);

    await service.updateCourse('curso-1', { status: 'PUBLISHED' }, ADMIN);
    await flushPromises();

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COURSE_WELCOME', title: 'Tu curso ya está disponible' }),
    );
    expect(mail.sendCourseReactivated).not.toHaveBeenCalled();
    expect(mail.sendEnrollment).toHaveBeenCalledTimes(1);
  });
});
