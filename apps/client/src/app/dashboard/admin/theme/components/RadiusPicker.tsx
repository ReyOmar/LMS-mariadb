const MAX_RADIUS = 24;

const PRESETS = [
  { value: 0, label: 'Cuadrado' },
  { value: 4, label: '4px' },
  { value: 8, label: '8px' },
  { value: 12, label: '12px' },
  { value: 16, label: '16px' },
  { value: MAX_RADIUS, label: 'Muy redondeado' },
] as const;

export function RadiusPicker({ value, onChange }: { value: number; onChange: (radius: number) => void }) {
  const rounded = { borderRadius: `${value}px` };

  return (
    <>
      <div className="flex items-center gap-6">
        <input
          type="range"
          min={0}
          max={MAX_RADIUS}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
          aria-label="Redondeo de bordes en píxeles"
        />
        <span className="text-sm font-mono font-bold w-16 text-center bg-muted/50 px-2 py-1 rounded-lg">{value}px</span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div
          className="h-16 w-24 sm:w-32 bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-xs font-bold text-primary"
          style={rounded}
        >
          Tarjeta
        </div>
        <span className="bg-primary text-primary-foreground px-6 py-2 font-bold text-sm" style={rounded}>
          Botón
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-pressed={value === preset.value}
            onClick={() => onChange(preset.value)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
              value === preset.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/30 text-muted-foreground'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </>
  );
}
