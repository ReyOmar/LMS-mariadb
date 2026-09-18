/**
 * Presentación de las calificaciones — espejo de `common/domain/calificacion.ts` en la API.
 *
 * Todo el sistema puntúa sobre 100 y se aprueba con 80 salvo que el curso indique otro
 * umbral. Estas funciones existen para que ninguna pantalla vuelva a escribir la escala a
 * mano: antes aparecía «/5.0» repetido en cinco componentes distintos.
 */

export const NOTA_MINIMA = 0;
export const NOTA_MAXIMA = 100;
export const NOTA_APROBACION_DEFECTO = 80;

/** Convierte a número una nota que puede llegar como string, null o undefined. */
export function aNota(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Umbral efectivo de un curso, con respaldo si el dato no llega. */
export function umbralAprobacion(notaCurso: unknown): number {
  const numero = aNota(notaCurso);
  if (numero === null || numero < NOTA_MINIMA || numero > NOTA_MAXIMA) return NOTA_APROBACION_DEFECTO;
  return numero;
}

export function esAprobada(nota: unknown, umbral: number = NOTA_APROBACION_DEFECTO): boolean {
  const numero = aNota(nota);
  return numero !== null && numero >= umbral;
}

/** Sólo el número: `85`, `87.5`, `—` si no hay nota. */
export function formatearPuntos(nota: unknown): string {
  const numero = aNota(nota);
  if (numero === null) return '—';
  return Number.isInteger(numero) ? String(numero) : numero.toFixed(1);
}

/** Nota con su escala: `85 / 100`. */
export function formatearNota(nota: unknown): string {
  const numero = aNota(nota);
  if (numero === null) return 'Sin calificar';
  return `${formatearPuntos(numero)} / ${NOTA_MAXIMA}`;
}

/** Porcentaje entero para barras de progreso y anillos. */
export function porcentaje(nota: unknown): number {
  const numero = aNota(nota);
  if (numero === null) return 0;
  return Math.min(100, Math.max(0, Math.round(numero)));
}

/**
 * Color semántico de una nota, en clases de Tailwind.
 * Aprobado en verde, cerca del umbral en ámbar y claramente insuficiente en rojo.
 */
export function colorDeNota(nota: unknown, umbral: number = NOTA_APROBACION_DEFECTO): string {
  const numero = aNota(nota);
  if (numero === null) return 'text-muted-foreground';
  if (numero >= umbral) return 'text-emerald-600 dark:text-emerald-400';
  if (numero >= umbral * 0.75) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}
