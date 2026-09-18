'use client';

import { useRef, useState } from 'react';
import { GraduationCap, Image as ImageIcon, Palette, RectangleHorizontal, Save, Sparkles, Type, Upload } from 'lucide-react';
import { subirArchivo, urlDeMarca, mensajeDeError } from '@/lib/api';
import { FUENTES } from '@/lib/tema';
import { useRole } from '@/contexts/RoleContext';
import { useSede } from '@/contexts/SedeContext';
import { useAlert } from '@/contexts/AlertContext';
import { useBorradorDeConfiguracion } from '@/hooks/useBorradorDeConfiguracion';
import { PageLoader } from '@/components/ui/PageLoader';

/** Combinaciones de color listas para aplicar de un clic. */
const PALETAS = [
  { nombre: 'Corporativo', primario: '#1e3a8a', secundario: '#ea580c', descripcion: 'Azul serio y naranja vibrante' },
  { nombre: 'Noche elegante', primario: '#8b5cf6', secundario: '#f59e0b', descripcion: 'Violeta profundo y dorado' },
  { nombre: 'Bosque', primario: '#166534', secundario: '#65a30d', descripcion: 'Verdes naturales' },
  { nombre: 'Océano', primario: '#0284c7', secundario: '#06b6d4', descripcion: 'Azules claros y cian' },
  { nombre: 'Elegancia', primario: '#1f2937', secundario: '#d97706', descripcion: 'Gris oscuro y ámbar' },
  { nombre: 'Coral', primario: '#dc2626', secundario: '#f97316', descripcion: 'Rojo y naranja cálido' },
] as const;

const RADIOS = [0, 4, 8, 12, 16, 24] as const;

/** Campos de imagen y la carpeta del almacenamiento donde va cada uno. */
const IMAGENES = {
  logo_url: 'logos',
  favicon_url: 'logos',
  login_fondo_url: 'fondos',
} as const;

type CampoDeImagen = keyof typeof IMAGENES;

export default function PaginaDeTema() {
  const { rolReal } = useRole();
  const { nombre: nombreSede } = useSede();
  const { showAlert } = useAlert();
  const { borrador, editar, guardar, hayCambios, guardando } = useBorradorDeConfiguracion(true);

  const [subiendo, setSubiendo] = useState<CampoDeImagen | null>(null);
  const campos = {
    logo_url: useRef<HTMLInputElement>(null),
    favicon_url: useRef<HTMLInputElement>(null),
    login_fondo_url: useRef<HTMLInputElement>(null),
  };

  if (rolReal !== 'admin') {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-muted-foreground font-bold">Esta sección es sólo para administradores.</p>
      </div>
    );
  }

  if (!borrador) return <PageLoader message="Cargando configuración…" />;

  const subirImagen = (campo: CampoDeImagen) => async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    setSubiendo(campo);
    try {
      const { filename } = await subirArchivo(`/storage/upload?folder=${IMAGENES[campo]}`, archivo);
      // Se guarda la clave, no la URL: así la imagen sigue funcionando aunque cambie el
      // dominio desde el que se sirve la API.
      editar({ [campo]: filename } as Record<CampoDeImagen, string>);
    } catch (error) {
      showAlert.error('No se pudo subir la imagen', mensajeDeError(error));
    } finally {
      setSubiendo(null);
      evento.target.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-28">
      <header className="mb-10">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Palette className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Tema y apariencia
        </h1>
        <p className="text-muted-foreground mt-2">
          Identidad visual de la sede{nombreSede ? ` de ${nombreSede}` : ''}. Cada sede tiene su propia marca y los
          cambios sólo afectan a esta.
        </p>
      </header>

      {/* Identidad */}
      <Seccion icono={GraduationCap} titulo="Identidad de marca">
        <Campo
          etiqueta="Nombre de la plataforma"
          ayuda="Aparece en la barra lateral, en el título del navegador y en los correos."
        >
          <input
            type="text"
            value={borrador.nombre_plataforma}
            onChange={(evento) => editar({ nombre_plataforma: evento.target.value })}
            maxLength={120}
            className="w-full sm:w-96 h-11 px-4 rounded-xl border border-border bg-background font-medium focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </Campo>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ZonaDeImagen
            etiqueta="Logotipo"
            ayuda="Se muestra en la barra lateral, la portada y los correos."
            valor={borrador.logo_url}
            subiendo={subiendo === 'logo_url'}
            onElegir={() => campos.logo_url.current?.click()}
            onQuitar={() => editar({ logo_url: null })}
            altura="h-32"
          />
          <ZonaDeImagen
            etiqueta="Favicon"
            ayuda="Icono de la pestaña del navegador. Cuadrado, preferiblemente 64×64."
            valor={borrador.favicon_url}
            subiendo={subiendo === 'favicon_url'}
            onElegir={() => campos.favicon_url.current?.click()}
            onQuitar={() => editar({ favicon_url: null })}
            altura="h-32"
            ajuste="contain"
          />
        </div>

        <input ref={campos.logo_url} type="file" accept="image/*" className="hidden" onChange={subirImagen('logo_url')} />
        <input
          ref={campos.favicon_url}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={subirImagen('favicon_url')}
        />
      </Seccion>

      {/* Colores */}
      <Seccion icono={Sparkles} titulo="Colores">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <SelectorDeColor
            etiqueta="Color primario"
            valor={borrador.color_primario}
            onCambio={(color) => editar({ color_primario: color })}
          />
          <SelectorDeColor
            etiqueta="Color secundario"
            valor={borrador.color_secundario}
            onCambio={(color) => editar({ color_secundario: color })}
          />
        </div>

        <div>
          <p className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Combinaciones</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {PALETAS.map((paleta) => (
              <button
                key={paleta.nombre}
                type="button"
                onClick={() => editar({ color_primario: paleta.primario, color_secundario: paleta.secundario })}
                className="flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-primary/50 hover:bg-muted/30 transition-all"
              >
                <span className="flex shrink-0">
                  <span className="h-8 w-8 rounded-l-lg" style={{ background: paleta.primario }} />
                  <span className="h-8 w-8 rounded-r-lg" style={{ background: paleta.secundario }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold truncate">{paleta.nombre}</span>
                  <span className="block text-xs text-muted-foreground truncate">{paleta.descripcion}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Seccion>

      {/* Tipografía */}
      <Seccion icono={Type} titulo="Tipografía">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {FUENTES.map((fuente) => (
            <button
              key={fuente}
              type="button"
              onClick={() => editar({ fuente })}
              className={`rounded-xl border p-4 text-center transition-all ${
                borrador.fuente === fuente
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <span className="block text-xl font-bold" style={{ fontFamily: `"${fuente}", sans-serif` }}>
                Aa
              </span>
              <span className="block text-xs font-medium mt-1 text-muted-foreground">{fuente}</span>
            </button>
          ))}
        </div>
      </Seccion>

      {/* Bordes */}
      <Seccion icono={RectangleHorizontal} titulo="Redondeo de bordes">
        <div className="flex items-center gap-6">
          <input
            type="range"
            min={0}
            max={24}
            value={borrador.border_radius}
            onChange={(evento) => editar({ border_radius: Number(evento.target.value) })}
            className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
            aria-label="Redondeo de bordes en píxeles"
          />
          <span className="text-sm font-mono font-bold w-16 text-center bg-muted/50 px-2 py-1 rounded-lg">
            {borrador.border_radius}px
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div
            className="h-16 w-24 sm:w-32 bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-xs font-bold text-primary"
            style={{ borderRadius: `${borrador.border_radius}px` }}
          >
            Tarjeta
          </div>
          <span
            className="bg-primary text-primary-foreground px-6 py-2 font-bold text-sm"
            style={{ borderRadius: `${borrador.border_radius}px` }}
          >
            Botón
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {RADIOS.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => editar({ border_radius: valor })}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                borrador.border_radius === valor
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/30 text-muted-foreground'
              }`}
            >
              {valor === 0 ? 'Cuadrado' : valor === 24 ? 'Muy redondeado' : `${valor}px`}
            </button>
          ))}
        </div>
      </Seccion>

      {/* Acceso */}
      <Seccion icono={ImageIcon} titulo="Pantalla de acceso">
        <Campo etiqueta="Mensaje de bienvenida" ayuda="Se muestra sobre el formulario de acceso.">
          <input
            type="text"
            value={borrador.mensaje_bienvenida}
            onChange={(evento) => editar({ mensaje_bienvenida: evento.target.value })}
            maxLength={500}
            className="w-full sm:w-96 h-11 px-4 rounded-xl border border-border bg-background font-medium focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </Campo>

        <ZonaDeImagen
          etiqueta="Fondo de la pantalla de acceso"
          ayuda="Opcional. Se recomienda 1920×1080 o superior."
          valor={borrador.login_fondo_url}
          subiendo={subiendo === 'login_fondo_url'}
          onElegir={() => campos.login_fondo_url.current?.click()}
          onQuitar={() => editar({ login_fondo_url: null })}
          altura="h-40"
        />
        <input
          ref={campos.login_fondo_url}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={subirImagen('login_fondo_url')}
        />
      </Seccion>

      {/* Barra de guardado: sólo aparece si hay algo que guardar, para que no quede duda de
          si los cambios están aplicados. */}
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

function Seccion({
  icono: Icono,
  titulo,
  children,
}: {
  icono: typeof Palette;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card/70 backdrop-blur-md border border-border/50 rounded-2xl p-4 sm:p-8 shadow-sm mb-8">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <Icono className="h-5 w-5 text-primary" /> {titulo}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-bold text-muted-foreground mb-2 block uppercase tracking-wider">{etiqueta}</label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground mt-1.5">{ayuda}</p>}
    </div>
  );
}

function SelectorDeColor({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (color: string) => void;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      <div className="flex items-center gap-4">
        <input
          type="color"
          value={valor}
          onChange={(evento) => onCambio(evento.target.value)}
          className="h-14 w-20 rounded-xl border border-border cursor-pointer bg-transparent"
          aria-label={etiqueta}
        />
        <span className="text-sm font-mono">{valor}</span>
      </div>
    </Campo>
  );
}

function ZonaDeImagen({
  etiqueta,
  ayuda,
  valor,
  subiendo,
  onElegir,
  onQuitar,
  altura,
  ajuste = 'cover',
}: {
  etiqueta: string;
  ayuda: string;
  valor: string | null;
  subiendo: boolean;
  onElegir: () => void;
  onQuitar: () => void;
  altura: string;
  ajuste?: 'cover' | 'contain';
}) {
  const url = urlDeMarca(valor);

  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <button
        type="button"
        onClick={onElegir}
        disabled={subiendo}
        className={`${altura} w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl flex flex-col items-center justify-center transition-all hover:bg-muted/20 relative overflow-hidden disabled:opacity-60`}
      >
        {url ? (
          <img src={url} alt="" className={`h-full w-full object-${ajuste} p-2`} />
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground">
              {subiendo ? 'Subiendo…' : 'Pulsa para subir una imagen'}
            </span>
          </>
        )}
      </button>

      {valor && (
        <button
          type="button"
          onClick={onQuitar}
          className="mt-2 text-xs font-bold text-destructive hover:underline"
        >
          Quitar imagen
        </button>
      )}
    </Campo>
  );
}
