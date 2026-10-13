import { COLOR, type RangeBucket, type Slice } from '@/components/ui/charts';

/** Lo que tienen en común las cifras por curso de calificación y de pruebas. */
export interface ThresholdSummary {
  courseGuid: string;
  title: string;
  /** Nota mínima para aprobar en este curso. */
  threshold: number;
  /** Frontera del tramo intermedio: por debajo, la nota ni se acercó a aprobar. */
  borderline: number;
  scores: { low: number; mid: number; high: number };
}

/** Caracteres de un título que caben en una etiqueta corta, como las de las gráficas. */
const MAX_LABEL_LENGTH = 15;

export function shortLabel(text: string): string {
  return text.length > MAX_LABEL_LENGTH ? `${text.substring(0, MAX_LABEL_LENGTH)}...` : text;
}

/** Tramos de notas descritos respecto al umbral del curso; los recuentos vienen del servidor. */
export function scoreDistribution({
  threshold,
  borderline,
  scores,
}: Pick<ThresholdSummary, 'threshold' | 'borderline' | 'scores'>): RangeBucket[] {
  return [
    { name: `Por debajo de ${borderline}`, count: scores.low, fill: COLOR.failed },
    { name: `Entre ${borderline} y ${threshold - 1}`, count: scores.mid, fill: COLOR.pending },
    { name: `${threshold} o más (aprobado)`, count: scores.high, fill: COLOR.passed },
  ].filter((range) => range.count > 0);
}

/** Reparto en dos porciones; sin nada que repartir, una porción gris en lugar de un hueco. */
export function twoWayBreakdown(first: Slice, second: Slice, emptyLabel: string): Slice[] {
  if (first.value + second.value === 0) {
    return [{ name: emptyLabel, value: 1, color: COLOR.empty }];
  }
  return [first, second].filter((slice) => slice.value > 0);
}
