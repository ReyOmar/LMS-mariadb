import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  /** Con `false`, el contenido pone su propio relleno. */
  padded?: boolean;
  children: ReactNode;
}

/** Bloque de una pantalla de ajustes: cabecera con icono y título, y su contenido. */
export function SectionCard({ icon: Icon, title, padded = true, children }: Props) {
  return (
    <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-foreground">{title}</h2>
      </div>
      {padded ? <div className="p-6">{children}</div> : children}
    </section>
  );
}
