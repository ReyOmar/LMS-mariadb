'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  ShieldAlert,
  Key,
  UserCheck,
  UserX,
  Clock,
  Mail,
  BookOpen,
  X,
  GraduationCap,
  Shield,
  Presentation,
  Search,
  Trash2,
  AlertTriangle,
  Plus,
  Loader2,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useRole } from '@/contexts/RoleContext';
import Link from 'next/link';
import api, { mensajeDeError, urlDeMarca } from '@/lib/api';
import { useAlert } from '@/contexts/AlertContext';
import { useEventoRealtime, useRealtime } from '@/contexts/RealtimeContext';

interface Usuario {
  guid: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  activo: boolean;
  usa_clave_defecto?: boolean;
  /** Cursos de los que la cuenta es responsable; impide borrarla sin traspasarlos. */
  cursos_impartidos?: number;
  matriculas?: number;
  created_at: string;
  ultimo_acceso?: string | null;
  foto_url?: string | null;
}

interface CursoAsignado {
  guid: string;
  titulo: string;
  estado: string;
  created_at: string;
  updated_at?: string;
  fecha_asignacion?: string;
}

type TabType = 'ADMINISTRADOR' | 'PROFESOR' | 'ESTUDIANTE';

/** Candidato a heredar los cursos de una cuenta que se elimina. */
interface Destino {
  guid: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
}

interface EstadoDeTraspaso {
  usuario: Usuario;
  destinos: Destino[];
  destinoElegido: string;
  cargando: boolean;
}

export default function BaseUsuarios() {
  const { rolReal, user } = useRole();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<Usuario | null>(null);
  const [userCourses, setUserCourses] = useState<CursoAsignado[]>([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('PROFESOR');
  const [searchQuery, setSearchQuery] = useState('');
  const { showAlert, showConfirm, showToast } = useAlert();
  const { usuariosEnLinea } = useRealtime();

  // Create admin modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ nombre: '', apellido: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState('');

  // Diálogo para decidir a quién pasan los cursos de una cuenta que se va a eliminar.
  const [traspaso, setTraspaso] = useState<EstadoDeTraspaso | null>(null);

  useEffect(() => {
    if (rolReal !== 'admin') return;

    fetchUsuarios();
    // La clave temporal con la que se crean las cuentas nuevas la define la sede.
    api
      .get('/configuracion/full')
      .then((res) => setDefaultPassword(res.data?.contrasena_defecto ?? ''))
      .catch(() => setDefaultPassword(''));
  }, [rolReal]);

  useEventoRealtime('user:created', () => fetchUsuarios());
  useEventoRealtime('user:deleted', () => fetchUsuarios());
  useEventoRealtime('user:updated', () => fetchUsuarios());
  // La presencia cambia `ultimo_acceso`, así que conviene releer la lista.
  useEventoRealtime('presence:update', () => fetchUsuarios());

  // Tick every 60s to re-render relative time labels ("Hace X min")
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchUsuarios = async () => {
    try {
      const res = await api.get('/auth/usuarios');
      const data = res.data;
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openUserDetail = async (user: Usuario) => {
    setSelectedUser(user);
    setLoadingCursos(true);
    setAdminStats(null);

    try {
      const res = await api.get(`/cursos/usuario/${user.guid}`);
      const data = res.data;
      setUserCourses(Array.isArray(data) ? data : []);

      if (user.rol === 'ADMINISTRADOR') {
        const statsRes = await api.get('/auth/admin-stats');
        setAdminStats(statsRes.data);
      }
    } catch (err) {
      console.error(err);
      setUserCourses([]);
    } finally {
      setLoadingCursos(false);
    }
  };

  const renderUltimoAcceso = (guid: string, d: string | null | undefined) => {
    const isOnline = usuariosEnLinea.includes(guid);

    if (isOnline) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-500/10 px-2 py-1 rounded-full w-fit">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          En línea
        </span>
      );
    }

    if (!d)
      return (
        <span className="text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" /> Sin acceso
        </span>
      );
    const lastAccess = new Date(d);
    const diffMs = Date.now() - lastAccess.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    let relativeTime: string;
    if (diffMin < 1) relativeTime = 'Hace un momento';
    else if (diffMin < 60) relativeTime = `Hace ${diffMin} min`;
    else if (diffHrs < 24) relativeTime = `Hace ${diffHrs}h`;
    else if (diffDays < 7) relativeTime = `Hace ${diffDays}d`;
    else
      relativeTime = lastAccess.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    return (
      <span
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
        title={lastAccess.toLocaleString('es-ES')}
      >
        <Clock className="h-3 w-3" />
        {relativeTime}
      </span>
    );
  };

  /**
   * Elimina una cuenta.
   *
   * Si tiene cursos asignados hay que decir antes a quién pasan: la relación del curso con
   * su responsable es obligatoria en la base de datos, de modo que borrar sin traspasar ya
   * no arrastra los cursos por cascada como ocurría antes.
   */
  const handleDeleteUser = async (usuario: Usuario) => {
    if (usuario.guid === user?.guid) {
      showAlert.warning('Operación no permitida', 'No puedes eliminar tu propia cuenta.');
      return;
    }

    if ((usuario.cursos_impartidos ?? 0) > 0) {
      setTraspaso({ usuario, destinos: [], destinoElegido: '', cargando: true });
      try {
        const { data } = await api.get(`/auth/usuarios/${usuario.guid}/destinos-cursos`);
        const destinos: Destino[] = Array.isArray(data) ? data : [];
        setTraspaso({ usuario, destinos, destinoElegido: destinos[0]?.guid ?? '', cargando: false });
      } catch (error) {
        setTraspaso(null);
        showAlert.error('No se pudo preparar la eliminación', mensajeDeError(error));
      }
      return;
    }

    const confirmado = await showConfirm(
      `¿Eliminar la cuenta de ${usuario.nombre} ${usuario.apellido}?`,
      'Se borrarán su progreso, sus entregas y sus certificados. No se puede deshacer. Si sólo quieres impedirle el acceso, desactiva la cuenta en su lugar.',
    );
    if (!confirmado) return;

    await eliminarCuenta(usuario.guid);
  };

  const eliminarCuenta = async (guid: string, destinoCursos?: string) => {
    try {
      await api.delete(`/auth/usuarios/${guid}`, {
        params: destinoCursos ? { destino_cursos: destinoCursos } : undefined,
      });
      showToast.success('Cuenta eliminada.');
      setSelectedUser(null);
      setTraspaso(null);
      fetchUsuarios();
    } catch (error) {
      showAlert.error('No se pudo eliminar', mensajeDeError(error));
    }
  };

  const filteredUsuarios = usuarios.filter((u) => {
    const matchesSearch = `${u.nombre} ${u.apellido} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = u.rol === activeTab;
    return matchesSearch && matchesTab;
  });

  if (rolReal !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] animate-in fade-in">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold">Acceso Restringido PESV</h1>
        <p className="text-muted-foreground mt-2">Área exclusiva para Administradores de Sistema.</p>
        <Link
          href="/dashboard"
          className="mt-6 px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors"
        >
          Volver al Tablero
        </Link>
      </div>
    );
  }

  const getRoleInfo = (rol: string) => {
    if (rol === 'ADMINISTRADOR') return { name: 'Administrador', color: 'text-red-500', bg: 'bg-red-500/10' };
    if (rol === 'PROFESOR') return { name: 'Examinador', color: 'text-blue-500', bg: 'bg-blue-500/10' };
    return { name: 'Estudiante', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  };

  return (
    <div className="animate-in fade-in duration-700">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
          <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Base de Usuarios
          <span className="bg-primary/10 text-primary px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold">
            {usuarios.length} Registrados
          </span>
        </h1>
        <p className="text-muted-foreground mt-2">
          Visión global de todas las cuentas organizadas por rol. Haz click en un examinador o estudiante para ver sus
          cursos.
        </p>
      </header>

      {/* Tabs y Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 animate-in slide-in-from-bottom-4 duration-500">
        <div className="overflow-x-auto -mx-1 px-1 w-full">
          <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50 min-w-0">
            <button
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ADMINISTRADOR' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab('ADMINISTRADOR')}
            >
              <Shield className="h-4 w-4 text-red-500 shrink-0" />
              <span className="hidden sm:inline">Admins</span> (
              {usuarios.filter((u) => u.rol === 'ADMINISTRADOR').length})
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'PROFESOR' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab('PROFESOR')}
            >
              <Presentation className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="hidden sm:inline">Exam.</span> ({usuarios.filter((u) => u.rol === 'PROFESOR').length})
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ESTUDIANTE' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab('ESTUDIANTE')}
            >
              <GraduationCap className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="hidden sm:inline">Estud.</span> ({usuarios.filter((u) => u.rol === 'ESTUDIANTE').length})
            </button>
          </div>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border/50 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium"
          />
        </div>
      </div>

      {/* Register Admin button — only in ADMINISTRADOR tab */}
      {activeTab === 'ADMINISTRADOR' && (
        <div className="mb-4 animate-in fade-in duration-300">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-sm rounded-xl hover:bg-red-500/20 transition-all border border-red-500/20 active:scale-95"
          >
            <Plus className="h-4 w-4" /> Registrar Nuevo Administrador
          </button>
        </div>
      )}
      {loading ? (
        <PageLoader message="Cargando base de usuarios..." />
      ) : (
        <div className="bg-card/70 backdrop-blur-md border border-border/50 rounded-2xl shadow-sm overflow-hidden animate-in slide-in-from-bottom-6 duration-500">
          {/* Desktop table — hidden on mobile */}
          <table className="hidden lg:table w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/30 border-b border-border/50 uppercase text-xs font-bold text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Usuario</th>
                <th className="px-5 py-3">Contacto</th>
                <th className="px-5 py-3">{activeTab === 'ADMINISTRADOR' ? 'Fecha de registro' : 'Estado'}</th>
                <th className="px-5 py-3">Último Acceso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredUsuarios.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground font-medium">
                    No se encontraron usuarios que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredUsuarios.map((user) => {
                  const roleInfo = getRoleInfo(user.rol);
                  return (
                    <tr
                      key={user.guid}
                      className="hover:bg-muted/10 transition-colors cursor-pointer hover:bg-primary/5"
                      onClick={() => openUserDetail(user)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full shrink-0 overflow-hidden">
                            {user.foto_url ? (
                              <img
                                src={urlDeMarca(user.foto_url) || ''}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div
                                className={`h-full w-full flex items-center justify-center text-white font-bold text-xs ${user.rol === 'ADMINISTRADOR' ? 'bg-red-500' : user.rol === 'PROFESOR' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                              >
                                {user.nombre.charAt(0)}
                                {user.apellido.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="font-bold text-sm">
                            {user.nombre} {user.apellido}
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
                          {activeTab === 'ADMINISTRADOR' ? (
                            <span className="text-sm font-bold text-muted-foreground">
                              {new Date(user.created_at).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })}
                            </span>
                          ) : user.activo ? (
                            <span className="flex items-center gap-1 text-emerald-500 text-xs font-bold">
                              <UserCheck className="h-3 w-3" /> Activo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-500 text-xs font-bold">
                              <UserX className="h-3 w-3" /> Inactivo
                            </span>
                          )}
                          {user.usa_clave_defecto && (
                            <span
                              className="flex items-center gap-1 text-amber-500 text-xs font-bold"
                              title="No ha configurado su contraseña"
                            >
                              <Key className="h-3 w-3" /> Sin Clave
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm">{renderUltimoAcceso(user.guid, user.ultimo_acceso)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Mobile card list — visible only on mobile */}
          <div className="lg:hidden divide-y divide-border/30">
            {filteredUsuarios.length === 0 ? (
              <div className="px-5 py-8 text-center text-muted-foreground font-medium">No se encontraron usuarios.</div>
            ) : (
              filteredUsuarios.map((user) => (
                <div
                  key={user.guid}
                  className="p-4 flex items-center gap-3 hover:bg-primary/5 transition-colors cursor-pointer active:bg-primary/10"
                  onClick={() => openUserDetail(user)}
                >
                  <div className="h-10 w-10 rounded-full shrink-0 overflow-hidden">
                    {user.foto_url ? (
                      <img src={urlDeMarca(user.foto_url) || ''} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div
                        className={`h-full w-full flex items-center justify-center text-white font-bold text-sm ${user.rol === 'ADMINISTRADOR' ? 'bg-red-500' : user.rol === 'PROFESOR' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                      >
                        {user.nombre.charAt(0)}
                        {user.apellido.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">
                      {user.nombre} {user.apellido}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {user.usa_clave_defecto && (
                        <span className="flex items-center gap-1 text-amber-500 text-[10px] font-bold">
                          <Key className="h-2.5 w-2.5" /> Sin Clave
                        </span>
                      )}
                      {activeTab !== 'ADMINISTRADOR' &&
                        (user.activo ? (
                          <span className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold">
                            <UserCheck className="h-2.5 w-2.5" /> Activo
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 text-[10px] font-bold">
                            <UserX className="h-2.5 w-2.5" /> Inactivo
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">{renderUltimoAcceso(user.guid, user.ultimo_acceso)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======= USER DETAIL MODAL ======= */}
      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-start justify-center sm:pt-24 animate-in fade-in duration-300"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-card border border-border/50 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-8 max-h-[90dvh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full shrink-0 overflow-hidden">
                  {selectedUser.foto_url ? (
                    <img
                      src={urlDeMarca(selectedUser.foto_url) || ''}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className={`h-full w-full flex items-center justify-center text-white font-bold text-lg ${selectedUser.rol === 'PROFESOR' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                    >
                      {selectedUser.nombre.charAt(0)}
                      {selectedUser.apellido.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold">
                    {selectedUser.nombre} {selectedUser.apellido}
                  </h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {selectedUser.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDeleteUser(selectedUser)}
                  className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors text-muted-foreground"
                  title="Eliminar cuenta"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 hover:bg-muted rounded-xl transition-colors"
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Info */}
            <div
              className={`grid ${selectedUser.rol === 'ADMINISTRADOR' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'} gap-4 mb-6`}
            >
              <div className="bg-muted/20 rounded-xl p-4">
                <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Rol</p>
                <p className={`text-sm font-bold ${getRoleInfo(selectedUser.rol).color}`}>
                  {getRoleInfo(selectedUser.rol).name}
                </p>
              </div>
              {selectedUser.rol !== 'ADMINISTRADOR' && (
                <div className="bg-muted/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Estado</p>
                  <p className="text-sm font-bold">{selectedUser.activo ? '✓ Activo' : '✕ Inactivo'}</p>
                </div>
              )}
              <div className="bg-muted/20 rounded-xl p-4">
                <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Fecha de registro</p>
                <p className="text-sm font-bold">
                  {new Date(selectedUser.created_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div className="bg-muted/20 rounded-xl p-4">
                <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Seguridad</p>
                <p
                  className={`text-sm font-bold ${selectedUser.usa_clave_defecto ? 'text-amber-500' : 'text-emerald-500'}`}
                >
                  {selectedUser.usa_clave_defecto ? '⚠ Sin Clave' : '✓ Con Clave'}
                </p>
              </div>
              <div className="bg-muted/20 rounded-xl p-4">
                <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Último Acceso</p>
                <div className="mt-1">{renderUltimoAcceso(selectedUser.guid, selectedUser.ultimo_acceso)}</div>
              </div>
              <div className="bg-muted/20 rounded-xl p-4">
                <p className="text-xs text-muted-foreground font-bold uppercase mb-1">
                  {selectedUser.rol === 'PROFESOR' || selectedUser.rol === 'ADMINISTRADOR'
                    ? 'Cursos Creados'
                    : 'Cursos Matriculados'}
                </p>
                <p className="text-sm font-bold">{loadingCursos ? '...' : userCourses.length}</p>
              </div>
              {selectedUser.rol === 'ADMINISTRADOR' && (
                <div className="bg-muted/20 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground font-bold uppercase mb-1">Cuentas Aprobadas</p>
                  <p className="text-sm font-bold text-emerald-500">
                    {adminStats ? adminStats.cuentasAprobadas : '...'}
                  </p>
                </div>
              )}
            </div>

            {/* Assigned/Enrolled Courses */}
            <div>
              <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />{' '}
                {selectedUser.rol === 'PROFESOR' || selectedUser.rol === 'ADMINISTRADOR'
                  ? 'Cursos Creados'
                  : 'Cursos Matriculados'}
              </h3>
              {loadingCursos ? (
                <div className="text-center py-6 text-muted-foreground text-sm flex items-center justify-center gap-2">
                  <Clock className="h-4 w-4 animate-spin" /> Cargando cursos...
                </div>
              ) : userCourses.length === 0 ? (
                <div className="text-center py-6 bg-muted/10 rounded-xl border border-border/50">
                  <p className="text-sm text-muted-foreground">
                    Este usuario no tiene cursos{' '}
                    {selectedUser.rol === 'PROFESOR' || selectedUser.rol === 'ADMINISTRADOR'
                      ? 'creados'
                      : 'matriculados'}
                    .
                  </p>
                  {(selectedUser.rol === 'PROFESOR' || selectedUser.rol === 'ADMINISTRADOR') && (
                    <Link
                      href="/dashboard/constructor-cursos"
                      className="text-xs text-primary font-bold hover:underline mt-2 inline-block"
                    >
                      Ir a Gestión de Cursos para {selectedUser.rol === 'ADMINISTRADOR' ? 'crear' : 'asignar'} →
                    </Link>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {userCourses.map((curso) => (
                    <div
                      key={curso.guid}
                      onClick={() => {
                        if (selectedUser?.rol === 'PROFESOR') {
                          window.location.href = `/dashboard/admin/asignacion-cursos?curso=${curso.guid}`;
                        }
                      }}
                      className={`flex items-center justify-between p-3 bg-muted/10 rounded-xl border border-border/30 transition-colors ${selectedUser?.rol === 'PROFESOR' ? 'cursor-pointer hover:border-primary hover:bg-primary/5' : 'hover:border-primary/30'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
                          <BookOpen className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{curso.titulo}</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedUser?.rol === 'PROFESOR'
                              ? 'Asignado'
                              : selectedUser?.rol === 'ADMINISTRADOR'
                                ? 'Creado'
                                : 'Matriculado'}
                            :{' '}
                            {(() => {
                              const d = curso.fecha_asignacion || curso.updated_at || curso.created_at;
                              return d
                                ? new Date(d).toLocaleDateString('es-ES', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                  })
                                : 'Sin fecha';
                            })()}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-lg ${
                          curso.estado === 'PUBLICADO'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : curso.estado === 'BORRADOR'
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {curso.estado}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ======= CREATE ADMIN MODAL ======= */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-card border border-border/50 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-500/10 rounded-xl">
                  <Shield className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Registrar Administrador</h2>
                  <p className="text-xs text-muted-foreground">Cuenta con acceso total al sistema</p>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-xl transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={createForm.nombre}
                    onChange={(e) => setCreateForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    placeholder="Juan"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Apellido
                  </label>
                  <input
                    type="text"
                    value={createForm.apellido}
                    onChange={(e) => setCreateForm((f) => ({ ...f, apellido: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    placeholder="Pérez"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>

              {/* Info notice */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
                <Key className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    Contraseña por defecto del sistema
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Se usará la contraseña por defecto configurada en Solicitudes. El administrador deberá cambiarla
                    obligatoriamente al ingresar por primera vez.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-border/50">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!createForm.nombre.trim() || !createForm.apellido.trim() || !createForm.email.trim()) {
                    showToast.warning('Todos los campos son obligatorios.');
                    return;
                  }
                  if (!defaultPassword) {
                    showToast.warning('No se pudo obtener la contraseña por defecto. Verifica la configuración.');
                    return;
                  }
                  setCreating(true);
                  try {
                    await api.post('/auth/usuarios', {
                      ...createForm,
                      rol: 'ADMINISTRADOR',
                      contrasena_temporal: defaultPassword,
                    });
                    showToast.success(
                      `Administrador ${createForm.nombre} ${createForm.apellido} registrado exitosamente.`,
                    );
                    setShowCreate(false);
                    setCreateForm({ nombre: '', apellido: '', email: '' });
                    fetchUsuarios();
                  } catch (error) {
                    showAlert.error('No se pudo crear la cuenta', mensajeDeError(error));
                  } finally {
                    setCreating(false);
                  }
                }}
                disabled={creating}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 shadow-sm"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Registrar Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Traspaso de cursos antes de eliminar una cuenta responsable de alguno. */}
      {traspaso && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-2">
              Traspasar los cursos de {traspaso.usuario.nombre} {traspaso.usuario.apellido}
            </h3>
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
              Esta cuenta es responsable de {traspaso.usuario.cursos_impartidos} curso(s). Antes de eliminarla, elige
              quién se hará cargo de ellos: los cursos, sus alumnos y sus entregas se conservan.
            </p>

            {traspaso.cargando ? (
              <p className="text-sm text-muted-foreground">Buscando destinos disponibles…</p>
            ) : traspaso.destinos.length === 0 ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                No hay ninguna otra cuenta activa de examinador o administrador en esta sede a la que traspasar los
                cursos. Crea una antes de eliminar esta.
              </p>
            ) : (
              <label className="block">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Nuevo responsable
                </span>
                <select
                  value={traspaso.destinoElegido}
                  onChange={(evento) =>
                    setTraspaso((actual) => (actual ? { ...actual, destinoElegido: evento.target.value } : actual))
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {traspaso.destinos.map((destino) => (
                    <option key={destino.guid} value={destino.guid}>
                      {destino.nombre} {destino.apellido} · {destino.email}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTraspaso(null)}
                className="h-10 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={traspaso.cargando || !traspaso.destinoElegido}
                onClick={() => eliminarCuenta(traspaso.usuario.guid, traspaso.destinoElegido)}
                className="h-10 rounded-xl bg-destructive px-5 text-sm font-bold text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                Traspasar y eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
