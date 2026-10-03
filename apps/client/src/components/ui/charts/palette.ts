/**
 * Colores de las gráficas.
 *
 * El color aquí **significa algo**: verde es aprobado, ámbar es pendiente, rojo es
 * suspenso, y es el mismo tono en todos los paneles.
 *
 * Los tonos se eligieron para leerse sobre fondo claro y oscuro: el tema sólo cambia el
 * fondo de la tarjeta, y estos valores mantienen contraste suficiente en ambos. Por eso
 * son fijos y no variables CSS —una variable que cambia con el tema haría que «aprobado»
 * pasara de verde a otra cosa, y el color dejaría de significar lo mismo.
 */

export const COLOR = {
  /** Superado, calificado, al día. */
  passed: '#10b981',
  /** Esperando acción de alguien. */
  pending: '#f59e0b',
  /** No alcanzó el umbral. */
  failed: '#ef4444',
  /** Avance, sesiones, actividad general. */
  activity: '#6366f1',
  /** Segunda serie cuando hay dos líneas o dos áreas. */
  secondary: '#0ea5e9',
  /** Sin datos que mostrar. */
  empty: '#94a3b8',
} as const;

/**
 * Colores para repartos sin significado propio, como «matrículas por curso».
 * Se alternan tonos separados en el círculo cromático para que dos porciones contiguas
 * nunca se confundan, incluso vistas en escala de grises.
 */
const BREAKDOWN_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#64748b',
] as const;

export function breakdownColor(index: number): string {
  return BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length];
}

/** Verde si llega al umbral, rojo si no. Es la regla de color más repetida del campus. */
export function colorByThreshold(value: number, threshold: number): string {
  return value >= threshold ? COLOR.passed : COLOR.failed;
}
