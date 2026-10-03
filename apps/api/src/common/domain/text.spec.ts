import { plural } from './text';

describe('plural', () => {
  it('usa el singular sólo con una unidad', () => {
    expect(plural(1, 'tarea', 'tareas')).toBe('tarea');
  });

  it('usa el plural con cero y con varias', () => {
    expect(plural(0, 'tarea', 'tareas')).toBe('tareas');
    expect(plural(3, 'tarea', 'tareas')).toBe('tareas');
  });
});
