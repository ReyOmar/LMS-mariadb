'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PAISES, Pais, SEDES } from '@/lib/pais';
import { useSede } from '@/contexts/SedeContext';

/**
 * Indicador de la sede activa.
 *
 * Siempre visible: al haber dos operaciones con catálogos distintos, saber en cuál se está
 * evita la confusión de «no veo mis cursos» cuando en realidad se está mirando la otra.
 *
 * Con sesión iniciada la sede es la de la cuenta y no se puede cambiar desde aquí; se
 * muestra sólo como información.
 */
export function IndicadorDeSede({ compacto = false }: { compacto?: boolean }) {
  const { sede, confirmada, elegirSede } = useSede();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    const alPulsarFuera = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    };
    const alEscapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', alPulsarFuera);
    document.addEventListener('keydown', alEscapar);
    return () => {
      document.removeEventListener('mousedown', alPulsarFuera);
      document.removeEventListener('keydown', alEscapar);
    };
  }, [abierto]);

  if (!sede) return null;

  const etiqueta = (
    <>
      <span aria-hidden="true">{SEDES[sede].bandera}</span>
      {!compacto && <span className="font-semibold">{SEDES[sede].nombre}</span>}
    </>
  );

  // Con sesión iniciada la sede la fija la cuenta: se informa, no se ofrece cambiarla.
  if (confirmada) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm"
        title={`Estás en la sede de ${SEDES[sede].nombre}`}
      >
        {etiqueta}
      </span>
    );
  }

  const cambiar = (pais: Pais) => {
    elegirSede(pais);
    setAbierto(false);
  };

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm hover:border-primary/50 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Sede actual: ${SEDES[sede].nombre}. Pulsa para cambiar.`}
      >
        {etiqueta}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <ul
          role="listbox"
          className="absolute right-0 mt-2 w-48 rounded-2xl border border-border bg-card shadow-xl overflow-hidden z-50"
        >
          {PAISES.map((pais) => (
            <li key={pais}>
              <button
                type="button"
                role="option"
                aria-selected={pais === sede}
                onClick={() => cambiar(pais)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-muted transition-colors ${
                  pais === sede ? 'font-bold text-primary' : ''
                }`}
              >
                <span aria-hidden="true">{SEDES[pais].bandera}</span>
                {SEDES[pais].nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
