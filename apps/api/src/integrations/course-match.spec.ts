import { CandidateCourse, matchCourse } from './course-match';

/** Los cursos publicados de la sede, con el título como identificador para leer mejor las pruebas. */
const courses = (...titles: string[]): CandidateCourse[] => titles.map((title) => ({ guid: title, title }));

const match = (code: string, description: string | null, ...titles: string[]) =>
  matchCourse({ code, description }, courses(...titles));

describe('matchCourse', () => {
  describe('por el código de la infracción en el título', () => {
    it.each([
      ['C29'],
      ['Curso C29'],
      ['C-29 Conducir rápido'],
      ['c.29: conducir rápido'],
      ['C 29'],
      ['Infracción C29.'],
    ])('C29 la atiende «%s»', (title) => {
      expect(match('C29', null, title, 'Otro curso')).toBe(title);
    });

    it('los ceros a la izquierda no cuentan', () => {
      expect(match('C02', null, 'C2 Semáforo en rojo')).toBe('C2 Semáforo en rojo');
      expect(match('C2', null, 'C-02 Semáforo en rojo')).toBe('C-02 Semáforo en rojo');
    });

    it('no confunde un código con otro que lo contiene', () => {
      expect(match('C2', null, 'C29', 'C20 Exceso', 'AC2')).toBeNull();
    });

    it('un código sin letras o sin cifras no se busca en el título: se confundiría con cualquier palabra', () => {
      expect(match('12', null, 'Curso de 12 horas')).toBeNull();
      expect(match('VELOCIDAD', null, 'Exceso de velocidad')).toBeNull();
    });

    it('gana a la descripción', () => {
      expect(match('C29', 'Conducir rápido', 'Conducir rápido', 'C29 Repaso')).toBe('C29 Repaso');
    });
  });

  describe('por la descripción de la infracción', () => {
    it('un título que dice lo mismo, escrito como sea', () => {
      expect(match('C29', 'Conducir rápido', '¡CONDUCIR RAPIDO!')).toBe('¡CONDUCIR RAPIDO!');
    });

    it('una frase de al menos dos palabras que está entera en el otro texto', () => {
      expect(match('C29', 'Por conducir rápido en zona escolar', 'Conducir rápido')).toBe('Conducir rápido');
      expect(match('C29', 'Conducir rápido', 'Curso de conducir rápido')).toBe('Curso de conducir rápido');
    });

    it('una sola palabra en común no basta', () => {
      expect(match('C29', 'Exceso de velocidad', 'Velocidad')).toBeNull();
    });

    it('palabras sueltas o en otro orden no encajan', () => {
      expect(match('C29', 'Conducir rápido', 'Rápido conducir', 'Conducir con cuidado y rápido')).toBeNull();
    });

    it('el título igual gana al que sólo la contiene', () => {
      expect(match('C29', 'Conducir rápido', 'Conducir rápido en vía urbana', 'Conducir rápido')).toBe(
        'Conducir rápido',
      );
    });
  });

  describe('en la duda no elige', () => {
    it('dos cursos con el código', () => {
      expect(match('C29', null, 'C29 Conducir rápido', 'Repaso C29')).toBeNull();
    });

    it('dos cursos que contienen la descripción', () => {
      expect(match('C29', 'Conducir rápido', 'Conducir rápido I', 'Conducir rápido II')).toBeNull();
    });

    it('sin cursos o sin nada que encaje', () => {
      expect(match('C29', 'Conducir rápido')).toBeNull();
      expect(match('C29', null, 'Seguridad vial')).toBeNull();
    });
  });
});
