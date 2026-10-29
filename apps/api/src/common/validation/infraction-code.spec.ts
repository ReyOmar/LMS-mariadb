import { infractionCodeFrom } from './infraction-code';

/** El sistema que envía la infracción puede escribir su código de varias formas: todas dan la misma. */
describe('infractionCodeFrom', () => {
  it.each([
    ['C29', 'C29'],
    ['c.29', 'C29'],
    [' C-29 ', 'C29'],
    ['C 29', 'C29'],
    ['Art. 9, fracc. I', 'ART9FRACCI'],
    ['Señal 2.ª', 'SENAL2A'],
  ])('%p → %p', (text, code) => {
    expect(infractionCodeFrom(text)).toBe(code);
  });

  it('sin letras ni cifras no hay código', () => {
    expect(infractionCodeFrom(' ¿? — ')).toBe('');
  });
});
