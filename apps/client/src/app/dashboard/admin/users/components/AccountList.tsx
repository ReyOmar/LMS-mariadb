'use client';

import { GraduationCap, Key, Mail, Presentation, Search, Shield, UserPlus } from 'lucide-react';
import type { UserRole, User } from '@/types/models';
import { AccountAvatar } from './AccountAvatar';
import { LastAccess } from '@/components/ui/LastAccess';
import { type Tab } from './accounts';
import { shortDate } from '@/lib/dates';
import { clickable } from '@/lib/clickable';
import { formatNumber } from '@/lib/country';
import { useCountry } from '@/contexts/CountryContext';
import { LoadMoreButton } from '@/components/ui/LoadMoreButton';

interface Props {
  users: User[];
  tab: Tab;
  search: string;
  /** Cuántas cuentas hay de cada rol con la búsqueda actual, según el servidor. */
  counts: Record<UserRole, number>;
  /** Cuántas coinciden en total con la búsqueda actual. */
  total: number;
  /** Lo dice el servidor: hay marca mientras queden cuentas por traer. */
  canLoadMore: boolean;
  /** La siguiente tanda está en camino: el botón espera para no pedirla dos veces. */
  loadingMore: boolean;
  onLoadMore: () => void;
  onTabChange: (tab: Tab) => void;
  onSearch: (text: string) => void;
  onOpenDetails: (user: User) => void;
  onNewAccount: () => void;
}

/** Cada pestaña con su icono; en pantallas estrechas sólo se ven el icono y la cifra. */
const TABS: { role: UserRole; label: string; Icon: typeof Shield; color: string }[] = [
  { role: 'ADMIN', label: 'Administradores', Icon: Shield, color: 'text-red-500' },
  { role: 'TEACHER', label: 'Examinadores', Icon: Presentation, color: 'text-blue-500' },
  { role: 'STUDENT', label: 'Estudiantes', Icon: GraduationCap, color: 'text-emerald-500' },
];

/**
 * Listado de cuentas: pestañas por rol, buscador y la lista en sí.
 *
 * La tabla y las tarjetas enseñan lo mismo; están separadas porque una tabla de cuatro
 * columnas no cabe en un móvil, no porque el contenido cambie.
 */
export function AccountList({
  users,
  tab,
  search,
  counts,
  total,
  canLoadMore,
  loadingMore,
  onLoadMore,
  onTabChange,
  onSearch,
  onOpenDetails,
  onNewAccount,
}: Props) {
  const { country } = useCountry();

  return (
    <>
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 animate-in slide-in-from-bottom-4 duration-500">
        <div className="overflow-x-auto -mx-1 px-1 w-full xl:w-auto">
          <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50 min-w-0">
            {TABS.map(({ role, label, Icon, color }) => (
              <button
                key={role}
                type="button"
                aria-pressed={tab === role}
                aria-label={`${label} (${formatNumber(counts[role], country)})`}
                title={label}
                onClick={() => onTabChange(role)}
                className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${tab === role ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Icon className={`h-4 w-4 ${color} shrink-0`} />
                <span className="hidden sm:inline">{label}</span> ({formatNumber(counts[role], country)})
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full xl:w-80 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            aria-label="Buscar por nombre o correo"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border/50 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium"
          />
        </div>
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

      <div className="bg-card/70 backdrop-blur-md border border-border/50 rounded-2xl shadow-sm overflow-hidden animate-in slide-in-from-bottom-6 duration-500">
        {/* Tabla de escritorio — oculta en móvil */}
        <table className="hidden lg:table w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-muted/30 border-b border-border/50 uppercase text-xs font-bold text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Usuario</th>
              <th className="px-5 py-3">Contacto</th>
              <th className="px-5 py-3">Fecha de registro</th>
              <th className="px-5 py-3">Último acceso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground font-medium">
                  No se encontraron usuarios que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.guid}
                  className="hover:bg-muted/10 transition-colors cursor-pointer hover:bg-primary/5"
                  {...clickable(() => onOpenDetails(user), 'row')}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <AccountAvatar user={user} />
                      <div className="font-bold text-sm">
                        {user.firstName} {user.lastName}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Mail className="h-3 w-3 shrink-0" /> {user.email}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-muted-foreground">{shortDate(user.createdAt)}</span>
                      {user.usesDefaultPassword && <TemporaryPassword />}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    <LastAccess guid={user.guid} date={user.lastAccessAt} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Tarjetas — sólo en móvil */}
        <div className="lg:hidden divide-y divide-border/30">
          {users.length === 0 ? (
            <div className="px-5 py-8 text-center text-muted-foreground font-medium">No se encontraron usuarios.</div>
          ) : (
            users.map((user) => (
              <div
                key={user.guid}
                className="p-4 flex items-center gap-3 hover:bg-primary/5 transition-colors cursor-pointer active:bg-primary/10"
                {...clickable(() => onOpenDetails(user))}
              >
                <AccountAvatar user={user} size="md" />
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
            ))
          )}
        </div>

        {canLoadMore && (
          <div className="border-t border-border/30 p-4 text-center">
            <LoadMoreButton loading={loadingMore} onClick={onLoadMore} className="px-5 py-2 text-sm">
              {`Ver más (${formatNumber(users.length, country)} de ${formatNumber(total, country)})`}
            </LoadMoreButton>
          </div>
        )}
      </div>
    </>
  );
}

/** Cuenta que sigue con la contraseña temporal con la que se creó. */
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
