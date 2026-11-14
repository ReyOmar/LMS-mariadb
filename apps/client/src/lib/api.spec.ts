import { AxiosError, AxiosHeaders } from 'axios';
import {
  clearSession,
  discardPersistentSession,
  fileUrlFor,
  isLogoutReason,
  isNetworkFailure,
  isSessionRejected,
  loginUrl,
  readStoredUser,
  readToken,
  retryAfterSeconds,
  safeNextPath,
  saveSession,
} from './api';

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

/** Un error de petición con la respuesta del servidor que se indique. */
function responseError(status: number, headers: Record<string, string> = {}): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = { status, statusText: '', data: {}, headers, config };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, response);
}

/** Una subida que falla sin respuesta puede haberse guardado: no se descarta el archivo. */
describe('isNetworkFailure', () => {
  it('reconoce una petición que no obtuvo respuesta', () => {
    expect(isNetworkFailure(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(true);
  });

  it('no confunde con eso una respuesta de error del servidor', () => {
    expect(isNetworkFailure(responseError(401))).toBe(false);
  });

  it('tampoco lo es un error que no viene de una petición', () => {
    expect(isNetworkFailure(new Error('otra cosa'))).toBe(false);
  });
});

/**
 * Al arrancar, la sesión guardada se contrasta con el servidor. Sin red, o con el servidor o su
 * base de datos caídos, no hay motivo para echar al usuario: sólo cuando responde que la sesión
 * no vale.
 */
describe('isSessionRejected', () => {
  it('un 401 dice que la sesión ya no vale', () => {
    expect(isSessionRejected(responseError(401))).toBe(true);
  });

  it.each([500, 502, 503, 429])('un %i no desmiente la sesión', (status) => {
    expect(isSessionRejected(responseError(status))).toBe(false);
  });

  it('quedarse sin conexión tampoco', () => {
    expect(isSessionRejected(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(isSessionRejected(new Error('otra cosa'))).toBe(false);
  });
});

/**
 * Tras exceder el límite de intentos, el formulario queda bloqueado lo que diga el servidor:
 * ni más (el usuario esperaría sin motivo) ni menos (cada pulsación sería otro rechazo).
 */
describe('retryAfterSeconds', () => {
  it('toma la espera de la cabecera Retry-After', () => {
    expect(retryAfterSeconds(responseError(429, { 'retry-after': '42' }))).toBe(42);
  });

  it('sin cabecera legible, espera lo que dura el límite', () => {
    expect(retryAfterSeconds(responseError(429))).toBe(60);
    expect(retryAfterSeconds(responseError(429, { 'retry-after': 'pronto' }))).toBe(60);
  });

  it('cualquier otro error no obliga a esperar', () => {
    expect(retryAfterSeconds(responseError(401, { 'retry-after': '42' }))).toBe(0);
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

/** Un almacenamiento del navegador en memoria, para ver dónde queda cada dato. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
}

/**
 * La sesión es de la pestaña: cerrarla la termina y otra pestaña no la comparte. Guardada en el
 * almacenamiento común, entrar en una segunda pestaña la pisaba y la primera pasaba a hablar con
 * el servidor en nombre de otra cuenta.
 */
describe('dónde se guarda la sesión', () => {
  const browser = globalThis as { window?: unknown };
  let shared: Storage;
  let tab: Storage;

  beforeEach(() => {
    shared = memoryStorage();
    tab = memoryStorage();
    browser.window = { localStorage: shared, sessionStorage: tab };
  });

  afterEach(() => {
    delete browser.window;
  });

  it('va en la pestaña y no en el almacenamiento que comparten todas', () => {
    saveSession('token-de-esta-pestana', { guid: 'u1' });

    expect(readToken()).toBe('token-de-esta-pestana');
    expect(readStoredUser<{ guid: string }>()?.guid).toBe('u1');
    expect(tab.length).toBe(2);
    expect(shared.length).toBe(0);
  });

  it('al cerrarla se borra sólo la sesión, no las preferencias', () => {
    shared.setItem('preferencia', 'oscuro');
    saveSession('token', { guid: 'u1' });

    clearSession();

    expect(readToken()).toBeNull();
    expect(readStoredUser()).toBeNull();
    expect(shared.getItem('preferencia')).toBe('oscuro');
  });

  it('no usa la copia común de las versiones anteriores, y la borra', () => {
    shared.setItem('lms_token', 'token-antiguo');
    shared.setItem('lms_user', '{"guid":"u1"}');
    shared.setItem('preferencia', 'oscuro');

    expect(readToken()).toBeNull();
    discardPersistentSession();

    expect(shared.getItem('lms_token')).toBeNull();
    expect(shared.getItem('lms_user')).toBeNull();
    expect(shared.getItem('preferencia')).toBe('oscuro');
  });
});
