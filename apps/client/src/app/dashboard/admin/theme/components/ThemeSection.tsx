import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="bg-card/70 backdrop-blur-md border border-border/50 rounded-2xl p-4 sm:p-8 shadow-sm mb-8">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  /** Sólo cuando el campo es un único control al que asociar el rótulo. */
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-bold text-muted-foreground mb-2 block uppercase tracking-wider">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}
