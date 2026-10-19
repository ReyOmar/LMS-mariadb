import type { Course, Resource } from '@/types/models';
import {
  EMPTY_QUIZ,
  addQuestion,
  setOptionText,
  setPrompt,
} from '@/app/dashboard/course-builder/components/quiz-editing';
import {
  buildResourcePatch,
  editorTarget,
  formProblem,
  initialForm,
  sameForm,
  type ResourceForm,
} from './resource-form';

const QUIZ = {
  guid: 'q1',
  type: 'ASSIGNMENT',
  title: '[QUIZ] Normativa',
  contentHtml: '<p>Lee antes</p>',
  quizConfig: JSON.stringify({ allowedAttempts: 2, timeLimitMinutes: 10, questions: [] }),
} as Resource;

const COURSE = { modules: [{ guid: 'm1', resources: [QUIZ] }] } as unknown as Course;

function completeQuiz() {
  let next = 0;
  let quiz = addQuestion(EMPTY_QUIZ, () => `id-${++next}`);
  const [question] = quiz.questions;
  quiz = setPrompt(quiz, question.id, '¿Color para parar?');
  for (const option of question.options) quiz = setOptionText(quiz, question.id, option.id, 'Rojo');
  return quiz;
}

const form = (fields: Partial<ResourceForm>): ResourceForm => ({
  ...initialForm({ kind: 'PARAGRAPH', resource: null }),
  ...fields,
});

describe('editorTarget', () => {
  it('un recurso nuevo se edita sin existir todavía, con el tipo que trae la dirección', () => {
    expect(editorTarget(COURSE, 'm1', 'new', 'LINK')).toEqual({ kind: 'LINK', resource: null });
  });

  it('un tipo desconocido, un módulo ajeno o un recurso borrado no se pueden editar', () => {
    expect(editorTarget(COURSE, 'm1', 'new', 'VIDEO')).toBeNull();
    expect(editorTarget(COURSE, 'otro', 'q1', null)).toBeNull();
    expect(editorTarget(COURSE, 'm1', 'borrado', null)).toBeNull();
  });

  it('un recurso guardado se edita con su tipo', () => {
    expect(editorTarget(COURSE, 'm1', 'q1', null)).toEqual({ kind: 'QUIZ', resource: QUIZ });
  });
});

describe('initialForm', () => {
  it('lee el recurso guardado sin la marca de cuestionario', () => {
    const loaded = initialForm({ kind: 'QUIZ', resource: QUIZ });

    expect(loaded.title).toBe('Normativa');
    expect(loaded.quiz.allowedAttempts).toBe(2);
  });

  it('volver a leerlo da el mismo formulario: abrirlo no cuenta como cambio', () => {
    expect(sameForm(initialForm({ kind: 'QUIZ', resource: QUIZ }), initialForm({ kind: 'QUIZ', resource: QUIZ }))).toBe(
      true,
    );
  });
});

describe('formProblem', () => {
  it('un cuestionario sin preguntas no se guarda', () => {
    expect(formProblem('QUIZ', form({ quiz: EMPTY_QUIZ }))).toBe('El cuestionario debe tener al menos una pregunta.');
    expect(formProblem('QUIZ', form({ quiz: completeQuiz() }))).toBeNull();
  });

  it('un enlace necesita su dirección', () => {
    expect(formProblem('LINK', form({ content: '  ' }))).toBe('Escribe la dirección del enlace.');
  });

  it('una tarea con un límite que no es un entero no se guarda', () => {
    expect(formProblem('ASSIGNMENT', form({ maxUploadText: '2,5' }), 100)).toContain('número entero');
    expect(formProblem('ASSIGNMENT', form({ maxUploadText: '' }), 100)).toBeNull();
  });
});

describe('buildResourcePatch', () => {
  it('un cuestionario guarda su marca en el título y su configuración', () => {
    const quiz = completeQuiz();
    const patch = buildResourcePatch('QUIZ', form({ title: ' Normativa ', quiz }), null);

    expect(patch.title).toBe('[QUIZ] Normativa');
    expect(JSON.parse(patch.quizConfig!)).toEqual(quiz);
    expect(patch).not.toHaveProperty('maxUploadMb');
  });

  it('un enlace guarda la dirección tal cual, sin pasar por el HTML del editor', () => {
    const patch = buildResourcePatch('LINK', form({ content: ' https://youtu.be/abc ' }), null);

    expect(patch.contentHtml).toBe('https://youtu.be/abc');
    expect(patch.quizConfig).toBeNull();
  });

  it('un editor vacío no guarda párrafos vacíos', () => {
    expect(buildResourcePatch('PARAGRAPH', form({ content: '<p><br></p>' }), null).contentHtml).toBe('');
    expect(buildResourcePatch('QUIZ', form({ content: '<p></p>', quiz: completeQuiz() }), null).contentHtml).toBe('');
  });

  it('sólo una tarea lleva límite de entrega; vacío es el de la sede', () => {
    expect(buildResourcePatch('ASSIGNMENT', form({ maxUploadText: '25' }), null, 100).maxUploadMb).toBe(25);
    expect(buildResourcePatch('ASSIGNMENT', form({ maxUploadText: '' }), null, 100).maxUploadMb).toBeNull();
    expect(buildResourcePatch('PARAGRAPH', form({ maxUploadText: '25' }), null)).not.toHaveProperty('maxUploadMb');
  });

  it('el adjunto va por su clave y su nombre; sin él, ambos se quitan', () => {
    const withFile = buildResourcePatch('PARAGRAPH', form({}), { key: 'recursos/1-a.pdf', name: 'guia.pdf' });

    expect(withFile).toMatchObject({ attachmentKey: 'recursos/1-a.pdf', attachmentName: 'guia.pdf' });
    expect(buildResourcePatch('PARAGRAPH', form({}), null)).toMatchObject({
      attachmentKey: null,
      attachmentName: null,
    });
  });

  it('un título vacío no deja el recurso sin nombre', () => {
    expect(buildResourcePatch('PARAGRAPH', form({ title: '   ' }), null).title).toBe('Recurso sin título');
  });
});
