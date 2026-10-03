'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { Users } from 'lucide-react';
import api, { errorMessage } from '@/lib/api';
import { useSession } from '@/contexts/SessionContext';
import { useAlerts } from '@/contexts/AlertContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import { PageLoader } from '@/components/ui/PageLoader';
import type { User, UserRole } from '@/types/models';
import { useCountry } from '@/contexts/CountryContext';
import { formatNumber } from '@/lib/country';
import { plural } from '@/lib/text';
import { AccountForm } from './components/AccountForm';
import { UserDetails } from './components/UserDetails';
import { AccountList } from './components/AccountList';
import { CourseTransfer } from './components/CourseTransfer';
import type { AssignedCourse, TransferTarget, TransferState, Tab } from './components/accounts';

/**
 * Base de usuarios de la sede.
 *
 * Esta pantalla coordina cuatro piezas —el listado, la ficha de una cuenta, el formulario
 * de alta y edición, y el traspaso de cursos— y se queda con lo que comparten: la lista de
 * cuentas y quién está seleccionado.
 *
 * La lista siempre es la de **una sede**: la API la acota por el país de la sesión, aquí
 * no se envía ni se elige.
 */
type CountByRole = Record<UserRole, number>;
const NO_ACCOUNTS: CountByRole = { ADMIN: 0, TEACHER: 0, STUDENT: 0 };

/**
 * Los recuentos sólo llegan en la primera página: recorren la sede entera y no cambian
 * mientras se va trayendo el resto. `cursor` es por dónde sigue la lista, y valer `null`
 * es lo que significa que ya no queda nada.
 */
interface AccountsResponse {
  total?: number;
  byRole?: CountByRole;
  /** Cuentas de la sede, busque lo que se busque. */
  registered?: number;
  cursor: string | null;
  users: User[];
}

export default function UsersPage() {
  const { user: currentUser, refreshUser } = useSession();
  const { country } = useCountry();
  const { showAlert, showConfirmation, notify } = useAlerts();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('TEACHER');
  const [search, setSearch] = useState('');
  // El servidor busca; se espera a que deje de teclear para no consultar por cada letra.
  const appliedSearch = useDebounce(search, 300);
  const [total, setTotal] = useState(0);
  const [byRole, setByRole] = useState<CountByRole>(NO_ACCOUNTS);
  const [registered, setRegistered] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);

  // Ficha abierta y lo que se pide al abrirla.
  const [selected, setSelected] = useState<User | null>(null);
  const [courses, setCourses] = useState<AssignedCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  /** Ficha cuya carga está en curso: si se abre otra antes de que termine, se ignora. */
  const detailsRequest = useRef<string | null>(null);

  // Formulario abierto: una cuenta nueva o la cuenta que se edita.
  const [form, setForm] = useState<{ account?: User } | null>(null);

  // Diálogo para decidir a quién pasan los cursos de una cuenta que se va a eliminar.
  const [transfer, setTransfer] = useState<TransferState | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get<AccountsResponse>('/auth/users', {
        params: { role: tab, search: appliedSearch || undefined },
      });
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
      setByRole(data.byRole ?? NO_ACCOUNTS);
      setRegistered(data.registered ?? 0);
      setCursor(data.cursor);
    } catch (error) {
      notify.error('No se pudieron cargar las cuentas', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [tab, appliedSearch, notify]);

  /**
   * Trae la siguiente tanda sin perder lo que ya está en pantalla.
   *
   * Se pide desde la marca de la última cuenta recibida, no desde un número de filas: así
   * el coste no crece según se baja, y nadie se cuela ni se repite si mientras tanto se da
   * de alta a otra persona.
   */
  const loadMore = useCallback(async () => {
    if (!cursor) return;
    try {
      const { data } = await api.get<AccountsResponse>('/auth/users', {
        params: { role: tab, search: appliedSearch || undefined, cursor },
      });
      setUsers((prev) => [...prev, ...(data.users ?? [])]);
      setCursor(data.cursor);
    } catch (error) {
      notify.error('No se pudieron cargar más cuentas', errorMessage(error));
    }
  }, [tab, appliedSearch, cursor, notify]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useRealtimeEvent('user:created', loadUsers);
  useRealtimeEvent('user:deleted', loadUsers);
  useRealtimeEvent('user:updated', loadUsers);
  // La presencia NO recarga la lista: el distintivo «En línea» lo pinta `LastAccess` a partir
  // del contexto de tiempo real. Recargar aquí haría que cada entrada o salida de cualquier
  // persona de la sede disparase una consulta completa en todos los paneles abiertos.

  // Un repintado por minuto para que «Hace 3 min» no se quede congelado en pantalla.
  const [, setHeartbeat] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setHeartbeat((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const openDetails = async (user: User) => {
    detailsRequest.current = user.guid;
    setSelected(user);
    setCourses([]);
    setLoadingCourses(true);

    try {
      const { data } = await api.get<AssignedCourse[]>(`/courses/user/${user.guid}`);
      if (detailsRequest.current !== user.guid) return;
      setCourses(Array.isArray(data) ? data : []);
    } catch (error) {
      if (detailsRequest.current !== user.guid) return;
      notify.error('No se pudieron cargar sus cursos', errorMessage(error));
    } finally {
      if (detailsRequest.current === user.guid) setLoadingCourses(false);
    }
  };

  const closeDetails = () => {
    detailsRequest.current = null;
    setSelected(null);
  };

  /**
   * Elimina una cuenta.
   *
   * Si tiene cursos asignados hay que decir antes a quién pasan: la relación del curso con
   * su responsable es obligatoria en la base de datos.
   */
  const requestDelete = async (user: User) => {
    if (user.guid === currentUser?.guid) {
      showAlert.warning('Operación no permitida', 'No puedes eliminar tu propia cuenta.');
      return;
    }

    if ((user.taughtCourses ?? 0) > 0) {
      setTransfer({ user, targets: [], selectedTarget: '', loading: true });
      try {
        const { data } = await api.get<TransferTarget[]>(`/auth/users/${user.guid}/course-targets`);
        const targets = Array.isArray(data) ? data : [];
        // Sin destino preelegido: a quién pasan los cursos es una decisión, no un valor por defecto.
        setTransfer({ user, targets, selectedTarget: '', loading: false });
      } catch (error) {
        setTransfer(null);
        showAlert.error('No se pudo preparar la eliminación', errorMessage(error));
      }
      return;
    }

    const confirmed = await showConfirmation(
      `¿Eliminar la cuenta de ${user.firstName} ${user.lastName}?`,
      'Se borrarán su progreso, sus entregas y sus certificados. No se puede deshacer.',
    );
    if (!confirmed) return;

    await deleteAccount(user.guid);
  };

  const deleteAccount = async (guid: string, courseTarget?: string) => {
    try {
      await api.delete(`/auth/users/${guid}`, {
        params: courseTarget ? { courseTarget } : undefined,
      });
      notify.success('Cuenta eliminada.');
      closeDetails();
      setTransfer(null);
      void loadUsers();
    } catch (error) {
      showAlert.error('No se pudo eliminar', errorMessage(error));
    }
  };

  /** Tras guardar una cuenta: la ficha abierta se pone al día, con sus cursos según el rol. */
  const accountSaved = (saved: User) => {
    void loadUsers();
    if (saved.guid === currentUser?.guid) void refreshUser();
    if (selected?.guid === saved.guid) void openDetails({ ...selected, ...saved });
  };

  if (loading) return <PageLoader message="Cargando base de usuarios…" />;

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
          <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Usuarios
          <span className="bg-primary/10 text-primary px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold">
            {formatNumber(registered, country)} {plural(registered, 'registrado', 'registrados')}
          </span>
        </h1>
        <p className="text-muted-foreground mt-2">
          Visión global de todas las cuentas organizadas por rol. Haz clic en una cuenta para ver sus datos y sus
          cursos.
        </p>
      </header>

      <AccountList
        users={users}
        tab={tab}
        search={search}
        counts={byRole}
        total={total}
        canLoadMore={cursor !== null}
        onLoadMore={loadMore}
        onTabChange={setTab}
        onSearch={setSearch}
        onOpenDetails={openDetails}
        onNewAccount={() => setForm({})}
      />

      {selected && (
        <UserDetails
          user={selected}
          courses={courses}
          loadingCourses={loadingCourses}
          isSelf={selected.guid === currentUser?.guid}
          onClose={closeDetails}
          onEdit={(account) => setForm({ account })}
          onDelete={requestDelete}
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

      {transfer && (
        <CourseTransfer
          transfer={transfer}
          onPickTarget={(guid) => setTransfer((current) => (current ? { ...current, selectedTarget: guid } : current))}
          onCancel={() => setTransfer(null)}
          onConfirm={() => deleteAccount(transfer.user.guid, transfer.selectedTarget)}
        />
      )}
    </div>
  );
}
