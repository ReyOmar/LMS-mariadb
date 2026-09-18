'use client';

import { useEffect, useState } from 'react';
import {
  BookOpen,
  Users,
  GraduationCap,
  Presentation,
  Plus,
  X,
  Loader2,
  CheckCircle,
  Search,
  UserPlus,
  UserMinus,
  ChevronRight,
  Inbox,
  BookMarked,
} from 'lucide-react';
import { PageLoader } from '@/components/ui/PageLoader';
import { useEventoRealtime } from '@/contexts/RealtimeContext';
import { useRole } from '@/contexts/RoleContext';
import api, { mensajeDeError } from '@/lib/api';
import { useAlert } from '@/contexts/AlertContext';

interface Curso {
  guid: string;
  titulo: string;
  estado: string;
  profesor_guid: string;
}

interface Usuario {
  guid: string;
  nombre: string;
  apellido: string;
  email: string;
}

interface Matricula {
  id: number;
  usuario_guid: string;
  curso_guid: string;
  fecha_matricula: string;
  usuario: Usuario;
}

const gradients = [
  'bg-gradient-to-br from-purple-500 to-indigo-600',
  'bg-gradient-to-br from-emerald-400 to-teal-600',
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-pink-500 to-rose-600',
  'bg-gradient-to-br from-blue-500 to-cyan-600',
  'bg-gradient-to-br from-fuchsia-500 to-purple-600',
];

const getAvatarGradient = (name: string) => {
  if (!name) return gradients[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
};

export default function AsignacionCursosPage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [profesores, setProfesores] = useState<Usuario[]>([]);
  const [estudiantes, setEstudiantes] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  // Unified State
  const [selectedCursoId, setSelectedCursoId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'estudiantes' | 'profesor'>('estudiantes');

  // Course Filter State
  const [searchCurso, setSearchCurso] = useState('');
  const [filtroAsignacion, setFiltroAsignacion] = useState<'todos' | 'asignados' | 'sin_asignar'>('todos');

  // Enrolled state
  const [matriculados, setMatriculados] = useState<Matricula[]>([]);
  const [loadingMatriculas, setLoadingMatriculas] = useState(false);
  const [searchEstudiante, setSearchEstudiante] = useState('');
  const [searchProfesor, setSearchProfesor] = useState('');

  const { role, user } = useRole();
  const { showToast } = useAlert();

  useEffect(() => {
    fetchData();
  }, []);

  // Otro administrador puede matricular a la vez sobre el mismo curso.
  useEventoRealtime('enrollment:changed', () => {
    fetchData();
    if (selectedCursoId) fetchMatriculas(selectedCursoId);
  });

  const fetchData = async () => {
    try {
      const [cursosRes, profesoresRes, estudiantesRes] = await Promise.all([
        api.get('/cursos'),
        api.get('/auth/usuarios/por-rol', { params: { rol: 'PROFESOR' } }),
        api.get('/auth/usuarios/por-rol', { params: { rol: 'ESTUDIANTE' } }),
      ]);
      const [cursosData, profesoresData, estudiantesData] = await Promise.all([
        cursosRes.data,
        profesoresRes.data,
        estudiantesRes.data,
      ]);
      setCursos(Array.isArray(cursosData) ? cursosData : []);
      setProfesores(Array.isArray(profesoresData) ? profesoresData : []);
      setEstudiantes(Array.isArray(estudiantesData) ? estudiantesData : []);

      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const cursoId = urlParams.get('curso');
        if (cursoId) {
          handleSelectCurso(cursoId);
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatriculas = async (cursoGuid: string) => {
    setLoadingMatriculas(true);
    try {
      const res = await api.get(`/matriculas/${cursoGuid}`);
      const data = res.data;
      setMatriculados(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMatriculas(false);
    }
  };

  const handleSelectCurso = (guid: string) => {
    setSelectedCursoId(guid);
    if (guid) fetchMatriculas(guid);
    else setMatriculados([]);
    setSearchEstudiante('');
    setSearchProfesor('');
  };

  // --- ACTIONS ---

  const matricularEstudiante = async (usuario_guid: string) => {
    if (!selectedCursoId) return;
    try {
      await api.post(`/matriculas/${selectedCursoId}`, { usuario_guid });
      showToast.success('Estudiante matriculado');
      fetchMatriculas(selectedCursoId);
    } catch (err) {
      showToast.error('Error al matricular');
    }
  };

  const desmatricularEstudiante = async (usuario_guid: string) => {
    if (!selectedCursoId) return;
    try {
      await api.delete(`/matriculas/${selectedCursoId}/${usuario_guid}`);
      showToast.success('Estudiante removido');
      fetchMatriculas(selectedCursoId);
    } catch (err) {
      showToast.error('Error al desmatricular');
    }
  };

  const asignarProfesor = async (profesor_guid: string) => {
    if (!selectedCursoId) return;
    try {
      await api.post(`/cursos/${selectedCursoId}/asignar`, { profesor_guid });
      showToast.success('Examinador asignado');
      setCursos((prev) => prev.map((c) => (c.guid === selectedCursoId ? { ...c, profesor_guid } : c)));
    } catch (error) {
      showToast.error('No se pudo asignar', mensajeDeError(error));
    }
  };

  /**
   * Devuelve el curso al administrador que lo gestiona.
   * Un curso siempre tiene responsable —es obligatorio en la base de datos—, así que
   * «quitar examinador» significa reasignárselo a uno mismo.
   */
  const desasignarProfesor = async () => {
    if (!selectedCursoId || !user?.guid) return;
    try {
      await api.post(`/cursos/${selectedCursoId}/asignar`, { profesor_guid: user.guid });
      showToast.success('El curso vuelve a tu cargo');
      fetchData();
    } catch (error) {
      showToast.error('No se pudo reasignar', mensajeDeError(error));
    }
  };

  // --- COMPUTED DATA ---
  const cursoSeleccionado = cursos.find((c) => c.guid === selectedCursoId);
  const profesorActual = cursoSeleccionado ? profesores.find((p) => p.guid === cursoSeleccionado.profesor_guid) : null;

  const cursosFiltrados = cursos.filter((c) => {
    const matchesSearch = c.titulo.toLowerCase().includes(searchCurso.toLowerCase());
    if (filtroAsignacion === 'asignados') return matchesSearch && c.profesor_guid;
    if (filtroAsignacion === 'sin_asignar') return matchesSearch && !c.profesor_guid;
    return matchesSearch;
  });

  const estudiantesNoMatriculados = estudiantes.filter(
    (e) =>
      !matriculados.some((m) => m.usuario?.guid === e.guid) &&
      `${e.nombre} ${e.apellido} ${e.email}`.toLowerCase().includes(searchEstudiante.toLowerCase()),
  );

  const profesoresFiltrados = profesores.filter((p) =>
    `${p.nombre} ${p.apellido} ${p.email}`.toLowerCase().includes(searchProfesor.toLowerCase()),
  );

  if (role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] animate-in fade-in">
        <div className="h-24 w-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <X className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Acceso Restringido</h1>
        <p className="text-muted-foreground text-center max-w-md">
          No tienes permisos para asignar cursos. Solo los administradores pueden realizar esta acción.
        </p>
      </div>
    );
  }

  if (loading) {
    return <PageLoader message="Preparando panel de asignaciones..." />;
  }

  return (
    <div className="animate-in fade-in duration-700 max-w-7xl mx-auto">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BookMarked className="h-6 w-6 sm:h-8 sm:w-8 text-primary" /> Gestión de Asignaciones
        </h1>
        <p className="text-muted-foreground mt-1">
          Selecciona un curso para matricular estudiantes o asignar un examinador.
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-14rem)] lg:h-[calc(100vh-14rem)]">
        {/* = = = = = LEFT PANEL: COURSE LIST = = = = = */}
        <div
          className={`w-full lg:w-[350px] shrink-0 bg-card border border-border shadow-sm rounded-3xl flex flex-col overflow-hidden ${selectedCursoId ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="p-5 border-b border-border/50 bg-muted/20">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> Directorio de Cursos
            </h2>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              {cursosFiltrados.length} curso{cursosFiltrados.length !== 1 && 's'}{' '}
              {filtroAsignacion !== 'todos' ? 'encontrados' : 'en total'}
            </p>

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar curso..."
                  value={searchCurso}
                  onChange={(e) => setSearchCurso(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm"
                />
              </div>
              <div className="flex bg-background border border-border rounded-xl p-1 shadow-sm overflow-hidden">
                <button
                  onClick={() => setFiltroAsignacion('todos')}
                  className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all ${filtroAsignacion === 'todos' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroAsignacion('asignados')}
                  className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all ${filtroAsignacion === 'asignados' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Asignados
                </button>
                <button
                  onClick={() => setFiltroAsignacion('sin_asignar')}
                  className={`flex-1 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-all ${filtroAsignacion === 'sin_asignar' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Sin Asignar
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cursosFiltrados.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                <BookOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">No se encontraron cursos</p>
              </div>
            ) : (
              cursosFiltrados.map((c) => (
                <button
                  key={c.guid}
                  onClick={() => handleSelectCurso(c.guid)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 group flex flex-col gap-2 ${
                    selectedCursoId === c.guid
                      ? 'bg-primary/10 border-primary shadow-sm'
                      : 'bg-background border-border hover:border-primary/50 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3
                      className={`font-bold leading-tight ${selectedCursoId === c.guid ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}
                    >
                      {c.titulo}
                    </h3>
                    {selectedCursoId === c.guid && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2">
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${c.estado === 'PUBLICADO' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}
                    >
                      {c.estado}
                    </span>
                    {c.profesor_guid ? (
                      <span className="text-[10px] font-bold text-blue-500 flex items-center gap-1">
                        <Presentation className="h-3 w-3" /> Asignado
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                        Sin Examinador
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* = = = = = RIGHT PANEL: ASSIGNMENT DETAILS = = = = = */}
        <div className="flex-1 bg-card border border-border shadow-sm rounded-3xl overflow-hidden flex flex-col relative">
          {!cursoSeleccionado ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-500">
              <div className="h-24 w-24 bg-primary/5 rounded-full flex items-center justify-center mb-6">
                <Users className="h-10 w-10 text-primary opacity-50" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Selecciona un curso</h2>
              <p className="text-muted-foreground max-w-sm">
                Haz clic en uno de los cursos del panel izquierdo para comenzar a matricular estudiantes o asignar a un
                examinador.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full animate-in fade-in zoom-in-95 duration-300">
              {/* Header & Tabs */}
              <div className="p-6 border-b border-border bg-gradient-to-br from-card to-muted/20 shrink-0">
                <button
                  onClick={() => setSelectedCursoId('')}
                  className="lg:hidden flex items-center gap-2 text-sm font-bold text-primary mb-3 hover:underline"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" /> Volver a cursos
                </button>
                <h2 className="text-2xl font-bold text-foreground mb-1">{cursoSeleccionado.titulo}</h2>
                <p className="text-sm text-muted-foreground mb-6">Gestiona quién participa en este curso.</p>

                <div className="flex p-1 bg-muted/50 rounded-xl w-fit">
                  <button
                    onClick={() => setActiveTab('estudiantes')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                      activeTab === 'estudiantes'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <GraduationCap className="h-4 w-4" /> Estudiantes
                  </button>
                  <button
                    onClick={() => setActiveTab('profesor')}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                      activeTab === 'profesor'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Presentation className="h-4 w-4" /> Examinador
                  </button>
                </div>
              </div>

              {/* Tab Content Area */}
              <div className="flex-1 overflow-hidden relative min-h-0">
                {/* --- ESTUDIANTES TAB --- */}
                {activeTab === 'estudiantes' && (
                  <div className="absolute inset-0 flex flex-col animate-in fade-in slide-in-from-left-4 duration-300 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 sm:p-6 min-h-full md:h-full">
                      {/* Lista de Matriculados */}
                      <div className="flex flex-col min-h-[280px] md:h-full bg-background border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-border/50 bg-emerald-500/5 flex items-center justify-between">
                          <h3 className="font-bold text-sm flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500" /> Ya Matriculados
                          </h3>
                          <span className="bg-emerald-500/10 text-emerald-600 font-bold px-2.5 py-0.5 rounded-full text-xs">
                            {matriculados.length}
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                          {loadingMatriculas ? (
                            <div className="flex justify-center py-10">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : matriculados.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6">
                              <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
                              <p className="text-sm font-medium text-muted-foreground">Ningún estudiante matriculado</p>
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                Busca y añade estudiantes desde el panel derecho.
                              </p>
                            </div>
                          ) : (
                            matriculados.map((m) => {
                              const u = m.usuario;
                              const avatarGrad = getAvatarGradient(u?.nombre);
                              return (
                                <div
                                  key={u?.guid || m.id}
                                  className="flex items-center justify-between p-3 bg-card border border-border/30 rounded-xl group hover:border-red-500/30 hover:shadow-sm transition-all"
                                >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <div
                                      className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-inner ${avatarGrad}`}
                                    >
                                      {u?.nombre?.charAt(0)}
                                      {u?.apellido?.charAt(0)}
                                    </div>
                                    <div className="truncate">
                                      <p className="text-sm font-bold truncate">
                                        {u?.nombre} {u?.apellido}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">{u?.email}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => desmatricularEstudiante(u?.guid)}
                                    className="p-2 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors lg:opacity-0 lg:group-hover:opacity-100"
                                    title="Desmatricular"
                                  >
                                    <UserMinus className="h-4 w-4" />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Buscador para Añadir */}
                      <div className="flex flex-col h-full">
                        <div className="mb-4">
                          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-primary" /> Agregar Estudiantes
                          </h3>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder="Buscar por nombre o correo..."
                              value={searchEstudiante}
                              onChange={(e) => setSearchEstudiante(e.target.value)}
                              className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm"
                            />
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pb-6">
                          {estudiantesNoMatriculados.length === 0 ? (
                            <div className="text-center py-10 bg-muted/10 rounded-2xl border border-dashed border-border">
                              <p className="text-sm text-muted-foreground font-medium">
                                {searchEstudiante
                                  ? 'No se encontraron estudiantes'
                                  : 'Todos los estudiantes están matriculados'}
                              </p>
                            </div>
                          ) : (
                            estudiantesNoMatriculados.map((est) => {
                              const avatarGrad = getAvatarGradient(est.nombre);
                              return (
                                <div
                                  key={est.guid}
                                  className="flex items-center justify-between p-3 bg-background border border-border/50 rounded-xl group hover:border-emerald-500/50 hover:shadow-md transition-all"
                                >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <div
                                      className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-inner ${avatarGrad}`}
                                    >
                                      {est.nombre.charAt(0)}
                                      {est.apellido.charAt(0)}
                                    </div>
                                    <div className="truncate">
                                      <p className="text-sm font-bold truncate">
                                        {est.nombre} {est.apellido}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">{est.email}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => matricularEstudiante(est.guid)}
                                    className="flex items-center gap-1 px-4 py-2 shrink-0 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white text-xs font-bold rounded-xl transition-colors"
                                  >
                                    <Plus className="h-4 w-4" /> Agregar
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- EXAMINADOR TAB --- */}
                {activeTab === 'profesor' && (
                  <div className="absolute inset-0 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 sm:p-6 min-h-full md:h-full">
                      {/* Examinador Asignado */}
                      <div className="flex flex-col min-h-[200px] md:h-full bg-background border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-border/50 bg-blue-500/5 flex items-center justify-between">
                          <h3 className="font-bold text-sm flex items-center gap-2">
                            <Presentation className="h-4 w-4 text-blue-500" /> Examinador Asignado
                          </h3>
                          <span className="bg-blue-500/10 text-blue-600 font-bold px-2.5 py-0.5 rounded-full text-xs">
                            {profesorActual ? 1 : 0}
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3">
                          {profesorActual ? (
                            <div className="flex items-center justify-between p-3 bg-card border border-blue-500/20 rounded-xl group hover:border-red-500/30 hover:shadow-sm transition-all">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                                  {profesorActual.nombre.charAt(0)}
                                  {profesorActual.apellido.charAt(0)}
                                </div>
                                <div className="truncate">
                                  <p className="text-sm font-bold truncate">
                                    {profesorActual.nombre} {profesorActual.apellido}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">{profesorActual.email}</p>
                                </div>
                              </div>
                              <button
                                onClick={desasignarProfesor}
                                className="p-2 shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="Remover examinador"
                              >
                                <UserMinus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6">
                              <Inbox className="h-8 w-8 text-muted-foreground/30 mb-3" />
                              <p className="text-sm font-medium text-muted-foreground">Sin examinador asignado</p>
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                Busca y asigna un examinador desde el panel derecho.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Buscar y Asignar Examinador */}
                      <div className="flex flex-col h-full">
                        <div className="mb-4">
                          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-primary" />{' '}
                            {profesorActual ? 'Reemplazar Examinador' : 'Asignar Examinador'}
                          </h3>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder="Buscar por nombre o correo..."
                              value={searchProfesor}
                              onChange={(e) => setSearchProfesor(e.target.value)}
                              className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-xl text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm"
                            />
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pb-6">
                          {profesoresFiltrados.length === 0 ? (
                            <div className="text-center py-10 bg-muted/10 rounded-2xl border border-dashed border-border">
                              <p className="text-sm text-muted-foreground font-medium">
                                {searchProfesor ? 'No se encontraron examinadores' : 'No hay examinadores disponibles'}
                              </p>
                            </div>
                          ) : (
                            profesoresFiltrados.map((prof) => {
                              const isCurrentProf = cursoSeleccionado.profesor_guid === prof.guid;
                              const avatarGrad = getAvatarGradient(prof.nombre);
                              return (
                                <div
                                  key={prof.guid}
                                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                    isCurrentProf
                                      ? 'bg-blue-500/5 border-blue-500/30'
                                      : 'bg-background border-border/50 hover:border-blue-500/50 hover:shadow-md'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <div
                                      className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm shadow-inner ${
                                        isCurrentProf ? 'bg-blue-500 text-white' : `text-white ${avatarGrad}`
                                      }`}
                                    >
                                      {prof.nombre.charAt(0)}
                                      {prof.apellido.charAt(0)}
                                    </div>
                                    <div className="truncate">
                                      <p className="text-sm font-bold truncate">
                                        {prof.nombre} {prof.apellido}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">{prof.email}</p>
                                    </div>
                                  </div>
                                  {isCurrentProf ? (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-2 py-1 rounded-md shrink-0">
                                      Actual
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => asignarProfesor(prof.guid)}
                                      className="flex items-center gap-1 px-4 py-2 shrink-0 bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white text-xs font-bold rounded-xl transition-colors"
                                    >
                                      <Plus className="h-4 w-4" /> Asignar
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
