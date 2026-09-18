'use client';

import { ArrowRight, Globe, ShieldCheck } from 'lucide-react';
import { PAISES, Pais, SEDES } from '@/lib/pais';
import { useSede } from '@/contexts/SedeContext';

/**
 * Selección de sede.
 *
 * El campus atiende dos operaciones separadas, Colombia y México, con sus propios cursos,
 * examinadores, certificados y normativa. Nada se comparte entre ellas, así que lo primero
 * que hay que saber es a cuál viene el visitante.
 *
 * Se muestra a pantalla completa la primera vez y como diálogo cuando alguien quiere
 * cambiar de sede desde la portada.
 */
export function SelectorDeSede({
  titulo = '¿Desde qué país nos visitas?',
  descripcion = 'Cada sede tiene su propio catálogo de cursos, su equipo de examinadores y su certificación. Elige la tuya para continuar.',
  onElegir,
}: {
  titulo?: string;
  descripcion?: string;
  onElegir?: (pais: Pais) => void;
}) {
  const { elegirSede } = useSede();

  const elegir = (pais: Pais) => {
    elegirSede(pais);
    onElegir?.(pais);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary mb-6">
          <Globe className="h-4 w-4" />
          Selecciona tu sede
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-4">{titulo}</h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">{descripcion}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {PAISES.map((pais) => (
          <button
            key={pais}
            type="button"
            onClick={() => elegir(pais)}
            className="group text-left bg-card border-2 border-border rounded-3xl p-8 transition-all duration-300 hover:border-primary hover:shadow-xl hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span className="text-5xl block mb-4" aria-hidden="true">
              {SEDES[pais].bandera}
            </span>
            <span className="block text-2xl font-bold mb-2 group-hover:text-primary transition-colors">
              {SEDES[pais].nombre}
            </span>
            <span className="block text-sm text-muted-foreground mb-6">
              Capacitación y certificación para la operación {SEDES[pais].gentilicio}.
            </span>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
              Entrar
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        ))}
      </div>

      <p className="mt-8 flex items-start gap-2 text-sm text-muted-foreground justify-center text-center">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <span>
          Tu cuenta pertenece a una única sede. Si eliges la equivocada, no podrás iniciar sesión hasta
          seleccionar la correcta.
        </span>
      </p>
    </div>
  );
}
