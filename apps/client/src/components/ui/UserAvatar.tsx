'use client';

import { fileUrlFor } from '@/lib/api';
import { ROLE_STYLE } from '@/lib/role-style';
import { initials } from '@/lib/text';
import type { UserRole } from '@/types/models';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-lg',
} as const;

interface Props {
  person: { firstName: string; lastName: string; photoUrl?: string | null };
  role: UserRole;
  size?: keyof typeof SIZES;
  tone?: 'solid' | 'tint';
}

/** Foto de la persona o, si no tiene, sus iniciales en el color de su rol. */
export function UserAvatar({ person, role, size = 'sm', tone = 'solid' }: Props) {
  const photo = fileUrlFor(person.photoUrl);
  const initialsColor = tone === 'solid' ? `${ROLE_STYLE[role].solid} text-white` : ROLE_STYLE[role].tint;

  return (
    <div
      aria-hidden="true"
      className={`${SIZES[size]} shrink-0 overflow-hidden rounded-full flex items-center justify-center font-bold ${photo ? '' : initialsColor}`}
    >
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(person.firstName, person.lastName)
      )}
    </div>
  );
}
