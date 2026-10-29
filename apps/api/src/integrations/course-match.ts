import { infractionCodeFrom } from '../common/validation/infraction-code';

/** Un curso publicado de la sede que puede atender una infracción. */
export interface CandidateCourse {
  guid: string;
  title: string;
}

/** Cuánto encaja un curso con la infracción, de menos a más. */
const NO_FIT = 0;
const PHRASE = 1;
const SAME_NAME = 2;
const CODE = 3;

/**
 * El curso publicado que atiende la infracción según su título, o `null` si no encaja ninguno o
 * encajan varios por igual: en la duda, lo elige un administrador.
 *
 * Encaja, de más a menos:
 *  1. Un título con el código de la infracción como palabra: a C29 la atienden «C29», «Curso C-29»
 *     o «C 29 Conducir rápido». Sólo con códigos de letras y cifras, que no se confunden con una
 *     palabra o un número cualquiera del título; los ceros a la izquierda no cuentan (C02 es C2).
 *  2. Un título que dice lo mismo que la descripción de la infracción: «Conducir rápido».
 *  3. Un título que contiene la descripción o está contenido en ella, de al menos dos palabras:
 *     «Conducir rápido» atiende «Por conducir rápido en zona escolar».
 * Mayúsculas, tildes y signos no cuentan.
 */
export function matchCourse(
  infraction: { code: string; description: string | null },
  courses: CandidateCourse[],
): string | null {
  const described = infraction.description ? wordsOf(infraction.description) : [];
  const fits = courses.map(({ guid, title }) => ({ guid, fit: fitOf(infraction.code, described, wordsOf(title)) }));
  const best = fits.reduce((max, { fit }) => Math.max(max, fit), NO_FIT);
  const winners = fits.filter(({ fit }) => fit === best);
  return best > NO_FIT && winners.length === 1 ? winners[0].guid : null;
}

function fitOf(code: string, described: string[], title: string[]): number {
  if (namesCode(title, code)) return CODE;
  if (described.length === 0) return NO_FIT;
  if (described.length === title.length && containsRun(title, described)) return SAME_NAME;
  const [shorter, longer] = described.length < title.length ? [described, title] : [title, described];
  return shorter.length >= 2 && containsRun(longer, shorter) ? PHRASE : NO_FIT;
}

/** Si unas palabras seguidas del título forman el código: «C 29» y «C-29» lo forman para C29. */
function namesCode(title: string[], code: string): boolean {
  if (!/[A-Z]/.test(code) || !/[0-9]/.test(code)) return false;
  const wanted = withoutLeadingZeros(code);
  for (let start = 0; start < title.length; start++) {
    let joined = '';
    for (const word of title.slice(start)) {
      joined = withoutLeadingZeros(joined + word);
      if (joined === wanted) return true;
      // Añadir palabras nunca lo acorta: pasado de largo, no hay nada más que mirar desde aquí.
      if (joined.length > wanted.length) break;
    }
  }
  return false;
}

/** Si `run` aparece entero y en orden dentro de `words`. */
function containsRun(words: string[], run: string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start++) {
    if (run.every((word, offset) => words[start + offset] === word)) return true;
  }
  return false;
}

/** Las palabras de un texto escritas como un código de infracción: «Conducir rápido» da CONDUCIR y RAPIDO. */
function wordsOf(text: string): string[] {
  return text
    .normalize('NFKD')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .map(infractionCodeFrom)
    .filter(Boolean);
}

/** C02 y C2 son el mismo código. */
function withoutLeadingZeros(code: string): string {
  return code.replace(/(?<![0-9])0+(?=[0-9])/g, '');
}
