import { MailCheck, MailX, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EmailEvent } from '@/types/models';

interface Stat {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  valueTone: string;
}

function statsOf(events: EmailEvent[]): Stat[] {
  const templates = events.flatMap((event) => event.templates);
  const active = templates.filter((template) => template.active).length;
  return [
    { label: 'Eventos', value: events.length, icon: Zap, tone: 'bg-primary/10 text-primary', valueTone: '' },
    {
      label: 'Activas',
      value: active,
      icon: MailCheck,
      tone: 'bg-emerald-500/10 text-emerald-500',
      valueTone: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      label: 'Inactivas',
      value: templates.length - active,
      icon: MailX,
      tone: 'bg-red-500/10 text-red-500',
      valueTone: 'text-red-700 dark:text-red-400',
    },
  ];
}

export function EmailStats({ events }: { events: EmailEvent[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {statsOf(events).map(({ label, value, icon: Icon, tone, valueTone }) => (
        <div key={label} className="bg-card border border-border/50 rounded-2xl p-3 sm:p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`hidden sm:flex h-9 w-9 shrink-0 rounded-xl items-center justify-center ${tone}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className={`text-2xl font-black ${valueTone}`}>{value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider truncate">
                {label}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
