'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useCountry } from '@/contexts/CountryContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { useDebounce } from '@/hooks/useDebounce';
import { formatNumber } from '@/lib/country';
import { plural } from '@/lib/text';
import { searchQuery } from '@/lib/search';
import type { User, UserRole } from '@/types/models';
import { AccountForm } from './components/AccountForm';
import { UserDetails } from './components/UserDetails';
import { AccountList } from './components/AccountList';
import { CourseTransfer } from './components/CourseTransfer';
import { useAccounts } from './useAccounts';
import { useAccountDetails } from './useAccountDetails';
import { useAccountDeletion } from './useAccountDeletion';

const SEARCH_DELAY_MS = 300;
const RELATIVE_TIME_REFRESH_MS = 60_000;

/** Repinta cada minuto para que «Hace 3 min» no se quede congelado. */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), RELATIVE_TIME_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
}

export default function UsersPage() {
  const { user: currentUser, refreshUser } = useSession();
  const { country } = useCountry();
  const [tab, setTab] = useState<UserRole>('TEACHER');
  const [search, setSearch] = useState('');
  const accounts = useAccounts(tab, searchQuery(useDebounce(search, SEARCH_DELAY_MS)));
  const details = useAccountDetails();
  const deletion = useAccountDeletion(currentUser?.guid, (guid) => {
    details.close();
    accounts.remove(guid);
  });
  const [form, setForm] = useState<{ account?: User } | null>(null);
  useMinuteTick();

  const accountSaved = (saved: User) => {
    accounts.replace(saved);
    if (saved.guid === currentUser?.guid) void refreshUser();
    details.refreshIfOpen(saved);
  };

  if (accounts.loading && !accounts.totals) return <PageLoader message="Cargando base de usuarios…" />;

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
          <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Usuarios
          {accounts.totals && (
            <span className="bg-primary/10 text-primary px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold">
              {formatNumber(accounts.totals.registered, country)}{' '}
              {plural(accounts.totals.registered, 'registrado', 'registrados')}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground mt-2">
          Visión global de todas las cuentas organizadas por rol. Haz clic en una cuenta para ver sus datos y sus
          cursos.
        </p>
      </header>

      <AccountList
        accounts={accounts}
        tab={tab}
        search={search}
        onTabChange={setTab}
        onSearch={setSearch}
        onOpenDetails={details.open}
        onNewAccount={() => setForm({})}
      />

      {details.selected && (
        <UserDetails
          user={details.selected}
          courses={details.courses}
          loadingCourses={details.loadingCourses}
          isSelf={details.selected.guid === currentUser?.guid}
          onClose={details.close}
          onEdit={(account) => setForm({ account })}
          onDelete={deletion.requestDelete}
        />
      )}

      {form && (
        <AccountForm
          account={form.account}
          initialRole={tab}
          isSelf={form.account?.guid === currentUser?.guid}
          onClose={() => setForm(null)}
          onSaved={accountSaved}
        />
      )}

      {deletion.transfer && (
        <CourseTransfer
          transfer={deletion.transfer}
          onPickTarget={deletion.pickTarget}
          onCancel={deletion.cancelTransfer}
          onConfirm={() => void deletion.confirmTransfer()}
        />
      )}
    </div>
  );
}
