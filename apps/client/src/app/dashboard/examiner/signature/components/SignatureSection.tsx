import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function SignatureSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
      <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}
