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
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    const mexico = fakeStream();
    service.register(sessionFor('ADMIN', 'MEXICO', 'admin-mx'), mexico.res as never);

    expect(mexico.events.find((e) => e.event === 'course:editing-sync')?.data).toEqual({});
  });

  it('quien se conecta en Colombia sí ve los de su sede', () => {
    service.register(sessionFor('TEACHER', 'COLOMBIA', 'profe-co'), fakeStream().res as never);
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    const colombia = fakeStream();
    service.register(sessionFor('ADMIN', 'COLOMBIA', 'admin-co'), colombia.res as never);

    expect(colombia.events.find((e) => e.event === 'course:editing-sync')?.data).toEqual({ 'curso-co': editorCO });
  });

  it('el aviso de edición llega al personal del curso, no a los alumnos ni a otros examinadores', () => {
    const admin = fakeStream();
    const student = fakeStream();
    const otherTeacher = fakeStream();
    service.register(sessionFor('ADMIN', 'COLOMBIA', 'admin-co'), admin.res as never);
    service.register(sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'), student.res as never);
    service.register(sessionFor('TEACHER', 'COLOMBIA', 'otro-profe'), otherTeacher.res as never);

    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);
    service.releaseCourseLock('curso-co', 'profe-co');

    const editing = (stream: ReturnType<typeof fakeStream>) =>
      stream.events.filter((e) => e.event.startsWith('course:editing') && e.event !== 'course:editing-sync');
    expect(editing(admin).map((e) => e.event)).toEqual(['course:editing', 'course:editing-released']);
    expect(editing(student)).toEqual([]);
    expect(editing(otherTeacher)).toEqual([]);
  });

  it('al conectar, un alumno no recibe los cursos en edición', () => {
    service.register(sessionFor('TEACHER', 'COLOMBIA', 'profe-co'), fakeStream().res as never);
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    const student = fakeStream();
    service.register(sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'), student.res as never);

    expect(student.events.find((e) => e.event === 'course:editing-sync')?.data).toEqual({});
  });

  it('la presencia inicial sólo incluye a los conectados de la misma sede', () => {
    service.register(sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'), fakeStream().res as never);

    const mexico = fakeStream();
    service.register(sessionFor('STUDENT', 'MEXICO', 'alumno-mx'), mexico.res as never);

    expect(mexico.events.find((e) => e.event === 'presence:sync')?.data).toEqual({ onlineUsers: ['alumno-mx'] });
  });

  it('sólo quien tiene el aviso de edición puede liberarlo', () => {
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    service.releaseCourseLock('curso-co', 'otro-profe');
    expect(service.acquireCourseEdit('curso-co', 'profe-co', { ...editorCO, guid: 'otro-profe' }).guid).toBe(
      'profe-co',
    );

    service.releaseCourseLock('curso-co', 'profe-co');
    expect(service.acquireCourseEdit('curso-co', 'profe-co', { ...editorCO, guid: 'otro-profe' }).guid).toBe(
      'otro-profe',
    );
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

/**
 * Lo que pasa cuando el servidor corta una sesión (cuenta borrada, cambio de rol, entrada
 * desde otro dispositivo). Tiene que dejar el mismo rastro que un cierre del navegador: si
 * no, la persona seguiría «en línea» y sus cursos «en edición» hasta reiniciar la API.
 */
describe('RealtimeService · cierre de sesiones', () => {
  let service: RealtimeService;

  beforeEach(() => {
    service = new RealtimeService();
  });

  afterEach(() => service.onModuleDestroy());

  const editorCO = { guid: 'profe-co', name: 'Carlos Pérez', role: 'TEACHER' as const, country: 'COLOMBIA' as const };

  it('al revocar la sesión se anuncia la desconexión y se libera el aviso de edición', () => {
    const admin = fakeStream();
    service.register(sessionFor('ADMIN', 'COLOMBIA', 'admin-co'), admin.res as never);
    service.register(sessionFor('TEACHER', 'COLOMBIA', 'profe-co'), fakeStream().res as never);
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    service.revokeSession('profe-co', 'account_deleted');

    expect(admin.events).toContainEqual({ event: 'presence:update', data: { guid: 'profe-co', status: 'offline' } });
    expect(admin.events).toContainEqual({ event: 'course:editing-released', data: { courseGuid: 'curso-co' } });
    expect(service.acquireCourseEdit('curso-co', 'profe-co', { ...editorCO, guid: 'otro-profe' }).guid).toBe(
      'otro-profe',
    );
  });

  it('cada aviso de presencia lleva sólo el cambio, no la lista entera de la sede', () => {
    const admin = fakeStream();
    service.register(sessionFor('ADMIN', 'COLOMBIA', 'admin-co'), admin.res as never);
    service.register(sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'), fakeStream().res as never);

    expect(admin.events).toContainEqual({ event: 'presence:update', data: { guid: 'alumno-co', status: 'online' } });
  });

  it('corta el flujo de un cliente que dejó de leer, y lo da por desconectado', () => {
    const admin = fakeStream();
    const stalled = fakeStream();
    service.register(sessionFor('ADMIN', 'COLOMBIA', 'admin-co'), admin.res as never);
    service.register(sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'), stalled.res as never);
    Object.assign(stalled.res, { writableLength: 2 * 1024 * 1024 });

    service.emitToCountry('config:updated', {}, 'COLOMBIA');

    expect(stalled.events.some((e) => e.event === 'config:updated')).toBe(false);
    expect(admin.events).toContainEqual({ event: 'presence:update', data: { guid: 'alumno-co', status: 'offline' } });
  });
});

/**
 * Con más pestañas que el máximo, la más antigua cede su flujo. Tiene que saberlo, porque
 * si se reconectara sola echaría a otra y las pestañas se turnarían sin fin.
 */
describe('RealtimeService · pestañas de más', () => {
  let service: RealtimeService;

  beforeEach(() => {
    service = new RealtimeService();
  });

  afterEach(() => service.onModuleDestroy());

  it('avisa a la pestaña más antigua de que otra ocupó su sitio, sin darla por desconectada', () => {
    const tabs = Array.from({ length: 6 }, () => fakeStream());
    const admin = fakeStream();
    service.register(sessionFor('ADMIN', 'COLOMBIA', 'admin-co'), admin.res as never);
    tabs.forEach((tab) => service.register(sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'), tab.res as never));

    expect(tabs[0].events.map((e) => e.event)).toContain('stream:superseded');
    expect(tabs.slice(1).some((tab) => tab.events.some((e) => e.event === 'stream:superseded'))).toBe(false);
    expect(admin.events).not.toContainEqual({
      event: 'presence:update',
      data: { guid: 'alumno-co', status: 'offline' },
    });
  });
});
