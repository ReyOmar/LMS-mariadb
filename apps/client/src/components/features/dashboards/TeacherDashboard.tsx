'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Lock, AlertCircle, ArrowRight, Eye, EyeOff, Search, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/contexts/RoleContext';
import { useEventoRealtime, useRealtime } from '@/contexts/RealtimeContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import api, { urlDeMarca } from '@/lib/api';

export function TeacherDashboard() {
  const { user } = useRole();
  const { cursosEnEdicion } = useRealtime();
  const router = useRouter();

  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  const fetchCursos = useCallback(async () => {
    try {
      const { data } = await api.get('/cursos');
      setCursos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('No se pudieron cargar los cursos asignados', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.guid) void fetchCursos();
  }, [user?.guid, fetchCursos]);

  useEventoRealtime('course:updated', fetchCursos);
  useEventoRealtime('course:created', fetchCursos);
  useEventoRealtime('course:deleted', fetchCursos);

  if (loading) {
    return <PageLoader message="Cargando asignaciones..." />;
  }

  return (
    <div className="animate-fade-slide-in">
      <header className="mb-8">
        <p className="text-sm font-medium text-muted-foreground mb-1">Panel del</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Examinador</h1>
        <p className="text-muted-foreground text-sm mt-1">Cursos asignados para supervisión y evaluación.</p>
      </header>

      {cursos.length === 0 ? (
        <EmptyState
          icon={<Lock className="h-10 w-10" />}
          title="Sin cursos asignados"
          description="Aún no tienes cursos asignados. Contacta con un administrador para que te asigne cursos para supervisar."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar curso asignado por título..."
                className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm"
              />
            </div>
            <div className="relative w-full sm:w-[200px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium shadow-sm appearance-none"
              >
                <option value="todos">Todos los estados</option>
                <option value="PUBLICADO">Publicados</option>
                <option value="BORRADOR">Borradores</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cursos
              .filter(
                (c) =>
                  c.titulo.toLowerCase().includes(search.toLowerCase()) &&
                  (statusFilter === 'todos' || c.estado === statusFilter),
              )
              .map((curso: any) => {
                const editorInfo = cursosEnEdicion[curso.guid];
                const isLockedByOther = editorInfo && editorInfo.guid !== user?.guid;

                return (
                  <div
                    key={curso.guid}
                    onClick={() => {
                      if (isLockedByOther) return;
                      router.push(`/dashboard/constructor-cursos?curso=${curso.guid}`);
                    }}
                    className={`flex flex-col bg-card border rounded-2xl overflow-hidden transition-all shadow-sm relative ${
                      isLockedByOther
                        ? 'border-border/50 opacity-50 grayscale cursor-not-allowed'
                        : 'border-border/50 hover:border-primary/50 hover:shadow-md cursor-pointer group'
                    }`}
                  >
                    {/* Lock overlay */}
                    {isLockedByOther && (
                      <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 rounded-2xl">
                        <div className="bg-card/90 backdrop-blur-sm border border-border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <Lock className="h-4 w-4 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">En edición</p>
                            <p className="text-[11px] text-muted-foreground">
                              {editorInfo.rol}: {editorInfo.nombre}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="h-32 bg-gradient-to-br from-primary/10 to-secondary/10 relative flex items-center justify-center overflow-hidden">
                      {curso.imagen_portada ? (
                        <img
                          src={urlDeMarca(curso.imagen_portada) ?? ''}
                          alt={curso.titulo}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <BookOpen className="h-12 w-12 text-primary/30 group-hover:scale-110 transition-transform" />
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h2 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        {curso.titulo}
                      </h2>
                      <div className="flex justify-between items-center mt-auto pt-4 border-t border-border/30">
                        <div
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${
                            curso.estado === 'PUBLICADO'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          }`}
                        >
                          {curso.estado === 'PUBLICADO' ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {curso.estado}
                        </div>
                        {isLockedByOther ? (
                          <span className="text-xs font-bold text-amber-500 flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Bloqueado
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                            Administrar <ArrowRight className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Slot vacío decorativo */}
            <div className="flex flex-col bg-muted/20 border border-dashed border-border rounded-2xl items-center justify-center p-6 text-center opacity-50">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-muted-foreground text-sm">Sin más asignaciones</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-[180px]">
                Pide a un administrador que te asigne otro curso.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
