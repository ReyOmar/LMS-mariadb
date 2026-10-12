import type { EditableField } from '../landing-fields';

const DOCUMENT_ROWS = 12;
const AREA_ROWS = 3;

export function LandingField({
  definition,
  value,
  onChange,
}: {
  definition: EditableField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${String(definition.field)}`;
  const isDocument = definition.type === 'document';
  const isLong = definition.type === 'area' || isDocument;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <label htmlFor={id} className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          {definition.label}
        </label>
        {definition.limit && (
          <span
            className={`text-xs tabular-nums ${
              value.length > definition.limit ? 'text-destructive font-bold' : 'text-muted-foreground'
            }`}
          >
            {value.length} / {definition.limit}
          </span>
        )}
      </div>

      {isLong ? (
        <textarea
          id={id}
          value={value}
          rows={isDocument ? DOCUMENT_ROWS : AREA_ROWS}
          placeholder={definition.placeholder}
          onChange={(event) => onChange(event.target.value)}
          maxLength={definition.limit}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={definition.placeholder}
          onChange={(event) => onChange(event.target.value)}
          maxLength={definition.limit}
          className="w-full h-11 rounded-xl border border-border bg-background px-4 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      )}

      {definition.hint && <p className="text-xs text-muted-foreground mt-1.5">{definition.hint}</p>}

      {/* El formato que entiende la página legal (`parseLegalText`). */}
      {isDocument && (
        <p className="text-xs text-muted-foreground mt-1.5">
          Formato: una línea que empieza por <code className="rounded bg-muted px-1 font-mono">##&nbsp;</code> se
          muestra como subtítulo y las que empiezan por <code className="rounded bg-muted px-1 font-mono">-&nbsp;</code>{' '}
          forman una lista. Deja una línea en blanco entre párrafos.
        </p>
      )}
    </div>
  );
}
