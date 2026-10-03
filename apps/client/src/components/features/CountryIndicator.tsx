'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, Country, COUNTRY_INFO } from '@/lib/country';
import { useCountry } from '@/contexts/CountryContext';
import { CountryFlag } from '@/components/ui/CountryFlag';

/**
 * Sede activa y, en las pantallas públicas, el sitio desde el que se cambia.
 *
 * Al haber dos operaciones con catálogos distintos, ver en cuál se está evita la confusión
 * de «no veo mis cursos» cuando en realidad se está mirando la otra.
 *
 * Dentro del campus (`readOnly`) la sede la manda la cuenta y aquí sólo se informa. En la
 * portada y en el acceso siempre se puede cambiar, aunque haya una sesión guardada en el
 * navegador: es la única salida para quien llegó a la sede equivocada.
 */
export function CountryIndicator({ compact = false, readOnly = false }: { compact?: boolean; readOnly?: boolean }) {
  const { country, selectCountry } = useCountry();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const label = (
    <>
      <CountryFlag country={country} size="sm" />
      {!compact && <span className="font-semibold">{COUNTRY_INFO[country].name}</span>}
    </>
  );

  if (readOnly) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm"
        title={`Estás en la sede de ${COUNTRY_INFO[country].name}`}
      >
        {label}
      </span>
    );
  }

  const change = (selected: Country) => {
    selectCountry(selected);
    setOpen(false);
  };

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm hover:border-primary/50 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sede actual: ${COUNTRY_INFO[country].name}. Pulsa para cambiar.`}
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border bg-card shadow-xl overflow-hidden z-50">
          <p className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Elige tu sede
          </p>

          <ul role="listbox">
            {COUNTRIES.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option === country}
                  onClick={() => change(option)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors ${
                    option === country ? 'font-bold text-primary' : ''
                  }`}
                >
                  <CountryFlag country={option} />
                  <span className="flex-1">{COUNTRY_INFO[option].name}</span>
                  {option === country && <Check className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>

          <p className="px-4 py-3 border-t border-border/60 text-[11px] leading-relaxed text-muted-foreground">
            Cada sede tiene sus propios cursos y certificados. Tu cuenta pertenece sólo a una.
          </p>
        </div>
      )}
    </div>
  );
}
