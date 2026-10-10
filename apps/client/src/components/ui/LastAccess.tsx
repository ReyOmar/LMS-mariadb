'use client';

import { Clock } from 'lucide-react';
import { useRealtime } from '@/contexts/RealtimeContext';
import { shortDateTime, timeAgo } from '@/lib/dates';

/**
 * Cuándo se vio por última vez a una cuenta.
 *
 * Tiene tres estados y se distinguen a propósito: «en línea» lo dice la presencia en
 * tiempo real, «sin acceso» es una cuenta que nunca ha entrado —que no es lo mismo que
 * llevar mucho sin hacerlo— y el resto es una fecha relativa.
 *
 * El texto relativo se recalcula en cada render; quien pinta la lista refresca cada
 * minuto para que no se quede congelado.
 */
export function LastAccess({ guid, date }: { guid: string; date?: string | null }) {
  const { onlineUsers } = useRealtime();

  if (onlineUsers.has(guid)) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded-full w-fit">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        En línea
      </span>
    );
  }

  const text = timeAgo(date);
  if (!text) {
    return (
      <span className="text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" /> Sin acceso
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={date ? shortDateTime(date) : undefined}
    >
      <Clock className="h-3 w-3" />
      {text}
    </span>
  );
}
