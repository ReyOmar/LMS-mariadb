import { batchKey } from './events';

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
