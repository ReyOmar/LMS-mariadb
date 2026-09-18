'use client';

import { useState } from 'react';
import { FileText, Globe, Mail, MapPin, Phone, Save, Type } from 'lucide-react';
import { ConfigSede } from '@/contexts/ConfigContext';
import { useSede } from '@/contexts/SedeContext';
import { useRole } from '@/contexts/RoleContext';
import { useBorradorDeConfiguracion } from '@/hooks/useBorradorDeConfiguracion';
import { PageLoader } from '@/components/ui/PageLoader';

/** Campos editables de la portada, descritos como datos en lugar de repetir el mismo JSX. */
interface CampoEditable {
  campo: keyof ConfigSede;
  etiqueta: string;
  ayuda?: string;
  tipo?: 'texto' | 'area' | 'documento';
  limite?: number;
}

interface Pestana {
  id: string;
  titulo: string;
  icono: typeof Globe;
  descripcion: string;
  campos: CampoEditable[];
}

const PESTANAS: Pestana[] = [
  {
    id: 'portada',
    titulo: 'Portada',
    icono: Type,
    descripcion: 'Titular y texto de entrada que ve quien llega por primera vez.',
    campos: [
      { campo: 'landing_hero_titulo1', etiqueta: 'Primera línea del titular', limite: 120 },
      {
        campo: 'landing_hero_titulo2',
        etiqueta: 'Segunda línea del titular',
        ayuda: 'Se muestra destacada con el color primario.',
        limite: 120,
      },
      { campo: 'landing_hero_subtitulo', etiqueta: 'Texto de entrada', tipo: 'area', limite: 1000 },
    ],
  },
  {
    id: 'contacto',
    titulo: 'Contacto',
    icono: Phone,
    descripcion: 'Datos de contacto de esta sede. No se comparten con la otra.',
    campos: [
      { campo: 'landing_telefono', etiqueta: 'Teléfono', limite: 60 },
      { campo: 'landing_telefono_sub', etiqueta: 'Horario de atención', limite: 120 },
      { campo: 'landing_email', etiqueta: 'Correo de contacto', limite: 255 },
      { campo: 'landing_email_sub', etiqueta: 'Tiempo de respuesta', limite: 120 },
      { campo: 'landing_oficina', etiqueta: 'Ciudad', limite: 255 },
      { campo: 'landing_oficina_sub', etiqueta: 'Dirección', limite: 255 },
    ],
  },
  {
    id: 'pie',
    titulo: 'Pie de página',
    icono: MapPin,
    descripcion: 'Descripción breve que acompaña al logotipo en el pie.',
    campos: [{ campo: 'landing_footer_texto', etiqueta: 'Texto del pie', tipo: 'area', limite: 1000 }],
  },
  {
    id: 'legal',
    titulo: 'Textos legales',
    icono: FileText,
    descripcion:
      'Cada sede tiene su propia normativa. Estos textos son los que se publican en /legal para esta sede.',
    campos: [
      { campo: 'legal_terminos', etiqueta: 'Términos de uso', tipo: 'documento' },
      { campo: 'legal_privacidad', etiqueta: 'Política de privacidad', tipo: 'documento' },
      { campo: 'legal_datos', etiqueta: 'Protección de datos', tipo: 'documento' },
    ],
  },
];

export default function PaginaDePortada() {
  const { rolReal } = useRole();
  const { nombre: nombreSede } = useSede();
  const { borrador, editar, guardar, hayCambios, guardando } = useBorradorDeConfiguracion();
  const [pestanaActiva, setPestanaActiva] = useState(PESTANAS[0].id);

  if (rolReal !== 'admin') {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground font-bold">Esta sección es sólo para administradores.</p>
      </div>
    );
  }

  if (!borrador) return <PageLoader message="Cargando configuración…" />;

  const pestana = PESTANAS.find((p) => p.id === pestanaActiva) ?? PESTANAS[0];

  return (
    <div className="max-w-4xl mx-auto pb-28">
      <header className="mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Globe className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Portada pública
        </h1>
        <p className="text-muted-foreground mt-2">
          Contenido de la página de inicio de la sede{nombreSede ? ` de ${nombreSede}` : ''}. Los visitantes que
          elijan la otra sede verán textos distintos.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
        {PESTANAS.map((item) => {
          const Icono = item.icono;
          const activa = item.id === pestanaActiva;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestanaActiva(item.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                activa
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'bg-card border border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              <Icono className="h-4 w-4" />
              {item.titulo}
            </button>
          );
        })}
      </div>

      <section className="bg-card border border-border/50 rounded-2xl p-5 sm:p-8 shadow-sm space-y-6">
        <p className="text-sm text-muted-foreground">{pestana.descripcion}</p>

        {pestana.campos.map((definicion) => (
          <CampoDeTexto
            key={String(definicion.campo)}
            definicion={definicion}
            valor={(borrador[definicion.campo] as string | null) ?? ''}
            onCambio={(valor) => editar({ [definicion.campo]: valor } as Partial<ConfigSede>)}
          />
        ))}
      </section>

      {hayCambios && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(calc(100%-2rem),40rem)]">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-2xl">
            <p className="text-sm font-medium">Tienes cambios sin guardar.</p>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              <Save className="h-4 w-4" />
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CampoDeTexto({
  definicion,
  valor,
  onCambio,
}: {
  definicion: CampoEditable;
  valor: string;
  onCambio: (valor: string) => void;
}) {
  const id = `campo-${String(definicion.campo)}`;
  const filas = definicion.tipo === 'documento' ? 12 : 3;
  const esLarga = definicion.tipo === 'area' || definicion.tipo === 'documento';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <label htmlFor={id} className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          {definicion.etiqueta}
        </label>
        {definicion.limite && (
          <span
            className={`text-xs tabular-nums ${
              valor.length > definicion.limite ? 'text-destructive font-bold' : 'text-muted-foreground'
            }`}
          >
            {valor.length} / {definicion.limite}
          </span>
        )}
      </div>

      {esLarga ? (
        <textarea
          id={id}
          value={valor}
          rows={filas}
          onChange={(evento) => onCambio(evento.target.value)}
          maxLength={definicion.limite}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={valor}
          onChange={(evento) => onCambio(evento.target.value)}
          maxLength={definicion.limite}
          className="w-full h-11 rounded-xl border border-border bg-background px-4 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      )}

      {definicion.ayuda && <p className="text-xs text-muted-foreground mt-1.5">{definicion.ayuda}</p>}
    </div>
  );
}
