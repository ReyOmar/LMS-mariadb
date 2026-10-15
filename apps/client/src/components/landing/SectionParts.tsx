import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';

/** Segundos entre la aparición de una tarjeta y la siguiente de su rejilla. */
export const REVEAL_STAGGER_S = 0.1;

/** Tarjeta translúcida de la portada; cada sección le añade su forma y su movimiento. */
export const CARD_CLASS =
  'group h-full bg-card/50 backdrop-blur-md border border-border/50 hover:border-primary/50 transition-all duration-500';

export function SectionHeading({
  badge,
  title,
  intro,
}: {
  badge?: { icon: LucideIcon; label: string };
  title: ReactNode;
  intro?: string;
}) {
  return (
    <Reveal className="text-center mb-16">
      {badge && (
        <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 text-primary text-sm font-bold px-4 py-1.5 rounded-full mb-4">
          <badge.icon className="h-4 w-4" /> {badge.label}
        </div>
      )}
      <h2 className="text-3xl md:text-5xl font-black tracking-tight">{title}</h2>
      {intro && <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">{intro}</p>}
    </Reveal>
  );
}

const TILE_SIZES = {
  sm: { box: 'h-12 w-12 rounded-xl', icon: 'h-6 w-6' },
  md: { box: 'h-14 w-14 rounded-2xl', icon: 'h-6 w-6' },
  lg: { box: 'h-16 w-16 rounded-2xl', icon: 'h-8 w-8' },
} as const;

/** Icono de una tarjeta, que se rellena del color primario al pasar por encima de ella. */
export function IconTile({
  icon: Icon,
  size,
  className = '',
}: {
  icon: LucideIcon;
  size: keyof typeof TILE_SIZES;
  className?: string;
}) {
  const { box, icon } = TILE_SIZES[size];

  return (
    <div
      className={`${box} bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary transition-all duration-500 ${className}`}
    >
      <Icon className={`${icon} text-primary group-hover:text-primary-foreground transition-colors duration-500`} />
    </div>
  );
}
