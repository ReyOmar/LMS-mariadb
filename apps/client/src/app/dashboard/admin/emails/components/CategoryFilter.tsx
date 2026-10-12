import { Filter } from 'lucide-react';
import { CATEGORIES } from './categories';

const IDLE = 'bg-card border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground';
const BUTTON =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap';

/** `null`: todas las categorías. Pulsar la categoría elegida la vuelve a quitar. */
export function CategoryFilter({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={`${BUTTON} ${value === null ? 'bg-primary/10 border-primary/30 text-primary' : IDLE}`}
      >
        <Filter className="h-3.5 w-3.5" /> Todos
      </button>
      {CATEGORIES.map(({ key, label, icon: Icon, color, backgroundColor, borderColor }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          aria-label={label}
          onClick={() => onChange(value === key ? null : key)}
          className={`${BUTTON} ${value === key ? `${backgroundColor} ${borderColor} ${color}` : IDLE}`}
        >
          <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
