import { Country, COUNTRY_INFO } from '@/lib/country';

/**
 * Bandera de una sede, dibujada como un círculo con las franjas del país.
 *
 * No se usa el emoji (🇨🇴, 🇲🇽) porque Windows no trae la fuente que los dibuja y los
 * muestra como las letras «CO» y «MX». Un degradado CSS se ve igual en cualquier sistema,
 * no pesa nada y acompaña bien al nombre sin robarle protagonismo.
 */

type Size = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-12 w-12',
};

export function CountryFlag({
  country,
  size = 'md',
  className = '',
}: {
  country: Country;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`Bandera de ${COUNTRY_INFO[country].name}`}
      title={COUNTRY_INFO[country].name}
      // `inline-block` es imprescindible: un `span` inline ignora alto y ancho, y la
      // bandera desaparecía fuera de los contenedores flex.
      className={`${SIZE_CLASSES[size]} inline-block shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20 shadow-sm ${className}`}
      style={{ backgroundImage: COUNTRY_INFO[country].stripes }}
    />
  );
}
