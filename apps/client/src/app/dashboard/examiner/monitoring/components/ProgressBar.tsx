import { barColor } from './progress-colors';

/** Barra de avance con su porcentaje al lado. */
export function ProgressBar({ percent, className = 'max-w-[120px]' }: { percent: number; className?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex-1 h-2 bg-muted rounded-full overflow-hidden ${className}`}>
        <div className={`h-full rounded-full transition-all ${barColor(percent)}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-bold text-muted-foreground w-10 text-right">{percent}%</span>
    </div>
  );
}
