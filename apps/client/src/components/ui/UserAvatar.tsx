'use client';

import { useState } from 'react';
import { fileUrlFor } from '@/lib/api';
import { ROLE_STYLE } from '@/lib/role-style';
import { initials } from '@/lib/text';
import type { UserRole } from '@/types/models';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-lg',
} as const;

interface Person {
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
}

/** La foto de la persona o, si no tiene o no carga, sus iniciales. Ocupa todo su contenedor. */
export function PhotoOrInitials({ person }: { person: Person }) {
  const photo = fileUrlFor(person.photoUrl);
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);

  if (!photo || brokenPhoto === photo) return <>{initials(person.firstName, person.lastName)}</>;
  return <img src={photo} alt="" className="h-full w-full object-cover" onError={() => setBrokenPhoto(photo)} />;
}

interface Props {
  person: Person;
  role: UserRole;
  size?: keyof typeof SIZES;
  tone?: 'solid' | 'tint';
}

/** Avatar redondo con el color del rol detrás de las iniciales. */
export function UserAvatar({ person, role, size = 'sm', tone = 'solid' }: Props) {
  const color = tone === 'solid' ? `${ROLE_STYLE[role].solid} text-white` : ROLE_STYLE[role].tint;

  return (
    <div
      aria-hidden="true"
      className={`${SIZES[size]} ${color} shrink-0 overflow-hidden rounded-full flex items-center justify-center font-bold`}
    >
      <PhotoOrInitials person={person} />
    </div>
  );
}
