import { AxiosError, AxiosHeaders } from 'axios';
import { fileUrlFor, isNetworkFailure } from './api';

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
