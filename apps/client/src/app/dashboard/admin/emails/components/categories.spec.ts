import { CATEGORIES, eventCategory, groupByCategory } from './categories';

/** Eventos que la API envía y esta pantalla no tiene repartidos. */
function uncategorizedEvents(keys: readonly string[]): string[] {
  const categorized = new Set(CATEGORIES.flatMap((c) => c.events));
  return keys.filter((key) => !categorized.has(key));
}

/**
 * El reparto de eventos en categorías vive en el cliente porque es presentación. El riesgo
 * es que alguien añada un evento en el servidor y aquí caiga en «Sistema» sin que nadie lo
 * note, quedando mal etiquetado para siempre.
 */
describe('categorías de los correos', () => {
  it('coloca cada evento en su grupo', () => {
    expect(eventCategory('CALIFICACION_RECIBIDA').key).toBe('students');
    expect(eventCategory('NUEVA_ENTREGA').key).toBe('examiners');
    expect(eventCategory('USUARIO_APROBADO').key).toBe('administration');
    expect(eventCategory('RECUPERAR_PASSWORD').key).toBe('system');
  });

  it('no deja ningún evento en dos grupos a la vez', () => {
    const all = CATEGORIES.flatMap((c) => c.events);
    expect(all).toHaveLength(new Set(all).size);
  });

  it('delata los eventos que el servidor manda y aquí no están repartidos', () => {
    expect(uncategorizedEvents(['CALIFICACION_RECIBIDA', 'EVENTO_NUEVO'])).toEqual(['EVENTO_NUEVO']);
    expect(uncategorizedEvents(['NUEVA_ENTREGA'])).toEqual([]);
  });

  it('agrupa un evento sin repartir en «Sistema» en lugar de hacerlo desaparecer', () => {
    const groups = groupByCategory([{ key: 'NUEVA_ENTREGA' }, { key: 'EVENTO_NUEVO' }]);
    expect(groups.map((group) => group.key)).toEqual(['examiners', 'system']);
    expect(groups[1].eventsWithData).toEqual([{ key: 'EVENTO_NUEVO' }]);
  });

  it('no deja grupos vacíos', () => {
    expect(groupByCategory([{ key: 'CALIFICACION_RECIBIDA' }]).map((group) => group.key)).toEqual(['students']);
  });

  it('reparte los catorce eventos que la API tiene hoy', () => {
    const fromApi = [
      'RECUPERAR_PASSWORD',
      'CALIFICACION_RECIBIDA',
      'RECORDATORIO_INACTIVIDAD',
      'CURSO_REACTIVADO',
      'NUEVA_SOLICITUD_ACCESO',
      'SOLICITUD_RECHAZADA',
      'NUEVA_ENTREGA',
      'MODULO_REINICIADO',
      'USUARIO_APROBADO',
      'CURSO_MANTENIMIENTO',
      'MATRICULA_NUEVA',
      'CERTIFICADO_GENERADO',
      'ENTREGA_RECHAZADA',
      'CURSO_COMPLETADO',
    ];
    expect(uncategorizedEvents(fromApi)).toEqual([]);
  });
});
