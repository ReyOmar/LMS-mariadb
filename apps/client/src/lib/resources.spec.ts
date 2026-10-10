import {
  linkTarget,
  isQuiz,
  isImage,
  isCampusPath,
  isApiPath,
  displayTitle,
  externalUrl,
  youtubeVideoId,
} from './resources';
import type { Resource } from '@/types/models';

/**
 * Convenciones de los recursos de un módulo.
 *
 * Son las reglas que deciden qué ve el alumno dentro de un recurso. Si el constructor y la
 * vista del alumno las interpretaran distinto, una imagen subida no aparecería o una página
 * externa no se podría abrir, y nadie lo notaría hasta que un alumno lo dijera.
 */

/** Recurso mínimo con lo que necesita cada comprobación. */
function resource(fields: Partial<Resource>): Resource {
  return {
    guid: 'r1',
    moduleGuid: 'm1',
    title: 'Recurso',
    type: 'LINK',
    position: 0,
    ...fields,
  } as Resource;
}

describe('esCuestionario y tituloVisible', () => {
  it('reconoce el cuestionario por la marca del título', () => {
    expect(isQuiz(resource({ type: 'ASSIGNMENT', title: '[QUIZ] Normativa' }))).toBe(true);
    expect(isQuiz(resource({ type: 'ASSIGNMENT', title: 'Informe de ruta' }))).toBe(false);
  });

  it('no confunde un texto que empieza igual pero no es tarea', () => {
    expect(isQuiz(resource({ type: 'TEXT', title: '[QUIZ] Normativa' }))).toBe(false);
  });

  it('admite que no haya recurso', () => {
    expect(isQuiz(null)).toBe(false);
    expect(isQuiz(undefined)).toBe(false);
  });

  it('esconde la marca interna al enseñar el título', () => {
    expect(displayTitle(resource({ type: 'ASSIGNMENT', title: '[QUIZ] Normativa' }))).toBe('Normativa');
    expect(displayTitle(resource({ type: 'ASSIGNMENT', title: 'Informe de ruta' }))).toBe('Informe de ruta');
  });

  it('la quita igual que la API, con cualquier espaciado detrás', () => {
    expect(displayTitle(resource({ type: 'ASSIGNMENT', title: '[QUIZ]Normativa' }))).toBe('Normativa');
    expect(displayTitle(resource({ type: 'ASSIGNMENT', title: '[QUIZ]   Normativa' }))).toBe('Normativa');
  });
});

describe('externalUrl', () => {
  it('completa el esquema de una dirección escrita a mano', () => {
    expect(externalUrl('www.ejemplo.com')).toBe('https://www.ejemplo.com');
  });

  it('respeta la que ya lo trae', () => {
    expect(externalUrl('http://ejemplo.com')).toBe('http://ejemplo.com');
    expect(externalUrl('https://ejemplo.com')).toBe('https://ejemplo.com');
    expect(externalUrl('//ejemplo.com')).toBe('//ejemplo.com');
  });

  it('no inventa nada con la cadena vacía', () => {
    expect(externalUrl('')).toBe('');
  });
});

describe('isCampusPath', () => {
  it('reconoce una ruta del campus', () => {
    expect(isCampusPath('/api/storage/download/recursos/manual.pdf?exp=1&sig=abc')).toBe(true);
  });

  it('no confunde una dirección de otro sitio', () => {
    expect(isCampusPath('//ejemplo.com/manual.pdf')).toBe(false);
    expect(isCampusPath('https://ejemplo.com/manual.pdf')).toBe(false);
    expect(isCampusPath('www.ejemplo.com')).toBe(false);
    expect(isCampusPath('')).toBe(false);
  });
});

describe('isApiPath', () => {
  it('distingue lo que sirve la API de una página del propio sitio', () => {
    expect(isApiPath('/api/storage/download/recursos/manual.pdf?exp=1&sig=abc')).toBe(true);
    expect(isApiPath('/cursos/abc')).toBe(false);
    expect(isApiPath('https://ejemplo.com/api/manual.pdf')).toBe(false);
  });
});

describe('youtubeVideoId', () => {
  it('saca el identificador de las dos formas de enlace', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('dQw4w9WgXcQ');
  });

  it('devuelve nulo cuando no es de YouTube', () => {
    expect(youtubeVideoId('https://vimeo.com/12345')).toBeNull();
    expect(youtubeVideoId(null)).toBeNull();
    expect(youtubeVideoId('')).toBeNull();
  });
});

describe('isImage', () => {
  it('reconoce las incrustadas y las subidas al almacenamiento', () => {
    expect(isImage('data:image/png;base64,AAAA')).toBe(true);
    expect(isImage('/api/storage/download/recursos/senal.png')).toBe(true);
    expect(isImage('/api/storage/download/recursos/senal.JPEG')).toBe(true);
    expect(isImage('https://ejemplo.com/foto.webp?v=2')).toBe(true);
  });

  it('no confunde un documento ni una página', () => {
    expect(isImage('/api/storage/download/recursos/manual.pdf')).toBe(false);
    expect(isImage('https://www.mintransporte.gov.co')).toBe(false);
    expect(isImage(null)).toBe(false);
  });
});

describe('linkTarget', () => {
  it('una imagen subida se enseña como imagen', () => {
    const url = '/api/storage/download/recursos/senal.png';
    expect(linkTarget(resource({ contentHtml: url, fileUrl: url }))).toEqual({ kind: 'image', url });
  });

  it('un vídeo de YouTube se enseña como vídeo', () => {
    const target = linkTarget(resource({ contentHtml: 'https://youtu.be/abc123' }));
    expect(target).toEqual({ kind: 'video', url: 'https://youtu.be/abc123', video: 'abc123' });
  });

  it('una página externa se enseña como enlace y con su esquema completo', () => {
    expect(linkTarget(resource({ contentHtml: 'www.mintransporte.gov.co' }))).toEqual({
      kind: 'link',
      url: 'https://www.mintransporte.gov.co',
    });
  });

  it('lee `fileUrl` cuando el bloque antiguo sólo tiene eso', () => {
    const url = '/api/storage/download/recursos/vieja.png';
    expect(linkTarget(resource({ contentHtml: null, fileUrl: url }))).toEqual({ kind: 'image', url });
  });

  it('un archivo antiguo del almacenamiento se abre con la URL firmada, no con su clave', () => {
    const signed = '/api/storage/download/recursos/vieja.png?exp=1&sig=abc';
    expect(linkTarget(resource({ contentHtml: null, fileUrl: 'recursos/vieja.png', fileDownloadUrl: signed }))).toEqual(
      { kind: 'image', url: signed },
    );
  });

  it('el bloque antiguo que repite la clave en `contentHtml` también usa la URL firmada', () => {
    const signed = '/api/storage/download/recursos/vieja.png?exp=1&sig=abc';
    const old = resource({ contentHtml: 'recursos/vieja.png', fileUrl: 'recursos/vieja.png', fileDownloadUrl: signed });
    expect(linkTarget(old)).toEqual({ kind: 'image', url: signed });
  });

  it('reconoce la clave repetida aunque lleve espacios alrededor', () => {
    const signed = '/api/storage/download/recursos/vieja.png?exp=1&sig=abc';
    const old = resource({
      contentHtml: ' recursos/vieja.png\n',
      fileUrl: 'recursos/vieja.png',
      fileDownloadUrl: signed,
    });
    expect(linkTarget(old)).toEqual({ kind: 'image', url: signed });
  });

  it('un contenido de sólo espacios no tapa el archivo antiguo', () => {
    const signed = '/api/storage/download/recursos/vieja.png?exp=1&sig=abc';
    const old = resource({ contentHtml: '   ', fileUrl: 'recursos/vieja.png', fileDownloadUrl: signed });
    expect(linkTarget(old)).toEqual({ kind: 'image', url: signed });
  });

  it('un documento antiguo se enlaza con la URL firmada, sin inventarle un esquema', () => {
    const signed = '/api/storage/download/recursos/manual.pdf?exp=1&sig=abc';
    const old = resource({
      contentHtml: 'recursos/manual.pdf',
      fileUrl: 'recursos/manual.pdf',
      fileDownloadUrl: signed,
    });
    expect(linkTarget(old)).toEqual({ kind: 'link', url: signed });
  });

  it('una página del propio campus se enlaza tal cual', () => {
    expect(linkTarget(resource({ contentHtml: '/cursos/abc' }))).toEqual({ kind: 'link', url: '/cursos/abc' });
  });

  it('una dirección de protocolo relativo se respeta tal cual', () => {
    expect(linkTarget(resource({ contentHtml: '//ejemplo.com/manual.pdf' }))).toEqual({
      kind: 'link',
      url: '//ejemplo.com/manual.pdf',
    });
  });

  it('la dirección que escribe el constructor manda sobre el archivo antiguo', () => {
    const old = resource({
      contentHtml: 'https://youtu.be/abc123',
      fileUrl: 'recursos/vieja.png',
      fileDownloadUrl: '/api/storage/download/recursos/vieja.png?exp=1&sig=abc',
    });
    expect(linkTarget(old)).toEqual({ kind: 'video', url: 'https://youtu.be/abc123', video: 'abc123' });
  });

  it('una imagen antigua incrustada sigue siendo una imagen', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    expect(linkTarget(resource({ contentHtml: null, fileUrl: url }))).toEqual({ kind: 'image', url });
  });

  it('un bloque sin destino se reconoce como vacío en lugar de pintarse mal', () => {
    expect(linkTarget(resource({ contentHtml: '', fileUrl: null }))).toEqual({ kind: 'empty' });
    expect(linkTarget(resource({ contentHtml: '   ', fileUrl: null }))).toEqual({ kind: 'empty' });
  });
});
