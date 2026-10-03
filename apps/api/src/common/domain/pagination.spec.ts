import { encodeCursor, rowsPerPage, decodeCursor, ROWS_PER_PAGE, MAX_PER_PAGE } from './pagination';

describe('marca de paginación', () => {
  it('vuelve intacta del viaje de ida y vuelta', () => {
    const date = new Date('2026-03-14T09:26:53.589Z');
    const cursor = decodeCursor(encodeCursor(date, 'a1b2-c3'));

    expect(cursor?.date.toISOString()).toBe(date.toISOString());
    expect(cursor?.id).toBe('a1b2-c3');
  });

  it('conserva los milisegundos, que es lo que desempata dos altas del mismo segundo', () => {
    const date = new Date('2026-03-14T09:26:53.007Z');
    expect(decodeCursor(encodeCursor(date, '1'))?.date.getTime()).toBe(date.getTime());
  });

  it('admite identificadores numéricos', () => {
    expect(decodeCursor(encodeCursor(new Date(), 42))?.id).toBe('42');
  });

  it('viaja sin caracteres que haya que escapar en una URL', () => {
    const encoded = encodeCursor(new Date('2026-03-14T09:26:53.589Z'), 'a/b+c=d');
    expect(encoded).toBe(encodeURIComponent(encoded));
  });

  // Una marca rota no puede dejar la pantalla en blanco: se responde la primera página.
  it.each([
    ['ausente', undefined],
    ['vacía', ''],
    ['sin separador', Buffer.from('solotexto').toString('base64url')],
    ['sin identificador', Buffer.from('2026-03-14T09:26:53.589Z|').toString('base64url')],
    ['sin fecha', Buffer.from('|abc').toString('base64url')],
    ['con fecha imposible', Buffer.from('ayer|abc').toString('base64url')],
    ['que no es base64', '%%%%'],
  ])('devuelve null si la marca viene %s', (_case, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});

describe('rowsPerPage', () => {
  it('usa el tamaño por defecto cuando no se pide nada', () => {
    expect(rowsPerPage()).toBe(ROWS_PER_PAGE);
  });

  it('respeta lo que se pide dentro del rango', () => {
    expect(rowsPerPage(10)).toBe(10);
  });

  it('no deja pedir la sede entera', () => {
    expect(rowsPerPage(100_000)).toBe(MAX_PER_PAGE);
  });

  it('no deja pedir cero ni negativos, que devolverían una página vacía para siempre', () => {
    expect(rowsPerPage(0)).toBe(1);
    expect(rowsPerPage(-5)).toBe(1);
  });
});
