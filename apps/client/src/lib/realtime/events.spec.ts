import { batchKey, withPresence } from './events';

/**
 * Las ráfagas de avisos se agrupan antes de repartirse. Lo que no puede pasar es que un
 * aviso de un curso tape el de otro: la baja de un alumno tiene que llegar a la pantalla de
 * ese curso aunque un instante después llegue otro aviso de matrícula.
 */
describe('agrupación de avisos en tiempo real', () => {
  it('los avisos de matrícula se agrupan por curso', () => {
    const baja = batchKey('enrollment:changed', { action: 'unenrolled', courseGuid: 'curso-a' });
    const alta = batchKey('enrollment:changed', { action: 'enrolled', courseGuid: 'curso-b' });
    const otraAlta = batchKey('enrollment:changed', { action: 'enrolled', courseGuid: 'curso-b' });

    expect(baja).not.toBe(alta);
    expect(alta).toBe(otraAlta);
  });

  it('los avisos de un curso usan su guid', () => {
    expect(batchKey('course:deleted', { guid: 'curso-a' })).not.toBe(batchKey('course:deleted', { guid: 'curso-b' }));
  });

  it('el resto se agrupa sólo por evento, aunque traiga un guid de otra cosa', () => {
    expect(batchKey('user:created', { guid: 'usuario-1' })).toBe(batchKey('user:created', { guid: 'usuario-2' }));
    expect(batchKey('request:new', null)).toBe('request:new');
  });
});

/**
 * El servidor manda la lista de conectados una vez, al abrir el flujo, y después sólo
 * quién entra y quién sale.
 */
describe('withPresence', () => {
  const online: ReadonlySet<string> = new Set(['ana']);

  it('suma a quien entra y quita a quien sale', () => {
    expect([...withPresence(online, { guid: 'luis', status: 'online' })]).toEqual(['ana', 'luis']);
    expect([...withPresence(online, { guid: 'ana', status: 'offline' })]).toEqual([]);
  });

  it('sin cambio real devuelve el mismo conjunto, para no repintar', () => {
    expect(withPresence(online, { guid: 'ana', status: 'online' })).toBe(online);
    expect(withPresence(online, { guid: 'luis', status: 'offline' })).toBe(online);
  });

  it('no modifica el conjunto anterior', () => {
    withPresence(online, { guid: 'luis', status: 'online' });
    expect([...online]).toEqual(['ana']);
  });
});
