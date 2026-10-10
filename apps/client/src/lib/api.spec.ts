import { AxiosError, AxiosHeaders } from 'axios';
import { fileUrlFor, isLogoutReason, isNetworkFailure, loginUrl, retryAfterSeconds, safeNextPath } from './api';

/**
 * Cómo se convierte lo que guarda la base en algo que el navegador pueda pedir.
 *
 * Un error aquí no da ningún aviso, sólo una imagen rota, así que queda fijada la regla: lo
 * que empieza por `/` ya es una ruta de la API, y lo que no es una clave de almacenamiento
 * y hay que dirigirla a la ruta de descarga.
 */
describe('fileUrlFor', () => {
  it('convierte una clave de almacenamiento en una ruta de descarga', () => {
    expect(fileUrlFor('avatars/1790-ab.png')).toContain('/api/storage/download/avatars/1790-ab.png');
  });

  it('hace lo mismo con el logotipo y el fondo de la sede', () => {
    expect(fileUrlFor('logos/marca.png')).toContain('/api/storage/download/logos/marca.png');
    expect(fileUrlFor('fondos/acceso.jpg')).toContain('/api/storage/download/fondos/acceso.jpg');
  });

  it('respeta una ruta que la API ya firmó', () => {
    const signed = '/api/storage/download/entregas/informe.pdf?exp=123&sig=abc';
    expect(fileUrlFor(signed)).toContain(signed);
    // Y no la vuelve a prefijar, que dejaría la firma en una ruta inexistente.
    expect(fileUrlFor(signed)).not.toContain('/download/api/');
  });

  it('deja intacta una imagen incrustada de un bloque antiguo', () => {
    const image = 'data:image/png;base64,iVBORw0KGgo=';
    expect(fileUrlFor(image)).toBe(image);
  });

  it('deja intacta una dirección externa', () => {
    expect(fileUrlFor('https://ejemplo.com/imagen.png')).toBe('https://ejemplo.com/imagen.png');
  });

  it('devuelve nulo cuando no hay archivo, para poder pintar las iniciales', () => {
    expect(fileUrlFor(null)).toBeNull();
    expect(fileUrlFor(undefined)).toBeNull();
    expect(fileUrlFor('')).toBeNull();
  });
});

/**
 * Al arrancar, la sesión guardada se contrasta con el servidor. Si éste no contesta —sin
 * red, servidor reiniciándose— no hay motivo para echar al usuario: sólo cuando el
 * servidor responde que la sesión no vale.
 */
describe('isNetworkFailure', () => {
  it('reconoce una petición que no obtuvo respuesta', () => {
    expect(isNetworkFailure(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(true);
  });

  it('no confunde con eso una respuesta de error del servidor', () => {
    const config = { headers: new AxiosHeaders() };
    const response = { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config };
    expect(isNetworkFailure(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, response))).toBe(false);
  });

  it('tampoco lo es un error que no viene de una petición', () => {
    expect(isNetworkFailure(new Error('otra cosa'))).toBe(false);
  });
});

/**
 * Tras exceder el límite de intentos, el formulario queda bloqueado lo que diga el servidor:
 * ni más (el usuario esperaría sin motivo) ni menos (cada pulsación sería otro rechazo).
 */
describe('retryAfterSeconds', () => {
  const failure = (status: number, headers: Record<string, string> = {}) => {
    const config = { headers: new AxiosHeaders() };
    const response = { status, statusText: '', data: {}, headers, config };
    return new AxiosError('', 'ERR_BAD_REQUEST', config, null, response);
  };

  it('toma la espera de la cabecera Retry-After', () => {
    expect(retryAfterSeconds(failure(429, { 'retry-after': '42' }))).toBe(42);
  });

  it('sin cabecera legible, espera lo que dura el límite', () => {
    expect(retryAfterSeconds(failure(429))).toBe(60);
    expect(retryAfterSeconds(failure(429, { 'retry-after': 'pronto' }))).toBe(60);
  });

  it('cualquier otro error no obliga a esperar', () => {
    expect(retryAfterSeconds(failure(401, { 'retry-after': '42' }))).toBe(0);
    expect(retryAfterSeconds(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(0);
    expect(retryAfterSeconds(new Error('otra cosa'))).toBe(0);
  });
});

/**
 * Un enlace de un correo abierto sin sesión pasa por el login y debe acabar en la página
 * que se pidió. El destino viaja por la URL, así que nunca puede llevar fuera del campus.
 */
describe('vuelta a la página pedida tras el login', () => {
  it('acepta las rutas del propio campus, con su consulta', () => {
    expect(safeNextPath('/courses/abc')).toBe('/courses/abc');
    expect(safeNextPath('/dashboard/student/certificates?open=xyz')).toBe('/dashboard/student/certificates?open=xyz');
  });

  it.each([
    ['otro dominio con dos barras', '//evil.example/robo'],
    ['otro dominio con barra invertida', '/\\evil.example'],
    ['una dirección completa', 'https://evil.example/'],
    ['un esquema javascript', 'javascript:alert(1)'],
    ['una ruta relativa sin barra', 'courses/abc'],
    ['el propio login', '/login?reason=expired'],
    ['vacío', ''],
    ['nulo', null],
  ])('rechaza %s', (_case, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it('compone el login con el motivo y el destino', () => {
    expect(loginUrl('expired', '/courses/abc')).toBe('/login?reason=expired&next=%2Fcourses%2Fabc');
    expect(loginUrl(undefined, '/courses/abc')).toBe('/login?next=%2Fcourses%2Fabc');
    expect(loginUrl('revoked', '//evil.example')).toBe('/login?reason=revoked');
    expect(loginUrl()).toBe('/login');
  });
});

/**
 * El motivo del cierre de sesión llega por la URL del login, así que puede traer cualquier
 * cosa: sólo se explica uno que el login sepa contar.
 */
describe('isLogoutReason', () => {
  it('reconoce los motivos que el login explica, también el de contraseña y el de rol', () => {
    for (const reason of ['expired', 'revoked', 'displaced', 'password', 'role']) {
      expect(isLogoutReason(reason)).toBe(true);
    }
  });

  it('descarta cualquier otro valor', () => {
    expect(isLogoutReason('password_changed')).toBe(false);
    expect(isLogoutReason('')).toBe(false);
    expect(isLogoutReason(null)).toBe(false);
  });
});
