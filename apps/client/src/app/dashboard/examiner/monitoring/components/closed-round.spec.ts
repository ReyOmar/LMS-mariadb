import type { CourseProgressSummary, MonitoredStudent } from '@/types/models';
import { withoutClosedRound } from './closed-round';

const course = (courseGuid: string, percent: number) => ({ courseGuid, percent }) as CourseProgressSummary;

const student = (guid: string, courses: CourseProgressSummary[], progress: number) =>
  ({ guid, firstName: 'Ana', lastName: 'Díaz', courses, progress }) as MonitoredStudent;

describe('withoutClosedRound', () => {
  const round = { courseGuid: 'curso-a', userGuid: 'ana' };

  it('al certificarse, el curso sale de su fila y el avance pasa a ser la media de los que siguen en curso', () => {
    const ana = student('ana', [course('curso-a', 100), course('curso-b', 40), course('curso-c', 61)], 67);

    const [updated] = withoutClosedRound([ana], round);

    expect(updated.courses.map((item) => item.courseGuid)).toEqual(['curso-b', 'curso-c']);
    expect(updated.progress).toBe(51);
  });

  it('sin otro curso en curso, el alumno sale de la lista', () => {
    expect(withoutClosedRound([student('ana', [course('curso-a', 100)], 100)], round)).toEqual([]);
  });

  it('no toca a los demás alumnos ni a quien no seguía ese curso', () => {
    const beto = student('beto', [course('curso-a', 80)], 80);
    const ana = student('ana', [course('curso-b', 30)], 30);
    const students = [beto, ana];

    expect(withoutClosedRound(students, round)).toEqual([beto, ana]);
    expect(withoutClosedRound(students, round)[1]).toBe(ana);
  });
});
