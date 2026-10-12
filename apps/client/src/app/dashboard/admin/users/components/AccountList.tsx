'use client';

import { GraduationCap, Key, Loader2, Mail, Presentation, Shield, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole, User } from '@/types/models';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { LastAccess } from '@/components/ui/LastAccess';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { LoadMoreButton } from '@/components/ui/LoadMoreButton';
import { SearchInput } from '@/components/ui/SearchInput';
import { ROLE_STYLE } from '@/lib/role-style';
import { shortDate } from '@/lib/dates';
import { clickable } from '@/lib/clickable';
import { formatNumber } from '@/lib/country';
import { searchQuery } from '@/lib/search';
import { useCountry } from '@/contexts/CountryContext';
import type { Accounts, CountByRole } from '../useAccounts';

interface Props {
  accounts: Accounts;
  tab: UserRole;
  search: string;
  onTabChange: (tab: UserRole) => void;
  onSearch: (text: string) => void;
  onOpenDetails: (user: User) => void;
  onNewAccount: () => void;
}

const NO_ACCOUNTS: CountByRole = { ADMIN: 0, TEACHER: 0, STUDENT: 0 };

const TABS: { role: UserRole; label: string; Icon: LucideIcon }[] = [
  { role: 'ADMIN', label: 'Administradores', Icon: Shield },
  { role: 'TEACHER', label: 'Examinadores', Icon: Presentation },
  { role: 'STUDENT', label: 'Estudiantes', Icon: GraduationCap },
];

export function AccountList({ accounts, tab, search, onTabChange, onSearch, onOpenDetails, onNewAccount }: Props) {
  const { country } = useCountry();
  const counts = accounts.totals?.byRole ?? NO_ACCOUNTS;

  return (
    <>
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 animate-in slide-in-from-bottom-4 duration-500">
        <div className="overflow-x-auto -mx-1 px-1 w-full xl:w-auto">
          <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50 min-w-0">
            {TABS.map(({ role, label, Icon }) => (
              <button
                key={role}
                type="button"
                aria-pressed={tab === role}
                aria-label={`${label} (${formatNumber(counts[role], country)})`}
                title={label}
                onClick={() => onTabChange(role)}
                className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${tab === role ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className={`h-4 w-4 ${ROLE_STYLE[role].text} shrink-0`} />
                <span className="hidden sm:inline">{label}</span> ({formatNumber(counts[role], country)})
              </button>
            ))}
          </div>
        </div>

        <SearchInput
          className="w-full xl:w-80 shrink-0"
          value={search}
          onChange={onSearch}
          label="Buscar por nombre o correo"
          serverSide
        />
      </div>

      <div className="mb-4 animate-in fade-in duration-300">
        <button
          type="button"
          onClick={onNewAccount}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary font-bold text-sm rounded-xl hover:bg-primary/20 transition-all border border-primary/20 active:scale-95"
        >
          <UserPlus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>

      {accounts.error ? (
        <LoadFailed message={accounts.error} onRetry={() => void accounts.retry()} />
      ) : (
        <div className="bg-card/70 backdrop-blur-md border border-border/50 rounded-2xl shadow-sm overflow-hidden animate-in slide-in-from-bottom-6 duration-500">
          {accounts.loading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando cuentas…
            </div>
          ) : accounts.items.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted-foreground font-medium">
              {searchQuery(search)
                ? 'No se encontraron usuarios que coincidan con la búsqueda.'
                : 'No hay cuentas con este rol.'}
            </p>
          ) : (
            <>
              <AccountTable users={accounts.items} onOpenDetails={onOpenDetails} />
              <AccountCards users={accounts.items} onOpenDetails={onOpenDetails} />
            </>
          )}

          {accounts.hasMore && !accounts.loading && (
            <div className="border-t border-border/30 p-4 text-center">
              <LoadMoreButton
                loading={accounts.loadingMore}
                onClick={() => void accounts.loadMore()}
                className="px-5 py-2 text-sm"
              >
                {`Ver más (${formatNumber(accounts.items.length, country)} de ${formatNumber(accounts.totals?.total ?? 0, country)})`}
              </LoadMoreButton>
            </div>
          )}
        </div>
      )}
    </>
  );
}

interface RowsProps {
  users: User[];
  onOpenDetails: (user: User) => void;
}

function AccountTable({ users, onOpenDetails }: RowsProps) {
  return (
    <div className="hidden lg:block overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-muted/30 border-b border-border/50 uppercase text-xs font-bold text-muted-foreground">
          <tr>
            <th className="px-5 py-3">Usuario</th>
            <th className="px-5 py-3">Contacto</th>
            <th className="px-5 py-3">Fecha de registro</th>
            <th className="px-5 py-3">Último acceso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {users.map((user) => (
            <tr
              key={user.guid}
              className="transition-colors cursor-pointer hover:bg-primary/5"
              {...clickable(() => onOpenDetails(user), 'row')}
            >
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <UserAvatar person={user} role={user.role} />
                  <span className="font-bold text-sm">
                    {user.firstName} {user.lastName}
                  </span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Mail className="h-3 w-3 shrink-0" /> {user.email}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <span className="flex items-center gap-3">
                  <span className="text-sm font-bold text-muted-foreground">{shortDate(user.createdAt)}</span>
                  {user.usesDefaultPassword && <TemporaryPassword />}
                </span>
              </td>
              <td className="px-5 py-3.5 text-sm">
                <LastAccess guid={user.guid} date={user.lastAccessAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountCards({ users, onOpenDetails }: RowsProps) {
  return (
    <div className="lg:hidden divide-y divide-border/30">
      {users.map((user) => (
        <div
          key={user.guid}
          className="p-4 flex items-center gap-3 hover:bg-primary/5 transition-colors cursor-pointer active:bg-primary/10"
          {...clickable(() => onOpenDetails(user))}
        >
          <UserAvatar person={user} role={user.role} size="md" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] font-bold text-muted-foreground">{shortDate(user.createdAt)}</span>
              {user.usesDefaultPassword && <TemporaryPassword compact />}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <LastAccess guid={user.guid} date={user.lastAccessAt} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TemporaryPassword({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 text-amber-700 dark:text-amber-400 ${compact ? 'text-[10px]' : 'text-xs'} font-bold`}
      title="Aún no ha sustituido la contraseña temporal por una propia"
    >
      <Key className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} /> Clave temporal
    </span>
  );
}
