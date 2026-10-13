import type { Course } from '@/types/models';
import { NO_SELECTION, resolveSelection, selectionFromAddress, toggleSelection } from './selection';

const course = (moduleTitle: string, resources: string[] = ['r1']) =>
  ({
    modules: [{ guid: 'm1', title: moduleTitle, resources: resources.map((guid) => ({ guid, title: guid })) }],
  }) as unknown as Course;

const resourceR1 = { type: 'RESOURCE', moduleGuid: 'm1', resourceGuid: 'r1' } as const;

describe('resolveSelection', () => {
  it('lee el módulo del curso actual: un nombre cambiado se ve al momento', () => {
    const selected = resolveSelection(course('Normativa 2026'), { type: 'MODULE', moduleGuid: 'm1' });

    expect(selected.type === 'MODULE' && selected.module.title).toBe('Normativa 2026');
  });

  it('un recurso de un módulo borrado deja de estar seleccionado', () => {
    expect(resolveSelection({ modules: [] }, resourceR1)).toEqual(NO_SELECTION);
  });

  it('un recurso borrado de su módulo deja de estar seleccionado', () => {
    expect(resolveSelection(course('Normativa', []), resourceR1)).toEqual(NO_SELECTION);
  });
});

describe('selectionFromAddress', () => {
  it('abre el recurso que trae la dirección al volver del editor', () => {
    expect(selectionFromAddress('m1', 'r1')).toEqual(resourceR1);
  });

  it('sin módulo y recurso no selecciona nada', () => {
    expect(selectionFromAddress('m1', null)).toEqual(NO_SELECTION);
  });
});

describe('toggleSelection', () => {
  it('elegir lo que ya está abierto lo cierra, y elegir otra cosa la abre', () => {
    expect(toggleSelection(resourceR1, resourceR1)).toEqual(NO_SELECTION);
    expect(toggleSelection(resourceR1, { type: 'MODULE', moduleGuid: 'm1' })).toEqual({
      type: 'MODULE',
      moduleGuid: 'm1',
    });
  });
});
