'use client';

import { fileUrlFor } from '@/lib/api';
import { initials } from '@/lib/text';
import type { User } from '@/types/models';
import { ROLE_DISPLAY } from './accounts';

/** Los tres tamaños que usa la pantalla: fila de tabla, tarjeta de móvil y ficha. */
const SIZES = {
  sm: { box: 'h-8 w-8', text: 'text-xs' },
  md: { box: 'h-10 w-10', text: 'text-sm' },
  lg: { box: 'h-12 w-12', text: 'text-lg' },
} as const;

/**
 * Foto de la cuenta, o sus iniciales sobre el color de su rol si no tiene.
 *
 * La foto es material de marca y se sirve sin firmar, de ahí `fileUrlFor`.
 */
export function AccountAvatar({ user, size = 'sm' }: { user: User; size?: keyof typeof SIZES }) {
  const { box, text } = SIZES[size];
  const photo = fileUrlFor(user.photoUrl);

  return (
    <div className={`${box} rounded-full shrink-0 overflow-hidden`}>
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          className={`h-full w-full flex items-center justify-center text-white font-bold ${text} ${ROLE_DISPLAY[user.role].background}`}
        >
          {initials(user.firstName, user.lastName)}
        </div>
      )}
    </div>
  );
}
