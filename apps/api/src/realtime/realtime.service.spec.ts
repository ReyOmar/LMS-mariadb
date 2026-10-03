import { RealtimeService } from './realtime.service';
import { sessionFor } from '../common/testing/test-campus';

/**
 * Estado que se reparte al conectar.
 *
 * Al abrir el flujo, cada navegador recibe quién está en línea y qué cursos se están
 * editando. Ese estado vive en memoria para todas las sedes a la vez, así que lo que se
 * comprueba es que cada uno reciba sólo el de la suya.
 */

/** Flujo SSE en memoria que guarda los eventos escritos. */
function fakeStream() {
  const events: { event: string; data: unknown }[] = [];
  return {
    events,
    res: {
      writableEnded: false,
      write: (chunk: string) => {
        const match = chunk.match(/^event: (.+)\ndata: (.+)\n\n$/);
        if (match) events.push({ event: match[1], data: (JSON.parse(match[2]) as { data: unknown }).data });
        return true;
      },
      end: () => undefined,
    },
  };
}

describe('RealtimeService · estado inicial por sede', () => {
  let service: RealtimeService;

  beforeEach(() => {
    service = new RealtimeService();
  });

  afterEach(() => service.onModuleDestroy());

  const editorCO = { guid: 'profe-co', name: 'Carlos Pérez', role: 'TEACHER' as const, country: 'COLOMBIA' as const };

  it('quien se conecta en México no ve los cursos que se editan en Colombia', () => {
    service.register(sessionFor('TEACHER', 'COLOMBIA', 'profe-co'), fakeStream().res as never);
    service.acquireCourseEdit('curso-co', editorCO);

    const mexico = fakeStream();
    service.register(sessionFor('ADMIN', 'MEXICO', 'admin-mx'), mexico.res as never);

    expect(mexico.events.find((e) => e.event === 'course:editing-sync')?.data).toEqual({});
  });

  it('quien se conecta en Colombia sí ve los de su sede', () => {
    service.register(sessionFor('TEACHER', 'COLOMBIA', 'profe-co'), fakeStream().res as never);
    service.acquireCourseEdit('curso-co', editorCO);

    const colombia = fakeStream();
    service.register(sessionFor('ADMIN', 'COLOMBIA', 'admin-co'), colombia.res as never);

    expect(colombia.events.find((e) => e.event === 'course:editing-sync')?.data).toEqual({ 'curso-co': editorCO });
  });

  it('la presencia inicial sólo incluye a los conectados de la misma sede', () => {
    service.register(sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'), fakeStream().res as never);

    const mexico = fakeStream();
    service.register(sessionFor('STUDENT', 'MEXICO', 'alumno-mx'), mexico.res as never);

    expect(mexico.events.find((e) => e.event === 'presence:sync')?.data).toEqual({ onlineUsers: ['alumno-mx'] });
  });

  it('sólo quien tiene el aviso de edición puede liberarlo', () => {
    service.acquireCourseEdit('curso-co', editorCO);

    service.releaseCourseLock('curso-co', 'otro-profe');
    expect(service.acquireCourseEdit('curso-co', { ...editorCO, guid: 'otro-profe' }).guid).toBe('profe-co');

    service.releaseCourseLock('curso-co', 'profe-co');
    expect(service.acquireCourseEdit('curso-co', { ...editorCO, guid: 'otro-profe' }).guid).toBe('otro-profe');
  });
});

describe('RealtimeService · avisos al personal de un curso', () => {
  let service: RealtimeService;

  beforeEach(() => {
    service = new RealtimeService();
  });

  afterEach(() => service.onModuleDestroy());

  const received = (stream: ReturnType<typeof fakeStream>) =>
    stream.events.filter((e) => e.event === 'submission:graded').length;

  it('llega a los administradores de la sede y al examinador del curso, no a alumnos ni a otra sede', () => {
    const adminCO = fakeStream();
    const teacherCO = fakeStream();
    const otherTeacherCO = fakeStream();
    const studentCO = fakeStream();
    const adminMX = fakeStream();
    service.register(sessionFor('ADMIN', 'COLOMBIA', 'admin-co'), adminCO.res as never);
    service.register(sessionFor('TEACHER', 'COLOMBIA', 'profe-co'), teacherCO.res as never);
    service.register(sessionFor('TEACHER', 'COLOMBIA', 'otro-profe'), otherTeacherCO.res as never);
    service.register(sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'), studentCO.res as never);
    service.register(sessionFor('ADMIN', 'MEXICO', 'admin-mx'), adminMX.res as never);

    service.emitToCourseStaff('submission:graded', { score: 90 }, 'COLOMBIA', 'profe-co');

    expect(received(adminCO)).toBe(1);
    expect(received(teacherCO)).toBe(1);
    expect(received(otherTeacherCO)).toBe(0);
    expect(received(studentCO)).toBe(0);
    expect(received(adminMX)).toBe(0);
  });
});
