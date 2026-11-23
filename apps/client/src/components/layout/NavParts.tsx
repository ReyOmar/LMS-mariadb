import Link from 'next/link';
import { isActiveLink, type MenuSection } from './navigation';

/** Recuento junto a una sección (solicitudes, mensajes). Sin nada pendiente no se pinta. */
export function NavCount({ value, className = '' }: { value: number; className?: string }) {
  if (value <= 0) return null;
  return (
    <span
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold tabular-nums text-accent-foreground ${className}`}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}

/** Secciones agrupadas con su título: el contenido de «Más» en el ordenador y en el teléfono. */
export function NavSectionList({ sections, pathname }: { sections: MenuSection[]; pathname: string }) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </p>
          <ul>
            {section.links.map((link) => {
              const active = isActiveLink(link, pathname);
              const Icon = link.icon;
              return (
                <li key={link.href}>
                  <Link
                    prefetch
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors ${
                      active ? 'bg-primary/10 font-semibold text-primary' : 'font-medium text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? '' : 'text-muted-foreground'}`} />
                    <span className="truncate">{link.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
