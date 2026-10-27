import { statusReport, StoredRequest, waitingReasonFor } from './external-status';

/**
 * Lo que se contesta al otro sistema es su contrato: decide si el conductor sigue bloqueado.
 * Un estado mal deducido lo habilitaría sin haber hecho el curso, o lo dejaría bloqueado tras hacerlo.
 */
describe('estado de una matrícula pedida por otro sistema', () => {
  const request = (fields: Partial<StoredRequest> = {}): StoredRequest => ({
    status: 'ENROLLED',
    courseCode: 'MANEJO',
    rejectionReason: null,
    userGuid: 'ana',
    courseGuid: 'curso-1',
    ...fields,
  });
  const facts = { waitingReason: null, enrollmentActive: true, courseTitle: 'Manejo defensivo', certificateCode: null };

  describe('por qué espera', () => {
    it('sin curso con ese código, sin publicar o sin plaza', () => {
      expect(waitingReasonFor(null)).toBe('COURSE_NOT_FOUND');
      expect(waitingReasonFor({ status: 'DRAFT', maxStudents: null, occupiedSeats: 0 })).toBe('COURSE_NOT_PUBLISHED');
      expect(waitingReasonFor({ status: 'PUBLISHED', maxStudents: 2, occupiedSeats: 2 })).toBe('COURSE_FULL');
    });

    it('un curso publicado con plaza, o sin cupo, ya no la hace esperar', () => {
      expect(waitingReasonFor({ status: 'PUBLISHED', maxStudents: 2, occupiedSeats: 1 })).toBeNull();
      expect(waitingReasonFor({ status: 'PUBLISHED', maxStudents: null, occupiedSeats: 500 })).toBeNull();
    });
  });

  it('en espera dice por qué, con el código pedido', () => {
    const report = statusReport(request({ status: 'WAITING' }), { ...facts, waitingReason: 'COURSE_NOT_FOUND' });

    expect(report).toMatchObject({ status: 'WAITING', waitingReason: 'COURSE_NOT_FOUND' });
    expect(report.detail).toContain('MANEJO');
  });

  it('matriculada sólo mientras la matrícula sigue activa', () => {
    expect(statusReport(request(), facts).status).toBe('ENROLLED');
    expect(statusReport(request(), { ...facts, enrollmentActive: false })).toEqual({
      status: 'CANCELLED',
      waitingReason: null,
      detail: 'Un administrador dio de baja la matrícula.',
    });
  });

  it('cancelada si se borró el curso o la cuenta, y lo dice', () => {
    const noCourse = statusReport(request({ courseGuid: null }), { ...facts, enrollmentActive: false });
    const noAccount = statusReport(request({ userGuid: null }), { ...facts, enrollmentActive: false });

    expect(noCourse.detail).toMatch(/curso/);
    expect(noAccount.detail).toMatch(/cuenta/);
  });

  it('completada con el código del certificado, aunque la matrícula ya no esté activa', () => {
    const report = statusReport(request({ status: 'COMPLETED' }), {
      ...facts,
      enrollmentActive: false,
      certificateCode: 'CERT-1',
    });

    expect(report.status).toBe('COMPLETED');
    expect(report.detail).toContain('CERT-1');
  });

  it('rechazada con el motivo guardado', () => {
    const report = statusReport(request({ status: 'REJECTED', rejectionReason: 'Descartada.' }), facts);

    expect(report).toEqual({ status: 'REJECTED', waitingReason: null, detail: 'Descartada.' });
  });
});
