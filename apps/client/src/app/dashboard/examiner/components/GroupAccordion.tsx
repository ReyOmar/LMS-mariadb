'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, FileText } from 'lucide-react';

/** Qué grupos del acordeón están desplegados; todos empiezan plegados. */
export function useExpandedGroups() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return {
    isOpen: (key: string) => Boolean(expanded[key]),
    toggle: (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] })),
  };
}

function Chevron({ open, className }: { open: boolean; className: string }) {
  return <ChevronDown className={`transition-transform duration-300 ${open ? 'rotate-180' : ''} ${className}`} />;
}

interface ModuleGroupProps {
  title: string;
  icon: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Primer nivel del acordeón del examinador: un módulo del curso. */
export function ModuleGroup({ title, icon, subtitle, aside, open, onToggle, children }: ModuleGroupProps) {
  return (
    <section className="animate-in slide-in-from-bottom-2 duration-300">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className={`w-full text-left bg-primary/5 p-4 border border-primary/20 flex items-center gap-3 transition-colors hover:bg-primary/10 ${open ? 'rounded-t-2xl' : 'rounded-2xl'}`}
        >
          <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {icon}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-lg sm:text-xl font-bold text-foreground truncate">{title}</span>
            {subtitle && <span className="block text-xs text-muted-foreground font-medium mt-0.5">{subtitle}</span>}
          </span>
          {aside}
          <span className="p-2 bg-background/50 rounded-lg shrink-0">
            <Chevron open={open} className="h-5 w-5 text-primary" />
          </span>
        </button>
      </h2>
      {open && (
        <div className="border border-t-0 border-border rounded-b-2xl p-4 sm:p-6 bg-card space-y-6">{children}</div>
      )}
    </section>
  );
}

interface ActivityGroupProps {
  title: string;
  aside?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Segundo nivel: una tarea o un cuestionario del módulo, con sus alumnos debajo. */
export function ActivityGroup({ title, aside, open, onToggle, children }: ActivityGroupProps) {
  return (
    <div className="space-y-4">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="w-full text-left flex items-center gap-3 pb-3 border-b border-border/50 group"
        >
          <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors shrink-0">
            <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </span>
          <span className="text-base sm:text-lg font-bold text-foreground flex-1 truncate group-hover:text-primary transition-colors">
            {title}
          </span>
          <span className="flex items-center gap-2">
            {aside}
            <Chevron open={open} className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
      </h3>
      {open && (
        <div className="grid grid-cols-1 gap-4 pl-2 md:pl-4 border-l-2 border-border/50 animate-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
