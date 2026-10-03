import { PrismaService } from '../../prisma/prisma.service';
import { Country } from '../domain/country';
import { JwtPayload, UserRole } from '../interfaces/jwt-payload.interface';

/**
 * Campus en memoria para probar las reglas de acceso sin base de datos.
 *
 * No es un mock que devuelve lo que se le dice: **interpreta el `where` de cada consulta**.
 * Esa diferencia es lo que da valor a las pruebas — si alguien quitara el filtro por país
 * de `CourseAccessService`, el doble devolvería el curso de la otra sede y la prueba de
 * aislamiento fallaría. Con un mock corriente, pasaría igual.
 *
 * Cubre sólo las consultas que hacen las reglas de acceso. Cualquier otra lanza, para que
 * añadir una consulta nueva obligue a decidir cómo debe comportarse en las pruebas.
 */

interface TestCourse {
  guid: string;
  country: Country;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  teacherGuid: string;
  passingScore: number;
}

interface TestModule {
  guid: string;
  courseGuid: string;
  position: number;
}

interface TestResource {
  guid: string;
  moduleGuid: string;
  title: string;
  type: string;
  position: number;
}

interface TestEnrollment {
  userGuid: string;
  courseGuid: string;
  active: boolean;
}

interface TestSubmission {
  guid: string;
  userGuid: string;
  assignmentGuid: string;
  status: string;
  score: number | null;
}

interface CampusContent {
  courses?: TestCourse[];
  modules?: TestModule[];
  resources?: TestResource[];
  enrollments?: TestEnrollment[];
  submissions?: TestSubmission[];
}

export class TestCampus {
  private readonly courses: TestCourse[];
  private readonly modules: TestModule[];
  private readonly resources: TestResource[];
  private readonly enrollments: TestEnrollment[];
  private readonly submissions: TestSubmission[];

  constructor(content: CampusContent = {}) {
    this.courses = content.courses ?? [];
    this.modules = content.modules ?? [];
    this.resources = content.resources ?? [];
    this.enrollments = content.enrollments ?? [];
    this.submissions = content.submissions ?? [];
  }

  /** Doble de `PrismaService` con las consultas que usan las reglas de acceso. */
  get prisma(): PrismaService {
    return {
      course: {
        findFirst: ({ where }: { where: { guid: string; country?: Country } }) =>
          Promise.resolve(
            this.courses.find(
              (course) =>
                course.guid === where.guid && (where.country === undefined || course.country === where.country),
            ) ?? null,
          ),
      },

      courseModule: {
        findUnique: ({ where }: { where: { guid: string } }) =>
          Promise.resolve(this.modules.find((module) => module.guid === where.guid) ?? null),
      },

      resource: {
        findUnique: ({ where }: { where: { guid: string } }) => {
          const resource = this.resources.find((candidate) => candidate.guid === where.guid);
          if (!resource) return Promise.resolve(null);
          return Promise.resolve({ ...resource, module: this.moduleOf(resource) });
        },

        findMany: ({ where }: { where: { module: { courseGuid: string } } }) => {
          const courseItems = this.resources
            .filter((resource) => this.moduleOf(resource)?.courseGuid === where.module.courseGuid)
            .sort((a, b) => this.modulePosition(a) - this.modulePosition(b) || a.position - b.position);
          return Promise.resolve(courseItems);
        },
      },

      enrollment: {
        findUnique: ({ where }: { where: { userGuid_courseGuid: { userGuid: string; courseGuid: string } } }) => {
          const { userGuid, courseGuid } = where.userGuid_courseGuid;
          return Promise.resolve(
            this.enrollments.find(
              (enrollment) => enrollment.userGuid === userGuid && enrollment.courseGuid === courseGuid,
            ) ?? null,
          );
        },
      },

      submission: {
        findUnique: ({ where }: { where: { guid: string } }) => {
          const submission = this.submissions.find((candidate) => candidate.guid === where.guid);
          if (!submission) return Promise.resolve(null);

          const assignment = this.resources.find((resource) => resource.guid === submission.assignmentGuid);
          return Promise.resolve({
            ...submission,
            assignment: assignment ? { title: assignment.title, module: this.moduleOf(assignment) } : null,
          });
        },
      },
    } as unknown as PrismaService;
  }

  private moduleOf(resource: TestResource): TestModule | null {
    return this.modules.find((module) => module.guid === resource.moduleGuid) ?? null;
  }

  private modulePosition(resource: TestResource): number {
    return this.moduleOf(resource)?.position ?? 0;
  }
}

/** Construye una identidad autenticada para las pruebas. */
export function sessionFor(role: UserRole, country: Country, guid = `usuario-${role.toLowerCase()}`): JwtPayload {
  return {
    sub: guid,
    email: `${guid}@pesv.test`,
    role,
    country,
    jti: `sesion-${guid}`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}
