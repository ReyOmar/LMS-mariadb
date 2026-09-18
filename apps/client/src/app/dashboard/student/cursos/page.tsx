"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { useRouter } from "next/navigation";
import { useRole } from "@/contexts/RoleContext";
import { useEventoRealtime, useRealtime } from "@/contexts/RealtimeContext";
import api, { urlDeMarca } from "@/lib/api";

export default function StudentCursosActivos() {
  const { user } = useRole();
  const router = useRouter();
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { cursosEnMantenimiento } = useRealtime();

  const fetchCursos = useCallback(async () => {
    try {
      const { data } = await api.get('/cursos');
      setCursos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('No se pudieron cargar los cursos', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.guid) void fetchCursos();
  }, [user?.guid, fetchCursos]);

  useEventoRealtime('course:updated', fetchCursos);
  useEventoRealtime('course:maintenance', fetchCursos);
  useEventoRealtime('enrollment:changed', fetchCursos);

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-700">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Mis Cursos Activos</h1>
        <p className="text-muted-foreground mt-1">Estos son los cursos que te han sido asignados por tu administrador.</p>
      </header>

      {loading ? (
        <PageLoader message="Cargando tus cursos..." />
      ) : cursos.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center shadow-sm">
            <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-bold">Sin cursos asignados</h3>
            <p className="text-muted-foreground mt-2">No tienes cursos activos en este momento. Contacta con tu administrador.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cursos.map(curso => {
                const isInMaintenance = !!cursosEnMantenimiento[curso.guid] || curso.estado === 'BORRADOR';
                return (
                <div 
                  key={curso.guid} 
                  onClick={() => !isInMaintenance && router.push(`/cursos/${curso.guid}`)}
                  className={`bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm transition-all block relative ${
                    isInMaintenance
                      ? 'opacity-60 grayscale cursor-not-allowed'
                      : 'hover:shadow-md hover:border-primary/50 group cursor-pointer'
                  }`}
                >
                    {/* Maintenance overlay */}
                    {isInMaintenance && (
                      <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 rounded-2xl">
                        <div className="bg-card/90 backdrop-blur-sm border border-amber-500/30 shadow-lg rounded-xl px-5 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">En Mantenimiento</p>
                            <p className="text-[11px] text-muted-foreground">Vuelve más tarde</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="h-32 bg-primary/10 relative flex items-center justify-center overflow-hidden">
                        {curso.imagen_portada ? (
                           // eslint-disable-next-line @next/next/no-img-element
                           <img src={urlDeMarca(curso.imagen_portada) ?? ''} alt={curso.titulo} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        ) : (
                           <BookOpen className="h-12 w-12 text-primary/30 group-hover:scale-110 transition-transform" />
                        )}
                        <div className="absolute inset-0 border-b border-border/30" />
                    </div>
                    <div className="p-5">
                        <h2 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">{curso.titulo}</h2>
                        <div className="flex justify-between items-center mt-6">
                            <span className={`text-xs font-bold uppercase tracking-wider ${isInMaintenance ? 'text-amber-500' : 'text-emerald-500'}`}>
                              {isInMaintenance ? 'Mantenimiento' : curso.estado}
                            </span>
                            {!isInMaintenance && (
                              <span className="text-sm font-semibold text-primary group-hover:translate-x-1 transition-transform flex items-center gap-1">Entrar <ArrowRight className="h-3 w-3" /></span>
                            )}
                        </div>
                    </div>
                </div>
                );
            })}
        </div>
      )}
    </div>
  );
}
