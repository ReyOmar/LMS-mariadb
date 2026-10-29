import { RealtimeService } from './realtime.service';
import { sessionFor } from '../common/testing/test-campus';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/**
 * Tiempo real por consultas: cada pestaña pregunta qué ha pasado desde su última consulta.
 *
 * Los eventos, la presencia y los cursos en edición viven en memoria para todas las sedes a la
 * vez, así que lo que se comprueba es que a cada uno le llegue sólo lo suyo, que nada se pierda
 * sin que el navegador lo sepa y que quien se va deje de contar como en línea.
 */

/** Una pestaña que pregunta como el navegador: la primera vez sin marca, después con la última. */
function tab(service: RealtimeService, user: JwtPayload) {
  let cursor: number | null = null;
  const events: { event: string; data: unknown }[] = [];
  const poll = () => {
    const batch = service.poll(user, cursor);
    cursor = batch.cursor;
    events.push(...batch.events.map(({ event, data }) => ({ event, data })));
    return batch;
  };
  poll();
  return {
    events,
    poll,
    received: (name: string) => events.filter((e) => e.event === name),
    /** Lo que llegó aparte del estado inicial. */
    news: () => events.filter((e) => !SYNC_EVENTS.includes(e.event)),
  };
}

const SYNC_EVENTS = ['presence:sync', 'course:editing-sync'];

const editorCO = { guid: 'profe-co', name: 'Carlos Pérez', role: 'TEACHER' as const, country: 'COLOMBIA' as const };

let service: RealtimeService;

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-10-29T10:00:00Z') });
  service = new RealtimeService();
});

afterEach(() => {
  service.onModuleDestroy();
  jest.useRealTimers();
});

describe('RealtimeService · estado inicial por sede', () => {
  it('quien llega en México no ve los cursos que se editan en Colombia; en Colombia, sí', () => {
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    const mexico = tab(service, sessionFor('ADMIN', 'MEXICO', 'admin-mx'));
    const colombia = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));

    expect(mexico.received('course:editing-sync')[0].data).toEqual({});
    expect(colombia.received('course:editing-sync')[0].data).toEqual({ 'curso-co': editorCO });
  });

  it('un alumno no recibe los cursos en edición', () => {
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    const student = tab(service, sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'));

    expect(student.received('course:editing-sync')[0].data).toEqual({});
  });

  it('la presencia inicial sólo incluye a los de la misma sede', () => {
    tab(service, sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'));

    const mexico = tab(service, sessionFor('STUDENT', 'MEXICO', 'alumno-mx'));

    expect(mexico.received('presence:sync')[0].data).toEqual({ onlineUsers: ['alumno-mx'] });
  });

  it('la primera consulta no pide recargar nada: la pantalla acaba de cargar sus datos', () => {
    expect(service.poll(sessionFor('ADMIN', 'COLOMBIA'), null).reset).toBe(false);
  });
});

describe('RealtimeService · a quién le llega cada evento', () => {
  it('el aviso de edición llega al personal del curso, no a los alumnos ni a otros examinadores', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));
    const student = tab(service, sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'));
    const otherTeacher = tab(service, sessionFor('TEACHER', 'COLOMBIA', 'otro-profe'));

    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);
    service.releaseCourseLock('curso-co', 'profe-co');
    [admin, student, otherTeacher].forEach((t) => t.poll());

    const editing = (t: ReturnType<typeof tab>) =>
      t.events.filter((e) => e.event.startsWith('course:editing') && e.event !== 'course:editing-sync');
    expect(editing(admin).map((e) => e.event)).toEqual(['course:editing', 'course:editing-released']);
    expect(editing(student)).toEqual([]);
    expect(editing(otherTeacher)).toEqual([]);
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

  it('lo del personal de un curso llega a los administradores de la sede y a su examinador', () => {
    const adminCO = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));
    const teacherCO = tab(service, sessionFor('TEACHER', 'COLOMBIA', 'profe-co'));
    const otherTeacherCO = tab(service, sessionFor('TEACHER', 'COLOMBIA', 'otro-profe'));
    const studentCO = tab(service, sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'));
    const adminMX = tab(service, sessionFor('ADMIN', 'MEXICO', 'admin-mx'));

    service.emitToCourseStaff('submission:graded', { score: 90 }, 'COLOMBIA', 'profe-co');
    const tabs = [adminCO, teacherCO, otherTeacherCO, studentCO, adminMX];
    tabs.forEach((t) => t.poll());

    expect(tabs.map((t) => t.received('submission:graded').length)).toEqual([1, 1, 0, 0, 0]);
  });

  it('a usuarios concretos, a un rol o a la sede, sin cruzar nunca de sede', () => {
    const ana = tab(service, sessionFor('STUDENT', 'COLOMBIA', 'ana'));
    const beto = tab(service, sessionFor('STUDENT', 'COLOMBIA', 'beto'));
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));
    const mexico = tab(service, sessionFor('ADMIN', 'MEXICO', 'admin-mx'));

    service.emitToUsers('message:new', { from: 'beto' }, 'COLOMBIA', ['ana']);
    service.emitToRole('request:new', {}, 'COLOMBIA', 'ADMIN');
    service.emitToCountry('config:updated', {}, 'COLOMBIA');
    [ana, beto, admin, mexico].forEach((t) => t.poll());

    expect(ana.received('message:new')).toHaveLength(1);
    expect(beto.received('message:new')).toHaveLength(0);
    expect(admin.received('request:new')).toHaveLength(1);
    expect(ana.received('request:new')).toHaveLength(0);
    expect([ana, beto, admin].every((t) => t.received('config:updated').length === 1)).toBe(true);
    expect(mexico.news()).toEqual([]);
  });

  it('cada evento llega una sola vez, en el orden en que ocurrió', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));

    service.emitToCountry('course:created', { n: 1 }, 'COLOMBIA');
    admin.poll();
    service.emitToCountry('course:created', { n: 2 }, 'COLOMBIA');
    service.emitToCountry('course:created', { n: 3 }, 'COLOMBIA');
    admin.poll();
    admin.poll();

    expect(admin.received('course:created').map((e) => e.data)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });
});

describe('RealtimeService · presencia', () => {
  it('al llegar alguien se anuncia sólo el cambio, no la lista entera de la sede', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));
    tab(service, sessionFor('STUDENT', 'COLOMBIA', 'alumno-co'));

    admin.poll();

    expect(admin.events).toContainEqual({ event: 'presence:update', data: { guid: 'alumno-co', status: 'online' } });
  });

  it('quien sigue preguntando sigue en línea; quien deja de hacerlo, se da por ido y libera su curso', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));
    const teacher = tab(service, sessionFor('TEACHER', 'COLOMBIA', 'profe-co'));
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    for (let i = 0; i < 6; i++) {
      jest.advanceTimersByTime(30_000);
      admin.poll();
    }
    teacher.poll();

    expect(admin.events).toContainEqual({ event: 'presence:update', data: { guid: 'profe-co', status: 'offline' } });
    expect(admin.events).toContainEqual({ event: 'course:editing-released', data: { courseGuid: 'curso-co' } });
    expect(admin.events).not.toContainEqual({
      event: 'presence:update',
      data: { guid: 'admin-co', status: 'offline' },
    });
    // Al volver a preguntar, vuelve a estar en línea.
    admin.poll();
    expect(admin.events.at(-1)).toEqual({ event: 'presence:update', data: { guid: 'profe-co', status: 'online' } });
  });
});

describe('RealtimeService · cierre de sesiones', () => {
  it('quien pierde la sesión lo sabe con el motivo; los demás lo ven irse y su curso queda libre', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));
    const teacher = tab(service, sessionFor('TEACHER', 'COLOMBIA', 'profe-co'));
    service.acquireCourseEdit('curso-co', 'profe-co', editorCO);

    service.revokeSession('profe-co', 'role_changed');
    admin.poll();
    teacher.poll();

    expect(teacher.received('session:revoked').map((e) => e.data)).toEqual([{ reason: 'role_changed' }]);
    expect(admin.received('session:revoked')).toEqual([]);
    expect(admin.events).toContainEqual({ event: 'presence:update', data: { guid: 'profe-co', status: 'offline' } });
    expect(admin.events).toContainEqual({ event: 'course:editing-released', data: { courseGuid: 'curso-co' } });
    expect(service.acquireCourseEdit('curso-co', 'profe-co', { ...editorCO, guid: 'otro-profe' }).guid).toBe(
      'otro-profe',
    );
  });

  it('de quien no tiene el campus abierto no hay nada que anunciar', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));

    service.revokeSession('ausente', 'account_deleted');
    admin.poll();

    expect(admin.news()).toEqual([]);
  });
});

describe('RealtimeService · avisos perdidos', () => {
  it('quien vuelve tras más de tres minutos recibe el estado de ahora y recarga sus datos', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));
    service.emitToCountry('course:created', {}, 'COLOMBIA');

    jest.advanceTimersByTime(4 * 60_000);
    const batch = admin.poll();

    expect(batch.reset).toBe(true);
    expect(batch.events.map((e) => e.event)).toEqual(['presence:sync', 'course:editing-sync']);
  });

  it('tras un corte más breve no se pierde nada: llega lo que pasó mientras tanto', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));
    service.emitToCountry('course:created', {}, 'COLOMBIA');

    jest.advanceTimersByTime(80_000);
    const batch = admin.poll();

    expect(batch.reset).toBe(false);
    expect(batch.events.map((e) => e.event)).toEqual(['course:created']);
  });

  it('una marca de antes de arrancar el proceso, o que no puede ser, pide recargar', () => {
    const user = sessionFor('ADMIN', 'COLOMBIA', 'admin-co');
    const { cursor } = service.poll(user, null);

    expect(service.poll(user, cursor - 1_000_000).reset).toBe(true);
    expect(service.poll(user, cursor + 1_000).reset).toBe(true);
    expect(service.poll(user, cursor).reset).toBe(false);
  });

  it('con una ráfaga enorme guarda sólo los últimos, y quien se quedó atrás recarga', () => {
    const admin = tab(service, sessionFor('ADMIN', 'COLOMBIA', 'admin-co'));

    for (let i = 0; i < 10_001; i++) service.emitToCountry('user:updated', { i }, 'COLOMBIA');

    expect(admin.poll().reset).toBe(true);
  });
});
