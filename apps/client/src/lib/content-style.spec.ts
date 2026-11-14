import { safeClasses, safeStyle } from './content-style';

/**
 * El contenido de un curso lo ve quien no lo escribió. Puede dar formato a su texto, pero no
 * salirse de su caja: tapando la pantalla con un enlace falso se pescan contraseñas sin ejecutar
 * una sola línea de código.
 */
describe('safeStyle', () => {
  it('quita lo que saca un elemento de su caja', () => {
    const overlay = 'position:fixed;inset:0;z-index:2147483647;background:#fff;padding:40px';

    expect(safeStyle(overlay)).toBe('background:#fff; padding:40px');
  });

  it.each([
    'position: absolute',
    'top: 0',
    'left: -10px',
    'transform: translateY(-100vh)',
    'float: right',
    'pointer-events: none',
    'margin-top: -300px',
    'margin: 0 calc(-50vw)',
    'behavior: url(x.htc)',
    'sin dos puntos',
  ])('descarta «%s»', (declaration) => {
    expect(safeStyle(declaration)).toBe('');
  });

  it('respeta el formato de un texto', () => {
    const formatted = 'color: rgb(230, 0, 0); background-color: #ff0; text-align: center; margin: 16px 0';

    expect(safeStyle(formatted)).toBe(formatted);
  });

  it('deja intactas, letra por letra, las plantillas de correo del campus', () => {
    const templateStyles = [
      'color:#64748b;font-size:15px;line-height:1.6',
      'background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:20px 0',
      'display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600',
      "font-family:'Courier New',monospace;letter-spacing:2px;word-break:break-all",
      'max-height:40px;vertical-align:middle',
      'width:100%;border-collapse:collapse;margin-top:8px;border-top:1px solid #e2e8f0',
    ];

    for (const style of templateStyles) expect(safeStyle(style)).toBe(style);
  });

  it('no distingue mayúsculas en el nombre de la propiedad', () => {
    expect(safeStyle('POSITION: fixed; Color: red')).toBe('Color: red');
  });
});

describe('safeClasses', () => {
  it('conserva las clases del editor', () => {
    expect(safeClasses('ql-align-center ql-indent-1')).toBe('ql-align-center ql-indent-1');
  });

  it('quita las de la aplicación, con las que también se taparía la pantalla', () => {
    expect(safeClasses('fixed inset-0 z-[9999] bg-white')).toBe('');
    expect(safeClasses('ql-size-large fixed')).toBe('ql-size-large');
  });
});
