import { contentDisposition } from './content-disposition';

/**
 * Nombres de archivo en las descargas.
 *
 * Una cabecera con un carácter de más de un byte hace que Node la rechace y la descarga
 * termina en un 500. Pasaba con cosas tan corrientes como la raya que pone Word
 * sola al escribir «Informe - final», y con cualquier curso que la llevara en el título,
 * porque de ahí sale el nombre del certificado.
 */
describe('contentDisposition', () => {
  /** Lo que haría Node con la cabecera: rechazarla si lleva algo fuera de un byte. */
  function nodeWouldAccept(header: string): boolean {
    return [...header].every((char) => char.charCodeAt(0) <= 0xff);
  }

  it.each([
    ['un nombre corriente', 'entrega.pdf'],
    ['tildes y eñes', 'Evaluación de señales.pdf'],
    ['la raya que pone Word', 'Informe – final.pdf'],
    ['comillas tipográficas', '“Manejo” defensivo.pdf'],
    ['un emoji', 'tarea 📄.pdf'],
    ['otro alfabeto', 'Отчёт.pdf'],
  ])('con %s produce una cabecera válida', (_case, name) => {
    expect(nodeWouldAccept(contentDisposition('inline', name))).toBe(true);
  });

  it('conserva el nombre real para los navegadores actuales', () => {
    const header = contentDisposition('attachment', 'Informe – final.pdf');

    const encoded = header.split("filename*=UTF-8''")[1];
    expect(decodeURIComponent(encoded)).toBe('Informe – final.pdf');
  });

  it('da un nombre de reserva legible, sin tildes perdidas a interrogaciones', () => {
    const header = contentDisposition('inline', 'Evaluación.pdf');

    expect(header).toContain('filename="Evaluacion.pdf"');
  });

  it('respeta si es para abrir o para descargar', () => {
    expect(contentDisposition('inline', 'a.pdf')).toMatch(/^inline;/);
    expect(contentDisposition('attachment', 'a.pdf')).toMatch(/^attachment;/);
  });

  it('no deja inyectar otra cabecera con un salto de línea', () => {
    const header = contentDisposition('inline', 'a.pdf"\r\nSet-Cookie: robo=1');

    expect(header).not.toMatch(/[\r\n]/);
    // Las comillas se quitan: si no, cerrarían el valor antes de tiempo.
    expect(header.split('filename="')[1].split('"')[0]).not.toContain('"');
  });

  it('codifica los caracteres que el RFC 5987 no deja pasar en claro', () => {
    const header = contentDisposition('inline', "l'examen (final)*.pdf");

    expect(header.split("filename*=UTF-8''")[1]).not.toMatch(/['()*]/);
  });

  it('un nombre vacío no deja la cabecera sin nombre', () => {
    expect(contentDisposition('inline', '   ')).toContain('filename="archivo"');
  });
});
