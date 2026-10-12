'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { EmailEvent, EmailTemplate } from '@/types/models';
import { plural } from '@/lib/text';
import type { EmailCategory } from './categories';
import { EventCard } from './EventCard';

interface Props {
  category: EmailCategory;
  events: EmailEvent[];
  isToggling: (templateId: number) => boolean;
  onEdit: (event: EmailEvent, template: EmailTemplate) => void;
  onToggleActive: (template: EmailTemplate) => void;
}

export function CategoryGroup({ category, events, isToggling, onEdit, onToggleActive }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const { icon: Icon, label, color, backgroundColor, borderColor } = category;
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <section className="space-y-3">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((previous) => !previous)}
        className={`w-full flex items-center gap-3 p-3 sm:p-4 rounded-2xl border transition-all hover:shadow-sm ${backgroundColor} ${borderColor}`}
      >
        <div className={`h-9 w-9 rounded-xl ${backgroundColor} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <h2 className="flex-1 text-left font-bold text-sm sm:text-base">
          {label}
          <span className={`ml-2 text-xs font-medium ${color}`}>
            ({events.length} {plural(events.length, 'evento', 'eventos')})
          </span>
        </h2>
        <Chevron className="h-5 w-5 text-muted-foreground" />
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pl-0 sm:pl-2">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isToggling={isToggling}
              onEdit={(template) => onEdit(event, template)}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      )}
    </section>
  );
}
