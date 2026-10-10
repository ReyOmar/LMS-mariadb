import { breakableSpaces } from './editor-html';

describe('breakableSpaces', () => {
  it('devuelve a espacios normales los que el editor exporta como rígidos', () => {
    expect(breakableSpaces('<p>Las&nbsp;normas&nbsp;de&nbsp;tránsito</p>')).toBe('<p>Las normas de tránsito</p>');
  });

  it('trata igual los espacios rígidos que vuelven al editor como carácter', () => {
    expect(breakableSpaces('<p>Las normas</p>')).toBe('<p>Las normas</p>');
  });

  it('en una racha de espacios deja partir la línea y conserva la separación', () => {
    expect(breakableSpaces('<p>Uno&nbsp;&nbsp;&nbsp;dos</p>')).toBe('<p>Uno &nbsp;&nbsp;dos</p>');
  });

  it('no toca las etiquetas ni sus atributos', () => {
    const link = '<a href="https://ejemplo.com/?q=a&nbsp;b" title="x y">ver&nbsp;más</a>';
    expect(breakableSpaces(link)).toBe('<a href="https://ejemplo.com/?q=a&nbsp;b" title="x y">ver más</a>');
  });

  it('deja intacto el contenido sin espacios rígidos', () => {
    const html = '<ul><li>Primero</li><li>Segundo punto</li></ul>';
    expect(breakableSpaces(html)).toBe(html);
  });
});
