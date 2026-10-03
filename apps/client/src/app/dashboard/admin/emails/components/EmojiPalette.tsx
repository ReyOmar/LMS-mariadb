'use client';

import { useState } from 'react';
import { Smile } from 'lucide-react';

/**
 * Emojis que se ofrecen para los correos del campus.
 *
 * La lista es corta a propósito: son los que tienen sentido en un aviso de formación y se
 * ven igual en todos los gestores de correo. Un selector con miles de emojis sería una
 * pieza enorme para una necesidad que se cubre con dieciséis.
 */
const EMOJIS = ['🎉', '✅', '⚠️', '❌', '🎓', '🏆', '📘', '📝', '📅', '⏰', '🔔', 'ℹ️', '🚗', '🛡️', '👍', '✨'];

export function EmojiPalette({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full text-left p-3 bg-card border border-border/50 rounded-xl hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3 shadow-sm hover:shadow"
      >
        <span className="inline-flex items-center gap-1 font-bold rounded-full border text-xs px-2.5 py-1 bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-500/30 whitespace-nowrap">
          <Smile className="h-3 w-3" /> Emoji
        </span>
        <span className="flex-1 text-[11px] text-muted-foreground truncate">Elige uno e insértalo</span>
      </button>

      {open && (
        <div className="mt-2 p-2 bg-card border border-border/50 rounded-xl shadow-lg grid grid-cols-8 gap-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              title={`Insertar ${emoji}`}
              aria-label={`Insertar ${emoji}`}
              // `mousedown` para no perder el punto donde se estaba escribiendo.
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(emoji);
                setOpen(false);
              }}
              // Desde el teclado sólo llega el `click`, con `detail` a cero.
              onClick={(event) => {
                if (event.detail !== 0) return;
                onSelect(emoji);
                setOpen(false);
              }}
              className="h-8 w-8 flex items-center justify-center text-lg rounded-lg hover:bg-primary/10 transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
