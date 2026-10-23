import type { Course } from '@/types/models';
import {
  moduleOrder,
  resourceOrder,
  withMovedModule,
  withMovedResource,
  withRenamedModule,
  withoutModule,
  withoutResource,
} from './outline-edits';

const COURSE = {
  guid: 'c1',
  modules: [
    { guid: 'm1', resources: [{ guid: 'a' }, { guid: 'b' }, { guid: 'c' }] },
    { guid: 'm2', resources: [{ guid: 'd' }] },
  ],
} as unknown as Course;

describe('ediciones del temario', () => {
  it('mueve un recurso dentro de su módulo sin tocar los demás', () => {
    const moved = withMovedResource(COURSE, 'm1', 0, 2);

    expect(resourceOrder(moved, 'm1')).toEqual(['b', 'c', 'a']);
    expect(resourceOrder(moved, 'm2')).toEqual(['d']);
  });

  it('mueve un módulo con sus recursos', () => {
    const moved = withMovedModule(COURSE, 1, 0);

    expect(moduleOrder(moved)).toEqual(['m2', 'm1']);
    expect(resourceOrder(moved, 'm1')).toEqual(['a', 'b', 'c']);
  });

  it('renombra sólo el módulo indicado', () => {
    const renamed = withRenamedModule(COURSE, 'm2', 'Señales');

    expect(renamed.modules?.map((courseModule) => courseModule.title)).toEqual([undefined, 'Señales']);
  });

  it('quita un módulo con todo lo suyo', () => {
    expect(withoutModule(COURSE, 'm1').modules?.map((courseModule) => courseModule.guid)).toEqual(['m2']);
  });

  it('quita un recurso de su módulo', () => {
    expect(resourceOrder(withoutResource(COURSE, 'b'), 'm1')).toEqual(['a', 'c']);
  });

  it('no modifica el curso de partida', () => {
    withMovedResource(COURSE, 'm1', 0, 2);

    expect(resourceOrder(COURSE, 'm1')).toEqual(['a', 'b', 'c']);
  });
});
