import type { Course, CourseModule } from '@/types/models';

function mapModules(course: Course, change: (courseModule: CourseModule) => CourseModule): Course {
  return { ...course, modules: course.modules?.map(change) };
}

export function withRenamedModule(course: Course, moduleGuid: string, title: string): Course {
  return mapModules(course, (courseModule) =>
    courseModule.guid === moduleGuid ? { ...courseModule, title } : courseModule,
  );
}

export function withoutModule(course: Course, moduleGuid: string): Course {
  return { ...course, modules: course.modules?.filter((courseModule) => courseModule.guid !== moduleGuid) };
}

export function withoutResource(course: Course, resourceGuid: string): Course {
  return mapModules(course, (courseModule) => ({
    ...courseModule,
    resources: courseModule.resources?.filter((resource) => resource.guid !== resourceGuid),
  }));
}

/** Lleva el recurso de la posición `from` a `to` dentro de su módulo. */
export function withMovedResource(course: Course, moduleGuid: string, from: number, to: number): Course {
  return mapModules(course, (courseModule) => {
    if (courseModule.guid !== moduleGuid || !courseModule.resources) return courseModule;
    const resources = [...courseModule.resources];
    const [moved] = resources.splice(from, 1);
    resources.splice(to, 0, moved);
    return { ...courseModule, resources };
  });
}

/** Orden de los recursos de un módulo, como lo espera la API. */
export function resourceOrder(course: Course, moduleGuid: string): string[] {
  const courseModule = course.modules?.find((candidate) => candidate.guid === moduleGuid);
  return courseModule?.resources?.map((resource) => resource.guid) ?? [];
}
