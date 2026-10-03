import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CourseAccessService } from './course-access.service';
import { TestCampus, sessionFor } from '../common/testing/test-campus';

/**
 * Reglas de acceso a cursos.
 *
 * Es el punto por el que pasa toda decisión de «¿puede esta persona ver o tocar esto?»:
 * nadie lee cursos de otra sede, edita el curso de otro examinador ni califica entregas
 * ajenas.
 */

const COURSE_CO = {
  guid: 'curso-co',
  country: 'COLOMBIA' as const,
  title: 'Manejo defensivo',
  status: 'PUBLISHED' as const,
  teacherGuid: 'profesor-co',
  passingScore: 80,
};

const COURSE_MX = {
  guid: 'curso-mx',
  country: 'MEXICO' as const,
  title: 'Manejo defensivo',
  status: 'PUBLISHED' as const,
  teacherGuid: 'profesor-mx',
  passingScore: 80,
};

const DRAFT_CO = {
  guid: 'curso-borrador',
  country: 'COLOMBIA' as const,
  title: 'Curso en preparación',
  status: 'DRAFT' as const,
  teacherGuid: 'profesor-co',
  passingScore: 80,
};

/** Campus con las dos sedes pobladas, para poder comprobar que no se cruzan. */
function fullCampus() {
  return new TestCampus({
    courses: [COURSE_CO, COURSE_MX, DRAFT_CO],
    modules: [
      { guid: 'modulo-co', courseGuid: 'curso-co', position: 0 },
      { guid: 'modulo-co-2', courseGuid: 'curso-co', position: 1 },
      { guid: 'modulo-mx', courseGuid: 'curso-mx', position: 0 },
    ],
    resources: [
      { guid: 'recurso-co-b', moduleGuid: 'modulo-co', title: 'Segundo', type: 'TEXT', position: 1 },
      { guid: 'recurso-co-a', moduleGuid: 'modulo-co', title: 'Primero', type: 'TEXT', position: 0 },
      { guid: 'tarea-co', moduleGuid: 'modulo-co-2', title: 'Examen final', type: 'ASSIGNMENT', position: 0 },
      { guid: 'recurso-mx', moduleGuid: 'modulo-mx', title: 'Único', type: 'TEXT', position: 0 },
    ],
    enrollments: [
      { userGuid: 'alumno-co', courseGuid: 'curso-co', active: true },
      { userGuid: 'alumno-baja', courseGuid: 'curso-co', active: false },
    ],
    submissions: [
      {
        guid: 'entrega-co',
        userGuid: 'alumno-co',
        assignmentGuid: 'tarea-co',
        status: 'SUBMITTED',
        score: null,
      },
    ],
  });
}

function createService() {
  return new CourseAccessService(fullCampus().prisma);
}

describe('CourseAccessService', () => {
  describe('separación entre sedes', () => {
    it('encuentra un curso de la propia sede', async () => {
      const course = await createService().courseInCountry('curso-co', 'COLOMBIA');

      expect(course.guid).toBe('curso-co');
    });

    it('no encuentra un curso de la otra sede, aunque exista', async () => {
      // El curso existe en la base; para alguien de Colombia, no debe existir.
      await expect(createService().courseInCountry('curso-mx', 'COLOMBIA')).rejects.toThrow(NotFoundException);
    });

    it('no llega a un módulo de la otra sede', async () => {
      await expect(createService().courseOfModule('modulo-mx', 'COLOMBIA')).rejects.toThrow(NotFoundException);
    });

    it('no llega a un recurso de la otra sede', async () => {
      await expect(createService().courseOfResource('recurso-mx', 'COLOMBIA')).rejects.toThrow(NotFoundException);
    });

    it('responde «no encontrado» y no «no autorizado» al pedir algo de otra sede', async () => {
      // Distinguirlos revelaría que el curso existe y en qué sede está.
      await expect(createService().courseInCountry('curso-mx', 'COLOMBIA')).rejects.not.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('quién puede gestionar un curso', () => {
    it('el administrador de la sede gestiona cualquier curso de su sede', async () => {
      const admin = sessionFor('ADMIN', 'COLOMBIA');

      await expect(createService().managedCourse('curso-co', admin)).resolves.toMatchObject({ guid: 'curso-co' });
    });

    it('el profesor gestiona sólo los cursos asignados a él', async () => {
      const own = sessionFor('TEACHER', 'COLOMBIA', 'profesor-co');

      await expect(createService().managedCourse('curso-co', own)).resolves.toMatchObject({ guid: 'curso-co' });
    });

    it('el profesor no gestiona el curso de otro examinador', async () => {
      const outsider = sessionFor('TEACHER', 'COLOMBIA', 'otro-profesor');

      await expect(createService().managedCourse('curso-co', outsider)).rejects.toThrow(ForbiddenException);
    });

    it('el administrador de la otra sede no gestiona nada de esta', async () => {
      const mexicanAdmin = sessionFor('ADMIN', 'MEXICO');

      await expect(createService().managedCourse('curso-co', mexicanAdmin)).rejects.toThrow(NotFoundException);
    });
  });

  describe('edición de contenido', () => {
    it('permite editar un curso en borrador', async () => {
      const admin = sessionFor('ADMIN', 'COLOMBIA');

      await expect(createService().editableCourse('curso-borrador', admin)).resolves.toMatchObject({
        status: 'DRAFT',
      });
    });

    it('impide editar un curso publicado', async () => {
      // Hay alumnos avanzando por él: cambiar los recursos invalidaría su progreso.
      const admin = sessionFor('ADMIN', 'COLOMBIA');

      await expect(createService().editableCourse('curso-co', admin)).rejects.toThrow(BadRequestException);
    });

    it('explica qué hacer cuando el curso está publicado', async () => {
      const admin = sessionFor('ADMIN', 'COLOMBIA');

      await expect(createService().editableCourse('curso-co', admin)).rejects.toThrow(/Borrador/);
    });
  });

  describe('contenido de un módulo o recurso', () => {
    it('el responsable edita el contenido de su curso en borrador', async () => {
      const campus = new TestCampus({
        courses: [DRAFT_CO],
        modules: [{ guid: 'm', courseGuid: 'curso-borrador', position: 0 }],
        resources: [{ guid: 'r', moduleGuid: 'm', title: 'x', type: 'TEXT', position: 0 }],
      });
      const service = new CourseAccessService(campus.prisma);
      const own = sessionFor('TEACHER', 'COLOMBIA', 'profesor-co');

      await expect(service.editableCourseOfModule('m', own)).resolves.toMatchObject({ guid: 'curso-borrador' });
      await expect(service.editableCourseOfResource('r', own)).resolves.toMatchObject({ guid: 'curso-borrador' });
    });

    it('nadie edita el contenido de un curso publicado', async () => {
      const admin = sessionFor('ADMIN', 'COLOMBIA');

      await expect(createService().editableCourseOfModule('modulo-co', admin)).rejects.toThrow(BadRequestException);
      await expect(createService().editableCourseOfResource('recurso-co-a', admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('un profesor no gestiona los recursos del curso de otro', async () => {
      const outsider = sessionFor('TEACHER', 'COLOMBIA', 'otro-profesor');

      await expect(createService().managedCourseOfResource('recurso-co-a', outsider)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('nadie llega al contenido de la otra sede', async () => {
      const mexicanAdmin = sessionFor('ADMIN', 'MEXICO');

      await expect(createService().managedCourseOfResource('recurso-co-a', mexicanAdmin)).rejects.toThrow(
        NotFoundException,
      );
      await expect(createService().editableCourseOfModule('modulo-co', mexicanAdmin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('matrícula', () => {
    it('acepta a un alumno matriculado y activo', async () => {
      await expect(createService().ensureEnrollment('curso-co', 'alumno-co')).resolves.toBeUndefined();
    });

    it('rechaza a quien no está matriculado', async () => {
      await expect(createService().ensureEnrollment('curso-co', 'desconocido')).rejects.toThrow(ForbiddenException);
    });

    it('distingue una matrícula dada de baja de una inexistente', async () => {
      // Al alumno le sirve saber que su matrícula existió y fue retirada.
      await expect(createService().ensureEnrollment('curso-co', 'alumno-baja')).rejects.toThrow(/dada de baja/);
    });

    it('quien se dio de baja ya no llega al contenido del curso', async () => {
      const unenrolled = sessionFor('STUDENT', 'COLOMBIA', 'alumno-baja');

      await expect(createService().ensureResourceAccess('recurso-co-a', unenrolled)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('acceso de un alumno al contenido', () => {
    it('deja entrar a un alumno matriculado en un curso publicado', async () => {
      const student = sessionFor('STUDENT', 'COLOMBIA', 'alumno-co');

      await expect(createService().ensureResourceAccess('recurso-co-a', student)).resolves.toMatchObject({
        guid: 'curso-co',
      });
    });

    it('no deja entrar a un alumno sin matrícula', async () => {
      const intruder = sessionFor('STUDENT', 'COLOMBIA', 'alumno-de-otro-curso');

      await expect(createService().ensureResourceAccess('recurso-co-a', intruder)).rejects.toThrow(
        /No estás matriculado/,
      );
    });

    it('no deja entrar a un alumno de la otra sede', async () => {
      const mexicanStudent = sessionFor('STUDENT', 'MEXICO', 'alumno-co');

      await expect(createService().ensureResourceAccess('recurso-co-a', mexicanStudent)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('avisa al alumno de que el curso está en mantenimiento', async () => {
      const campus = new TestCampus({
        courses: [DRAFT_CO],
        modules: [{ guid: 'm', courseGuid: 'curso-borrador', position: 0 }],
        resources: [{ guid: 'r', moduleGuid: 'm', title: 'x', type: 'TEXT', position: 0 }],
        enrollments: [{ userGuid: 'alumno-co', courseGuid: 'curso-borrador', active: true }],
      });
      const service = new CourseAccessService(campus.prisma);
      const student = sessionFor('STUDENT', 'COLOMBIA', 'alumno-co');

      await expect(service.ensureResourceAccess('r', student)).rejects.toThrow(/mantenimiento/);
    });

    it('deja consultar el contenido al examinador responsable sin exigirle matrícula', async () => {
      const teacher = sessionFor('TEACHER', 'COLOMBIA', 'profesor-co');

      await expect(createService().ensureResourceAccess('recurso-co-a', teacher)).resolves.toMatchObject({
        guid: 'curso-co',
      });
    });

    it('no deja consultar el contenido a un examinador de otro curso', async () => {
      const outsider = sessionFor('TEACHER', 'COLOMBIA', 'otro-profesor');

      await expect(createService().ensureResourceAccess('recurso-co-a', outsider)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('calificación de entregas', () => {
    it('el examinador responsable puede calificar', async () => {
      const teacher = sessionFor('TEACHER', 'COLOMBIA', 'profesor-co');

      const { submission, course } = await createService().managedCourseOfSubmission('entrega-co', teacher);

      expect(submission.guid).toBe('entrega-co');
      expect(course.guid).toBe('curso-co');
    });

    it('otro examinador no puede calificar aunque conozca el identificador', async () => {
      const outsider = sessionFor('TEACHER', 'COLOMBIA', 'otro-profesor');

      await expect(createService().managedCourseOfSubmission('entrega-co', outsider)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('un administrador de la otra sede no puede calificar', async () => {
      const mexicanAdmin = sessionFor('ADMIN', 'MEXICO');

      await expect(createService().managedCourseOfSubmission('entrega-co', mexicanAdmin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('avisa si la entrega no existe', async () => {
      const admin = sessionFor('ADMIN', 'COLOMBIA');

      await expect(createService().managedCourseOfSubmission('inventada', admin)).rejects.toThrow(NotFoundException);
    });
  });

  describe('recorrido del curso', () => {
    it('devuelve los recursos ordenados por módulo y posición', async () => {
      // El orden importa: define la secuencia que sigue el alumno y con la que se calcula
      // su porcentaje de avance.
      const resources = await createService().getCourseResources('curso-co');

      expect(resources.map((r) => r.guid)).toEqual(['recurso-co-a', 'recurso-co-b', 'tarea-co']);
    });

    it('no incluye recursos de otros cursos', async () => {
      const resources = await createService().getCourseResources('curso-co');

      expect(resources.map((r) => r.guid)).not.toContain('recurso-mx');
    });
  });

  describe('trabajo del alumno', () => {
    const student = sessionFor('STUDENT', 'COLOMBIA', 'alumno-co');
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

    /** El curso de Colombia con el orden, el avance y las entregas pendientes indicados. */
    function serviceWithPath(
      options: {
        strictOrder?: boolean;
        completed?: string[];
        pending?: { assignmentGuid: string; submittedAt: Date }[];
      } = {},
    ) {
      const campus = fullCampus().prisma as unknown as Record<string, Record<string, unknown>>;
      const prisma = {
        ...campus,
        course: {
          ...campus.course,
          findUnique: async () => ({
            strictOrder: options.strictOrder ?? true,
            modules: [
              { resources: [{ guid: 'recurso-co-a' }, { guid: 'recurso-co-b' }] },
              { resources: [{ guid: 'tarea-co' }] },
            ],
          }),
        },
        resourceProgress: {
          findMany: async () => (options.completed ?? []).map((resourceGuid) => ({ resourceGuid })),
        },
        submission: { ...campus.submission, findMany: async () => options.pending ?? [] },
      };
      return new CourseAccessService(prisma as never);
    }

    it('sólo un estudiante presenta un cuestionario o entrega una tarea', async () => {
      const teacher = sessionFor('TEACHER', 'COLOMBIA', 'profesor-co');
      const admin = sessionFor('ADMIN', 'COLOMBIA');

      await expect(createService().studentResourceAccess('tarea-co', teacher)).rejects.toThrow(ForbiddenException);
      await expect(createService().studentResourceAccess('tarea-co', admin)).rejects.toThrow(/Sólo los estudiantes/);
      await expect(createService().studentResourceAccess('tarea-co', student)).resolves.toMatchObject({
        guid: 'curso-co',
      });
    });

    it('con orden estricto rechaza un recurso cuyos anteriores no están completados', async () => {
      const service = serviceWithPath({ completed: ['recurso-co-a'] });

      await expect(service.unlockedResourceAccess('tarea-co', student)).rejects.toThrow(/bloqueado/);
    });

    it('deja pasar cuando los anteriores están completados', async () => {
      const service = serviceWithPath({ completed: ['recurso-co-a', 'recurso-co-b'] });

      await expect(service.unlockedResourceAccess('tarea-co', student)).resolves.toMatchObject({ guid: 'curso-co' });
    });

    it('una entrega que lleva demasiado esperando nota cuenta como hecha, igual que en el visor', async () => {
      const waiting = (hours: number) =>
        serviceWithPath({
          completed: ['recurso-co-a'],
          pending: [{ assignmentGuid: 'recurso-co-b', submittedAt: hoursAgo(hours) }],
        });

      await expect(waiting(49).unlockedResourceAccess('tarea-co', student)).resolves.toMatchObject({
        guid: 'curso-co',
      });
      await expect(waiting(1).unlockedResourceAccess('tarea-co', student)).rejects.toThrow(/bloqueado/);
    });

    it('sin orden estricto no se exige el recorrido', async () => {
      const service = serviceWithPath({ strictOrder: false });

      await expect(service.unlockedResourceAccess('tarea-co', student)).resolves.toMatchObject({ guid: 'curso-co' });
    });

    it('el personal no llega a la comprobación del recorrido', async () => {
      const teacher = sessionFor('TEACHER', 'COLOMBIA', 'profesor-co');

      await expect(serviceWithPath().unlockedResourceAccess('recurso-co-a', teacher)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
