import { closeRoundOf } from './closed-round';
import type { ExaminerSubmission } from './types';

const delivered = (guid: string, student: string, courseGuid = 'curso-1'): ExaminerSubmission =>
  ({
    guid,
    status: 'GRADED',
    courseGuid,
    student: { guid: student },
    fileName: 'informe.pdf',
    fileUrl: `/api/storage/download/${guid}`,
    filePurged: false,
    roundClosed: false,
  }) as ExaminerSubmission;

describe('closeRoundOf', () => {
  const round = { courseGuid: 'curso-1', userGuid: 'ana' };

  it('al certificarse el alumno, sus entregas cargadas pierden la descarga y conservan el nombre del archivo', () => {
    const [retired] = closeRoundOf([delivered('e1', 'ana')], round);

    expect(retired).toMatchObject({ fileName: 'informe.pdf', fileUrl: null, filePurged: true, roundClosed: true });
  });

  it('una entrega sin archivo no pasa a figurar como retirada, pero su nota queda cerrada', () => {
    const [closed] = closeRoundOf([{ ...delivered('e1', 'ana'), fileName: null, fileUrl: null }], round);

    expect(closed).toMatchObject({ filePurged: false, roundClosed: true });
  });

  it('no toca las entregas de los demás alumnos ni las del mismo alumno en otro curso', () => {
    const others = [delivered('e2', 'beto'), delivered('e3', 'ana', 'curso-2')];

    expect(closeRoundOf(others, round)).toEqual(others);
  });
});
