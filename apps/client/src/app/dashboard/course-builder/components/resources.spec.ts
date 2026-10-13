import type { Resource } from '@/types/models';
import { attemptsLabel, isResourceKind, isUnconfigured, newResource, resourceKindOf } from './resources';

describe('resourceKindOf', () => {
  it('distingue un cuestionario de una tarea por su marca en el título', () => {
    expect(resourceKindOf({ type: 'ASSIGNMENT', title: '[QUIZ] Normativa' })).toBe('QUIZ');
    expect(resourceKindOf({ type: 'ASSIGNMENT', title: 'Informe' })).toBe('ASSIGNMENT');
  });

  it('un texto se presenta como párrafo y un enlace como enlace', () => {
    expect(resourceKindOf({ type: 'TEXT', title: 'Lectura' })).toBe('PARAGRAPH');
    expect(resourceKindOf({ type: 'LINK', title: 'Video' })).toBe('LINK');
  });
});

describe('isResourceKind', () => {
  it('sólo acepta los tipos que ofrece el menú, como el de la dirección del editor', () => {
    expect(isResourceKind('QUIZ')).toBe(true);
    expect(isResourceKind('VIDEO')).toBe(false);
    expect(isResourceKind(null)).toBe(false);
  });
});

describe('newResource', () => {
  it('un cuestionario nace como tarea', () => {
    expect(newResource('QUIZ').type).toBe('ASSIGNMENT');
    expect(newResource('PARAGRAPH').type).toBe('TEXT');
  });
});

describe('isUnconfigured', () => {
  const resource = (fields: Partial<Resource>) => ({ type: 'ASSIGNMENT', title: 'Informe', ...fields }) as Resource;

  it('un cuestionario sin preguntas no se puede completar', () => {
    expect(isUnconfigured(resource({ title: '[QUIZ] Normativa', quizConfig: null }))).toBe(true);
    expect(isUnconfigured(resource({ title: '[QUIZ] Normativa', quizConfig: '{"questions":[]}' }))).toBe(true);
  });

  it('un enlace sin dirección no lleva a ninguna parte', () => {
    expect(isUnconfigured(resource({ type: 'LINK', contentHtml: '' }))).toBe(true);
    expect(isUnconfigured(resource({ type: 'LINK', contentHtml: 'https://youtu.be/abc' }))).toBe(false);
  });

  it('un texto o una tarea siempre se pueden completar', () => {
    expect(isUnconfigured(resource({ type: 'TEXT', contentHtml: '' }))).toBe(false);
    expect(isUnconfigured(resource({}))).toBe(false);
  });
});

describe('attemptsLabel', () => {
  it('cero intentos es sin límite, no «0 intentos»', () => {
    expect(attemptsLabel(0)).toBe('Intentos ilimitados');
  });

  it('escribe la palabra en singular o en plural según la cifra', () => {
    expect(attemptsLabel(1)).toBe('1 intento');
    expect(attemptsLabel(3)).toBe('3 intentos');
  });
});
