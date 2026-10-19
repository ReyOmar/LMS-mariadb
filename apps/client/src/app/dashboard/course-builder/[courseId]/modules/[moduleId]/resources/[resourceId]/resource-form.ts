import type { Course, QuizConfig, Resource } from '@/types/models';
import { displayTitle, quizTitleOf } from '@/lib/resources';
import { parseQuizConfig } from '@/lib/quiz-config';
import { breakableSpaces, hasContent } from '@/lib/editor-html';
import { parseLimitMb } from '@/lib/upload-limits';
import { NEW_RESOURCE_SEGMENT } from '@/app/dashboard/course-builder/components/paths';
import { EMPTY_QUIZ, quizProblem } from '@/app/dashboard/course-builder/components/quiz-editing';
import {
  isResourceKind,
  newResource,
  resourceKindOf,
  type ResourceKind,
} from '@/app/dashboard/course-builder/components/resources';

/** Adjunto ya guardado en el disco. */
export interface StoredAttachment {
  key: string;
  name: string;
  /** URL firmada para descargarlo; `null` si se acaba de subir y aún no se ha releído. */
  url: string | null;
}

/** Lo que se edita de un recurso. El archivo elegido y aún no subido va aparte, en memoria. */
export interface ResourceForm {
  title: string;
  /** Texto o instrucciones; en un enlace, su dirección. */
  content: string;
  referenceUrl: string;
  attachment: StoredAttachment | null;
  /** Límite de la entrega tal como se escribe; vacío es el general de la sede. */
  maxUploadText: string;
  quiz: QuizConfig;
}

/** Qué se edita: un recurso existente o uno nuevo de un tipo, que se crea al guardarlo. */
export interface EditorTarget {
  kind: ResourceKind;
  resource: Resource | null;
}

/** Lo que pide la dirección del editor, o `null` si no existe en el curso. */
export function editorTarget(
  course: Pick<Course, 'modules'>,
  moduleGuid: string,
  resourceSegment: string,
  requestedKind: string | null | undefined,
): EditorTarget | null {
  const courseModule = course.modules?.find((candidate) => candidate.guid === moduleGuid);
  if (!courseModule) return null;

  if (resourceSegment === NEW_RESOURCE_SEGMENT) {
    return isResourceKind(requestedKind) ? { kind: requestedKind, resource: null } : null;
  }
  const resource = courseModule.resources?.find((candidate) => candidate.guid === resourceSegment);
  return resource ? { kind: resourceKindOf(resource), resource } : null;
}

export function initialForm({ kind, resource }: EditorTarget): ResourceForm {
  if (!resource) {
    return {
      title: newResource(kind).title,
      content: '',
      referenceUrl: '',
      attachment: null,
      maxUploadText: '',
      quiz: EMPTY_QUIZ,
    };
  }
  return {
    title: displayTitle(resource),
    content: resource.contentHtml ?? '',
    referenceUrl: resource.referenceUrl ?? '',
    attachment: resource.attachmentKey
      ? {
          key: resource.attachmentKey,
          name: resource.attachmentName || 'Archivo adjunto',
          url: resource.attachmentUrl ?? null,
        }
      : null,
    maxUploadText: resource.maxUploadMb ? String(resource.maxUploadMb) : '',
    quiz: parseQuizConfig(resource.quizConfig) ?? EMPTY_QUIZ,
  };
}

export function sameForm(a: ResourceForm, b: ResourceForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Lo primero que impide guardar, o `null`: un recurso que el alumno no podría completar no se guarda. */
export function formProblem(kind: ResourceKind, form: ResourceForm, ceilingMb?: number | null): string | null {
  if (kind === 'QUIZ') return quizProblem(form.quiz);
  if (kind === 'LINK') return form.content.trim() ? null : 'Escribe la dirección del enlace.';
  if (kind === 'ASSIGNMENT') return parseLimitMb(form.maxUploadText, ceilingMb).error;
  return null;
}

/** Un enlace guarda su dirección en el contenido; el resto, el HTML del editor, o nada si quedó vacío. */
function contentToSave(kind: ResourceKind, content: string): string {
  if (kind === 'LINK') return content.trim();
  return hasContent(content) ? breakableSpaces(content) : '';
}

/** El cuerpo que se envía a la API al guardar. */
export function buildResourcePatch(
  kind: ResourceKind,
  form: ResourceForm,
  attachment: Pick<StoredAttachment, 'key' | 'name'> | null,
  ceilingMb?: number | null,
) {
  const title = form.title.trim() || 'Recurso sin título';
  return {
    title: kind === 'QUIZ' ? quizTitleOf(title) : title,
    contentHtml: contentToSave(kind, form.content),
    referenceUrl: form.referenceUrl.trim() || null,
    attachmentKey: attachment?.key ?? null,
    attachmentName: attachment?.name ?? null,
    ...(kind === 'ASSIGNMENT' && { maxUploadMb: parseLimitMb(form.maxUploadText, ceilingMb).value }),
    quizConfig: kind === 'QUIZ' ? JSON.stringify(form.quiz) : null,
  };
}

export type ResourcePatch = ReturnType<typeof buildResourcePatch>;
