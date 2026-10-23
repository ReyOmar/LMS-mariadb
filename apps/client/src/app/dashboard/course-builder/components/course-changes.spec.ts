import type { Course } from '@/types/models';
import {
  changedFields,
  deletionWarning,
  moduleDeletionWarning,
  publishBlocker,
  resourceDeletionWarning,
  unpublishWarning,
} from './course-changes';

const COURSE = { guid: 'c1', title: 'Manejo defensivo', durationHours: 8, maxStudents: null } as Course;

describe('changedFields', () => {
  it('sólo envía lo que difiere del curso tal como está ahora', () => {
    expect(changedFields(COURSE, { title: 'Manejo defensivo', durationHours: 10 })).toEqual({ durationHours: 10 });
  });

  it('sin diferencias no hay nada que enviar', () => {
    expect(changedFields(COURSE, { title: 'Manejo defensivo', maxStudents: null })).toBeNull();
  });
});

describe('publishBlocker', () => {
  const withResources = (resources: object[]) => ({ modules: [{ resources }] }) as unknown as Course;

  it('no deja publicar un cuestionario sin preguntas ni un enlace sin dirección, y los nombra', () => {
    const course = withResources([
      { type: 'ASSIGNMENT', title: '[QUIZ] Normativa', quizConfig: null },
      { type: 'LINK', title: 'Vídeo de señales', contentHtml: '' },
      { type: 'TEXT', title: 'Lectura', contentHtml: '' },
    ]);

    expect(publishBlocker(course, false)).toContain('«Normativa», «Vídeo de señales»');
  });

  it('con todo completo se puede publicar', () => {
    const course = withResources([
      {
        type: 'ASSIGNMENT',
        title: '[QUIZ] Normativa',
        quizConfig: JSON.stringify({ allowedAttempts: 1, timeLimitMinutes: 0, questions: [{}] }),
      },
      { type: 'LINK', title: 'Vídeo', contentHtml: 'https://youtu.be/abc' },
    ]);

    expect(publishBlocker(course, false)).toBeNull();
  });

  it('con una portada elegida sin guardar no deja publicar: después ya no podría guardarse ni descartarse', () => {
    expect(publishBlocker(withResources([]), true)).toContain('guarda o descarta la portada elegida');
  });
});

describe('avisos con la cifra de matriculados', () => {
  it('al borrar el curso dice cuántos perderán el acceso y que los certificados se conservan', () => {
    const warning = deletionWarning({ modules: [] }, 3);

    expect(warning).toContain('Ahora hay 3 estudiantes matriculados, que perderán el acceso.');
    expect(warning).toContain('Los certificados ya emitidos se conservan');
  });

  it('al pasar a Borrador avisa del mantenimiento sin prometer que nada cambia para los alumnos', () => {
    expect(unpublishWarning(1)).toContain('verán «Curso en mantenimiento»');
    expect(unpublishWarning(1)).toContain('1 estudiante matriculado, que perderá el acceso hasta entonces');
  });

  it('si no se pudo saber cuántos hay, el aviso va sin la cifra', () => {
    expect(unpublishWarning(null)).not.toContain('Ahora hay');
  });
});

describe('avisos al borrar contenido', () => {
  const text = { guid: 'r1', title: 'Lectura', type: 'TEXT' } as const;
  const task = { guid: 'r2', title: 'Informe', type: 'ASSIGNMENT' } as const;

  it('una tarea o un cuestionario avisa de que se pierden las entregas de los estudiantes', () => {
    expect(resourceDeletionWarning(task)).toBe(
      'Se borrará «Informe» y, con él, las entregas de los estudiantes, con sus notas y sus archivos. No se puede deshacer.',
    );
    expect(resourceDeletionWarning(text)).toBe('Se borrará «Lectura». No se puede deshacer.');
  });

  it('un módulo dice cuántos recursos lleva y si se pierden entregas', () => {
    expect(moduleDeletionWarning({ title: 'Normativa', resources: [text, task] as never })).toBe(
      'Se borrará el módulo «Normativa» con sus 2 recursos y las entregas de los estudiantes, con sus notas y sus archivos. No se puede deshacer.',
    );
    expect(moduleDeletionWarning({ title: 'Vacío', resources: [] })).toBe(
      'Se borrará el módulo «Vacío». No se puede deshacer.',
    );
  });
});
