import { variableData, parseVariables } from './preview';

/**
 * Las variables de cada evento llegan como JSON guardado en la base. Si ese texto se
 * dañara, la pantalla de correos entera dejaría de abrirse al leerlo.
 */
describe('parseVariables', () => {
  it('lee la lista de variables del evento', () => {
    expect(parseVariables('["nombre","url_campus"]')).toEqual(['nombre', 'url_campus']);
  });

  it('trata un valor vacío o dañado como «sin variables»', () => {
    expect(parseVariables('')).toEqual([]);
    expect(parseVariables(null)).toEqual([]);
    expect(parseVariables('{no es json')).toEqual([]);
    expect(parseVariables('{"nombre":true}')).toEqual([]);
  });

  it('descarta lo que no es un nombre de variable', () => {
    expect(parseVariables('["nombre", 3, null]')).toEqual(['nombre']);
  });
});

describe('variableData', () => {
  it('da etiqueta legible a las que conoce', () => {
    expect(variableData('url_campus').label).toBe('Enlace al campus');
  });

  it('inventa una etiqueta razonable para las que no', () => {
    expect(variableData('algo_nuevo').label).toBe('algo nuevo');
  });
});
