import { MAX_FILE_NAME_LENGTH, shortenFileName } from './file-name';

describe('shortenFileName', () => {
  it('deja intacto un nombre que cabe', () => {
    expect(shortenFileName('Informe de ruta.pdf')).toBe('Informe de ruta.pdf');
  });

  it('recorta un nombre largo conservando la extensión', () => {
    const shortened = shortenFileName(`${'a'.repeat(300)}.docx`);

    expect(shortened).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(shortened.endsWith('.docx')).toBe(true);
  });

  it('no parte un emoji por la mitad', () => {
    const shortened = shortenFileName(`${'😀'.repeat(200)}.pdf`);

    expect(Array.from(shortened)).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(shortened).toMatch(/^(😀)+\.pdf$/u);
  });

  it('no toma por extensión un tramo largo tras el último punto', () => {
    const shortened = shortenFileName(`acta.${'x'.repeat(300)}`);

    expect(shortened).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(shortened.startsWith('acta.')).toBe(true);
  });
});
