/**
 * La palabra en singular o en plural según la cifra: `plural(1, 'tarea', 'tareas')` da
 * «tarea» y con cualquier otra cifra, cero incluido, «tareas».
 *
 * Es la misma regla que aplica el cliente (`apps/client/src/lib/text.ts`), para que los
 * mensajes de la API no escriban «tarea(s)».
 */
export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
