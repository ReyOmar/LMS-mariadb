/**
 * Escala de calificación del LMS — fuente única de verdad.
 *
 * Todo el sistema califica sobre 100 puntos. Antes existían ocho copias del par
 * "escala 0–5 / umbral 3.0" repartidas por servicios, listeners, scheduler, DTOs y
 * generación de PDF; cambiar la escala obligaba a tocarlas todas. Cualquier lugar que
 * necesite una nota, un umbral o su representación debe importar desde aquí.
 */

/** Nota mínima posible. */
export const NOTA_MINIMA = 0;

/** Nota máxima posible. */
export const NOTA_MAXIMA = 100;

/**
 * Umbral de aprobación por defecto para cursos nuevos.
 * Cada curso puede subirlo o bajarlo en `lms_cursos.nota_aprobacion`.
 */
export const NOTA_APROBACION_DEFECTO = 80;

/** Decimales que se conservan al almacenar una nota. */
const DECIMALES = 2;

/**
 * Ajusta una nota al rango válido y a la precisión de almacenamiento.
 * Un valor no numérico (NaN, null tras un cast, etc.) se trata como 0 en lugar de
 * propagar NaN hasta la base de datos.
 */
export function normalizarNota(valor: number): number {
  if (!Number.isFinite(valor)) return NOTA_MINIMA;
  const acotada = Math.min(NOTA_MAXIMA, Math.max(NOTA_MINIMA, valor));
  return Number(acotada.toFixed(DECIMALES));
}

/**
 * Convierte a número una nota que puede venir como `Decimal` de Prisma, string o null.
 * Devuelve `null` cuando no hay nota, para distinguir "sin calificar" de "sacó 0".
 */
export function aNota(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const num = Number(valor);
  return Number.isFinite(num) ? num : null;
}

/**
 * Umbral de aprobación efectivo de un curso.
 * Si el curso no lo define o guarda un valor corrupto, se usa el umbral por defecto:
 * nunca se deja pasar una entrega por un dato ausente.
 */
export function umbralAprobacion(notaAprobacionCurso: unknown): number {
  const num = aNota(notaAprobacionCurso);
  if (num === null || num < NOTA_MINIMA || num > NOTA_MAXIMA) {
    return NOTA_APROBACION_DEFECTO;
  }
  return num;
}

/** Indica si una nota alcanza el umbral. Sin nota nunca se aprueba. */
export function esAprobada(nota: unknown, umbral: number): boolean {
  const num = aNota(nota);
  return num !== null && num >= umbral;
}

/**
 * Nota de un cuestionario a partir de aciertos.
 * Sin preguntas la nota es 0: un quiz vacío no puede aprobar a nadie.
 */
export function notaDeCuestionario(correctas: number, total: number): number {
  if (total <= 0) return NOTA_MINIMA;
  return normalizarNota((correctas / total) * NOTA_MAXIMA);
}

/** Promedio de un conjunto de notas. Devuelve `null` si no hay ninguna. */
export function promedioNotas(notas: readonly unknown[]): number | null {
  const valores = notas.map(aNota).filter((n): n is number => n !== null);
  if (valores.length === 0) return null;
  const suma = valores.reduce((acc, n) => acc + n, 0);
  return normalizarNota(suma / valores.length);
}

/**
 * Representación de una nota para el usuario final: `"85 / 100"`.
 * Se usa en correos, notificaciones y certificados para que el formato no diverja.
 */
export function formatearNota(nota: unknown): string {
  const num = aNota(nota);
  if (num === null) return 'sin calificar';
  return `${formatearPuntos(num)} / ${NOTA_MAXIMA}`;
}

/**
 * Sólo el número, sin decimales innecesarios: `85`, `87.5`.
 * Pensado para incrustar en frases donde la escala ya está clara por el contexto.
 */
export function formatearPuntos(nota: unknown): string {
  const num = aNota(nota);
  if (num === null) return '—';
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}
