'use client';

import dynamic from 'next/dynamic';

/**
 * Punto de entrada de las gráficas.
 *
 * Recharts es la dependencia más pesada del cliente y no se usa en la mayoría de pantallas,
 * así que se carga sólo cuando hace falta. Se difiere el módulo completo, no las piezas
 * sueltas de la librería: diferidas por separado se rompen, porque Recharts identifica a
 * sus hijos por el tipo del componente y el envoltorio de `dynamic()` no coincide con ninguno.
 *
 * `ssr: false` porque miden el contenedor: en el servidor no hay ancho que medir.
 */

const loading = () => null;

export const Donut = dynamic(() => import('./Charts').then((m) => m.Donut), { ssr: false, loading });

export const BarsByRange = dynamic(() => import('./Charts').then((m) => m.BarsByRange), {
  ssr: false,
  loading,
});

export const GroupedBars = dynamic(() => import('./Charts').then((m) => m.GroupedBars), {
  ssr: false,
  loading,
});

export const BarsByThreshold = dynamic(() => import('./Charts').then((m) => m.BarsByThreshold), {
  ssr: false,
  loading,
});

export const ActivityAreas = dynamic(() => import('./Charts').then((m) => m.ActivityAreas), {
  ssr: false,
  loading,
});

export const ProgressLine = dynamic(() => import('./Charts').then((m) => m.ProgressLine), {
  ssr: false,
  loading,
});

export type { Slice, ChartSeries, GroupedSeries, RangeBucket } from './Charts';
export { COLOR, breakdownColor } from './palette';
