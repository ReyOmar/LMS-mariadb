'use client';

import { Repeat2 } from 'lucide-react';
import { COUNTRIES, COUNTRY_INFO } from '@/lib/country';
import { useCountry } from '@/contexts/CountryContext';
import { CountryFlag } from '@/components/ui/CountryFlag';

/**
 * Cambio rápido a la otra sede, para usar junto al formulario de acceso.
 *
 * Sólo hay dos sedes, así que un desplegable sobraría: basta con ofrecer la contraria. Si
 * algún día hubiera más, este botón desaparece y el cambio se hace desde el indicador de
 * sede, que sí las lista todas.
 *
 * Está siempre disponible en el acceso, incluso con una sesión guardada en el navegador:
 * es justo entonces cuando alguien descubre que entró a la sede que no era.
 */
export function CountrySwitcher() {
  const { country, selectCountry } = useCountry();

  const others = COUNTRIES.filter((option) => option !== country);
  if (others.length !== 1) return null;

  const target = others[0];

  return (
    <button
      type="button"
      onClick={() => selectCountry(target)}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground hover:border-primary/50 hover:text-primary transition-colors"
      title={`Cambiar a la sede de ${COUNTRY_INFO[target].name}`}
    >
      <Repeat2 className="h-3.5 w-3.5" />
      <CountryFlag country={target} size="sm" />
      <span className="hidden sm:inline">{COUNTRY_INFO[target].name}</span>
    </button>
  );
}
