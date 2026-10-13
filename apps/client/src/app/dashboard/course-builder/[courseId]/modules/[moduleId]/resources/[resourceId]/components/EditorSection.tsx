import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  optional?: boolean;
  children: ReactNode;
}

/** Recuadro de un ajuste opcional del recurso: enlace de referencia, adjunto o límite de entrega. */
export function EditorSection({ icon: Icon, title, optional = false, children }: Props) {
  return (
    <div className="border border-border/50 rounded-xl p-5 bg-muted/5 space-y-4">
      <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Icon className="h-4 w-4" /> {title}
        {optional && <span className="text-xs font-normal lowercase tracking-normal">(opcional)</span>}
      </h3>
      {children}
    </div>
  );
}
