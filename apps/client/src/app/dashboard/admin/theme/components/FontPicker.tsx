import { FONTS, fontFamilyOf } from '@/lib/theme';

export function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {FONTS.map((font) => (
        <button
          key={font}
          type="button"
          aria-pressed={value === font}
          onClick={() => onChange(font)}
          className={`rounded-xl border p-4 text-center transition-all ${
            value === font
              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
              : 'border-border hover:border-primary/30'
          }`}
        >
          <span className="block text-xl font-bold" style={{ fontFamily: fontFamilyOf(font) }}>
            Aa
          </span>
          <span className="block text-xs font-medium mt-1 text-muted-foreground">{font}</span>
        </button>
      ))}
    </div>
  );
}
