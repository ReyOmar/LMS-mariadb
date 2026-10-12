import { toEditable, toTemplate, variableLabelHtml, subjectText } from './visual-editing';

describe('ida y vuelta entre plantilla y edición visual', () => {
  it('convierte la variable en etiqueta y la devuelve intacta', () => {
    const template = '<p>Hola {{nombre}}</p>';
    expect(toTemplate(toEditable(template))).toBe(template);
  });

  it('conserva los estilos en línea del botón', () => {
    const template = '<a href="{{url_campus}}" style="background:#4f46e5;color:#fff">Ir al Campus</a>';
    const forward = toEditable(template);

    expect(forward).toContain('style="background:#4f46e5;color:#fff"');
    expect(toTemplate(forward)).toBe(template);
  });

  it('no mete una etiqueta dentro de un atributo, que rompía el enlace', () => {
    const template = '<a href="{{url_monitoreo}}">Ver Monitoreo</a>';
    const forward = toEditable(template);

    expect(forward).toBe(template);
    expect(forward).not.toContain('data-variable');
    expect(toTemplate(forward)).toBe(template);
  });

  it('etiqueta el texto aunque la misma variable esté también en un atributo', () => {
    const template = '<a href="{{url_campus}}">Entra en {{url_campus}}</a>';
    const forward = toEditable(template);

    expect(forward).toContain('href="{{url_campus}}"');
    expect(forward).toContain('data-variable="url_campus"');
    expect(toTemplate(forward)).toBe(template);
  });

  it('aguanta varias variables, repetidas incluidas', () => {
    const template = '<p>{{nombre}} y {{nombre}}, curso {{curso}}</p>';
    expect(toTemplate(toEditable(template))).toBe(template);
  });

  it('deja la etiqueta fuera de la escritura para poder borrarla de una vez', () => {
    expect(toEditable('{{nombre}}')).toContain('contenteditable="false"');
  });

  it('enseña el nombre de la variable, no su valor de ejemplo', () => {
    const forward = toEditable('{{nombre}}');
    expect(forward).toContain('Nombre');
    expect(forward).not.toContain('Juan');
  });

  it('no toca una plantilla sin variables', () => {
    const template = '<p>Texto suelto</p>';
    expect(toEditable(template)).toBe(template);
    expect(toTemplate(template)).toBe(template);
  });

  it('sobrevive a que el navegador reordene los atributos de la etiqueta', () => {
    const browserSerialized =
      '<p>Hola <span style="color:#3730a3" contenteditable="false" data-variable="nombre">Nombre</span></p>';
    expect(toTemplate(browserSerialized)).toBe('<p>Hola {{nombre}}</p>');
  });

  it('inserta una etiqueta suelta para el botón de variables', () => {
    expect(toTemplate(variableLabelHtml('curso'))).toBe('{{curso}}');
  });
});

describe('subjectText', () => {
  it('devuelve las etiquetas a su forma de variable', () => {
    const edited = toEditable('Bienvenido {{nombre}}');
    expect(subjectText(edited)).toBe('Bienvenido {{nombre}}');
  });

  it('quita el marcado que añade el navegador al escribir', () => {
    expect(subjectText('<b>Hola</b> <i>mundo</i>')).toBe('Hola mundo');
  });

  it('convierte los espacios rígidos en espacios normales', () => {
    expect(subjectText('Hola&nbsp;&nbsp;mundo')).toBe('Hola mundo');
  });

  it('no deja espacios de sobra en los extremos', () => {
    expect(subjectText('  Hola  ')).toBe('Hola');
  });
});
