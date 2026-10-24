'use client';

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Text,
  Tooltip,
  XAxis,
  YAxis,
  type XAxisTickContentProps,
} from 'recharts';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { COLOR, colorByThreshold } from './palette';

/**
 * Las gráficas del campus, en un solo sitio.
 *
 * **Importante:** Recharts se importa aquí de forma normal, no con `next/dynamic`: Recharts
 * reconoce a sus hijos **por el tipo del componente**, y un envoltorio de carga diferida no
 * coincide con ninguno (las porciones saldrían grises o vacías). La carga diferida se
 * aplica a este módulo entero desde `index.ts`.
 */

/*
 * Las gráficas se dibujan sin animación de entrada (`isAnimationActive={false}`). Además
 * de evitar el parpadeo al cargar, es lo que hace que se dibujen: con la animación activa,
 * Recharts 3 deja el trazo vacío cuando el contenedor se mide después del primer render,
 * que es justo lo que pasa con la carga diferida.
 */

// ── Estilos compartidos ────────────────────────────────────────────────────

/** El globo de información usa los colores del tema para no cantar sobre la tarjeta. */
const TOOLTIP = {
  cursor: { fill: 'currentColor', opacity: 0.05 },
  contentStyle: {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold' as const,
  },
  itemStyle: { color: 'hsl(var(--foreground))' },
  labelStyle: { color: 'hsl(var(--muted-foreground))' },
};

const AXIS = {
  axisLine: false as const,
  tickLine: false as const,
  tick: { fill: 'currentColor', fontSize: 12 },
  className: 'text-muted-foreground',
};

/**
 * Cada gráfica ocupa su tarjeta y se redimensiona con ella. Se usa `responsive` del propio
 * gráfico y no `ResponsiveContainer`, que pinta un primer render sin medir y avisa en la
 * consola de un tamaño negativo en cada montaje.
 */
const FILL = { responsive: true, width: '100%', height: '100%' } as const;

const GRID = {
  strokeDasharray: '3 3',
  vertical: false as const,
  stroke: 'currentColor',
  className: 'text-border/40',
};

/** Cifras de ejes y globos escritas como en las tarjetas de la sede: 2.069 en Colombia, 2,069 en México. */
function useNumberFormat(): (value: unknown) => string {
  const { country } = useCountry();
  return (value) => (typeof value === 'number' ? formatNumber(value, country) : String(value ?? ''));
}

function NoData({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm text-center">
      {icon}
      <span>{message}</span>
    </div>
  );
}

// ── Tipos de datos ─────────────────────────────────────────────────────────

export interface Slice {
  name: string;
  value: number;
  color: string;
}

export interface RangeBucket {
  name: string;
  count: number;
  fill: string;
}

/** Una serie de una gráfica: la clave del dato, el nombre que ve el usuario y su color. */
export interface ChartSeries {
  dataKey: string;
  label: string;
  color: string;
}

export interface GroupedSeries {
  name: string;
  /** Identificador de la fila, para poder navegar al pulsarla. */
  guid?: string;
  [series: string]: string | number | undefined;
}

// ── Gráficas ───────────────────────────────────────────────────────────────

/**
 * Anillo con leyenda al lado. Se usa para repartos de dos o tres estados.
 * El borde de cada porción toma el color de la tarjeta, que es lo que las separa.
 */
export function Donut({
  data,
  empty,
  legend = true,
}: {
  data: Slice[];
  empty?: string;
  /** Se desactiva cuando el panel ya lista las porciones aparte, para no repetirlas. */
  legend?: boolean;
}) {
  const format = useNumberFormat();
  if (data.length === 0) return <NoData message={empty ?? 'Todavía no hay datos.'} />;

  // Con una sola porción visible no hay nada que separar: el hueco deja el anillo sin
  // dibujar y el borde, una muesca en el punto donde empieza.
  const separated = data.filter((slice) => slice.value > 0).length > 1;

  return (
    <PieChart {...FILL}>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={55}
        outerRadius={80}
        paddingAngle={separated ? 4 : 0}
        dataKey="value"
        stroke={separated ? 'hsl(var(--card))' : 'none'}
        strokeWidth={3}
        isAnimationActive={false}
      >
        {data.map((slice) => (
          <Cell key={slice.name} fill={slice.color} style={{ outline: 'none' }} />
        ))}
      </Pie>
      <Tooltip {...TOOLTIP} formatter={format} />
      {legend && (
        <Legend
          verticalAlign="middle"
          align="right"
          layout="vertical"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '13px', fontWeight: 500, paddingLeft: 20 }}
        />
      )}
    </PieChart>
  );
}

/** Barras con un color propio por tramo. Se usa para repartos de notas o de avance. */
export function BarsByRange({
  ranges,
  unit = 'estudiantes',
  empty,
  icon,
}: {
  ranges: RangeBucket[];
  unit?: string;
  empty?: string;
  icon?: ReactNode;
}) {
  const format = useNumberFormat();
  if (ranges.length === 0) {
    return <NoData message={empty ?? 'Aún no hay datos para mostrar.'} icon={icon} />;
  }

  return (
    <BarChart {...FILL} data={ranges} margin={{ top: 10, right: 20, left: -10, bottom: 15 }}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="name" {...AXIS} tick={RangeTick} interval={0} />
      <YAxis allowDecimals={false} {...AXIS} tickFormatter={format} />
      <Tooltip {...TOOLTIP} formatter={(value) => [`${format(value)} ${unit}`, 'Cantidad']} />
      <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60} isAnimationActive={false}>
        {ranges.map((range) => (
          <Cell key={range.name} fill={range.fill} />
        ))}
      </Bar>
    </BarChart>
  );
}

/**
 * Nombre de un tramo bajo su barra. Se muestran todos, así que en un móvil se parte en líneas
 * para no montarse con el del tramo de al lado.
 */
function RangeTick({ x, y, width, visibleTicksCount, payload }: XAxisTickContentProps) {
  return (
    <Text
      x={x}
      y={y}
      width={Number(width) / visibleTicksCount}
      dy={8}
      textAnchor="middle"
      verticalAnchor="start"
      {...AXIS.tick}
      fontWeight={600}
    >
      {payload.value}
    </Text>
  );
}

/**
 * Varias series agrupadas por fila. Pulsar una fila avisa con su `guid`, que es como se
 * entra al detalle desde la gráfica.
 */
export function GroupedBars({
  data,
  series,
  onPick,
  empty,
}: {
  data: GroupedSeries[];
  series: ChartSeries[];
  onPick?: (guid: string) => void;
  empty?: string;
}) {
  const format = useNumberFormat();
  if (data.length === 0) return <NoData message={empty ?? 'Todavía no hay datos.'} />;

  return (
    <BarChart
      {...FILL}
      data={data}
      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
      style={onPick ? { cursor: 'pointer' } : undefined}
      onClick={(status) => {
        if (!onPick) return;
        // Recharts no tipa `activePayload`, pero lo entrega: es la única forma de saber
        // qué barra se pulsó.
        const clicked = status as { activePayload?: { payload?: GroupedSeries }[] };
        const guid = clicked?.activePayload?.[0]?.payload?.guid;
        if (guid) onPick(guid);
      }}
    >
      <CartesianGrid {...GRID} />
      <XAxis dataKey="name" {...AXIS} tick={{ ...AXIS.tick, fontWeight: 600 }} dy={8} />
      <YAxis allowDecimals={false} {...AXIS} tickFormatter={format} />
      <Tooltip {...TOOLTIP} formatter={format} />
      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
      {series.map((item) => (
        <Bar
          key={item.dataKey}
          dataKey={item.dataKey}
          name={item.label}
          fill={item.color}
          radius={[6, 6, 0, 0]}
          maxBarSize={60}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
}

/** Una fila con el umbral que debe alcanzar: cada curso puede exigir una nota distinta. */
interface ThresholdRow extends GroupedSeries {
  threshold: number;
}

/** Barras cuyo color depende de si el valor llega al umbral de su propia fila. */
export function BarsByThreshold({
  data,
  dataKey,
  label,
  unit = 'puntos',
  empty,
}: {
  data: ThresholdRow[];
  dataKey: string;
  /** Nombre del dato en el tooltip. */
  label: string;
  unit?: string;
  empty?: string;
}) {
  const format = useNumberFormat();
  if (data.length === 0) return <NoData message={empty ?? 'Todavía no hay datos.'} />;

  return (
    <BarChart {...FILL} data={data} margin={{ top: 10, right: 20, left: -10, bottom: 15 }}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="name" {...AXIS} tick={{ ...AXIS.tick, fontWeight: 600 }} dy={8} />
      <YAxis allowDecimals={false} {...AXIS} tickFormatter={format} />
      <Tooltip {...TOOLTIP} formatter={(value) => [`${format(value)} ${unit}`, label]} />
      <Bar dataKey={dataKey} radius={[6, 6, 0, 0]} maxBarSize={60} isAnimationActive={false}>
        {data.map((row, i) => (
          <Cell
            key={row.guid ?? `${row.name}-${i}`}
            fill={colorByThreshold(Number(row[dataKey] ?? 0), row.threshold)}
          />
        ))}
      </Bar>
    </BarChart>
  );
}

/** Dos áreas superpuestas con degradado. Se usa para la actividad de la última semana. */
export function ActivityAreas({ data, series }: { data: GroupedSeries[]; series: ChartSeries[] }) {
  const format = useNumberFormat();
  return (
    <AreaChart {...FILL} data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
      <defs>
        {series.map((item) => (
          <linearGradient key={item.dataKey} id={`gradient-${item.dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={item.color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={item.color} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="name" {...AXIS} dy={8} />
      <YAxis allowDecimals={false} {...AXIS} tickFormatter={format} />
      <Tooltip {...TOOLTIP} formatter={format} />
      {series.map((item) => (
        <Area
          key={item.dataKey}
          type="monotone"
          dataKey={item.dataKey}
          name={item.label}
          stroke={item.color}
          strokeWidth={2}
          fill={`url(#gradient-${item.dataKey})`}
          isAnimationActive={false}
        />
      ))}
    </AreaChart>
  );
}

/** Una línea con puntos marcados. Se usa para el avance de un alumno a lo largo del curso. */
export function ProgressLine({
  data,
  dataKey,
  label = 'Avance',
  unit = '%',
  empty,
}: {
  data: GroupedSeries[];
  dataKey: string;
  /** Nombre del dato en el tooltip. */
  label?: string;
  unit?: string;
  empty?: string;
}) {
  const format = useNumberFormat();
  if (data.length === 0) return <NoData message={empty ?? 'Todavía no hay avance registrado.'} />;

  return (
    <LineChart {...FILL} data={data} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
      <CartesianGrid {...GRID} />
      <XAxis dataKey="name" {...AXIS} dy={8} />
      <YAxis allowDecimals={false} {...AXIS} tickFormatter={format} />
      <Tooltip {...TOOLTIP} formatter={(value) => [`${format(value)}${unit}`, label]} />
      <Line
        type="monotone"
        dataKey={dataKey}
        stroke={COLOR.activity}
        strokeWidth={3}
        dot={{ r: 5, fill: COLOR.activity, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
        activeDot={{ r: 7, fill: COLOR.activity, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
