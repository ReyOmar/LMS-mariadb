import { appendPage, mergeFirstPage } from './pagination';

/**
 * Cómo se encaja una página con lo ya cargado.
 *
 * Lo que se fija aquí es que un refresco no se lleve las tandas traídas con «Ver más», que
 * ninguna fila salga dos veces y que, cuando la página avanza por alumno, lo que llega de uno
 * sustituya su historial entero: si no, un intento borrado seguiría en pantalla.
 */

const rows = (...guids: string[]) => guids.map((guid) => ({ guid }));

/** Intentos de cuestionario: varios por alumno, y la página avanza por alumno. */
const attempt = (guid: string, student: string) => ({ guid, student });
const byStudent = (row: { student: string }) => row.student;

describe('mergeFirstPage', () => {
  it('pone delante lo nuevo y conserva las páginas ya cargadas', () => {
    expect(mergeFirstPage(rows('n', 'a', 'b'), rows('a', 'b', 'c', 'd'))).toEqual(rows('n', 'a', 'b', 'c', 'd'));
  });

  it('no repite una fila que ya venía en la página nueva', () => {
    expect(mergeFirstPage(rows('c', 'a'), rows('a', 'b', 'c', 'd'))).toEqual(rows('c', 'a', 'b', 'd'));
  });

  it('con la clave por alumno, lo que llega de uno sustituye todo su historial cargado', () => {
    // A «ana» se le borró «i2»: la página nueva ya no lo trae y no debe sobrevivir en la fusión.
    const loaded = [attempt('i1', 'ana'), attempt('i2', 'ana'), attempt('i3', 'luis')];
    const fresh = [attempt('i1', 'ana')];

    expect(mergeFirstPage(fresh, loaded, byStudent)).toEqual([attempt('i1', 'ana'), attempt('i3', 'luis')]);
  });

  it('un alumno de una página posterior que sube a la primera no sale dos veces ni conserva lo borrado', () => {
    // A «luis» le borraron «i3» para liberarle otro intento y lo volvió a presentar («i4»):
    // sube a la primera página sin «i3», que tampoco debe sobrevivir en lo cargado.
    const loaded = [attempt('i1', 'ana'), attempt('i3', 'luis'), attempt('i2', 'luis')];
    const fresh = [attempt('i4', 'luis'), attempt('i2', 'luis'), attempt('i1', 'ana')];

    expect(mergeFirstPage(fresh, loaded, byStudent)).toEqual(fresh);
  });
});

describe('appendPage', () => {
  it('añade la página siguiente detrás de lo cargado', () => {
    expect(appendPage(rows('a', 'b'), rows('c', 'd'))).toEqual(rows('a', 'b', 'c', 'd'));
  });

  it('un alumno que bajó de sitio y vuelve a llegar se queda con la versión nueva, una sola vez', () => {
    const loaded = [attempt('i1', 'ana'), attempt('i2', 'ana'), attempt('i3', 'luis')];
    const next = [attempt('i1', 'ana'), attempt('i5', 'eva')];

    expect(appendPage(loaded, next, byStudent)).toEqual([
      attempt('i3', 'luis'),
      attempt('i1', 'ana'),
      attempt('i5', 'eva'),
    ]);
  });
});
