import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export const INPUT_CLASS =
  'w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all';

export function SettingsCard({
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
      <div className="p-6">{children}</div>
    </section>
  );
}
