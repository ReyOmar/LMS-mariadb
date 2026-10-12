import type { ReactNode } from 'react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { UserRole } from '@/types/models';
import { fullName, type Person } from '../assignment';

interface Props {
  person: Pick<Person, 'firstName' | 'lastName' | 'photoUrl'> & { email?: string };
  role: UserRole;
  details?: ReactNode;
}

export function PersonIdentity({ person, role, details }: Props) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <UserAvatar person={person} role={role} size="md" tone="tint" />
      <div className="min-w-0">
        <p className="text-sm font-bold truncate">{fullName(person)}</p>
        {person.email && <p className="text-xs text-muted-foreground truncate">{person.email}</p>}
        {details}
      </div>
    </div>
  );
}
