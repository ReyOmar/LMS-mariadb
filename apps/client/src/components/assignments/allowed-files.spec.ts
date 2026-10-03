import { extensionOf, fileTypeWarning } from './allowed-files';

describe('extensionOf', () => {
  it('devuelve la extensión en minúsculas y con su punto', () => {
    expect(extensionOf('Informe Final.PDF')).toBe('.pdf');
    expect(extensionOf('entrega.v2.docx')).toBe('.docx');
  });

  it('un nombre sin extensión no tiene extensión', () => {
    expect(extensionOf('informe')).toBe('');
    expect(extensionOf('informe.')).toBe('');
  });
});

describe('fileTypeWarning', () => {
  it('acepta los formatos admitidos sin importar las mayúsculas', () => {
    expect(fileTypeWarning('evidencia.JPG')).toBeNull();
    expect(fileTypeWarning('respuesta.pdf')).toBeNull();
  });

  it('rechaza un formato no admitido diciendo cuál era', () => {
    expect(fileTypeWarning('instalador.exe')).toContain('".exe"');
  });

  it('un archivo sin extensión se explica como desconocido, no como "."', () => {
    expect(fileTypeWarning('informe.')).toContain('"desconocido"');
    expect(fileTypeWarning('informe')).toContain('"desconocido"');
  });
});
