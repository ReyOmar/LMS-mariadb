'use client';

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  FileUp,
  GraduationCap,
  Image as ImageIcon,
  Palette,
  RectangleHorizontal,
  Save,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react';
import { uploadFile, fileUrlFor, errorMessage } from '@/lib/api';
import { IMAGE_LIMITS_MB, formatMb, parseLimitMb, uploadLimit } from '@/lib/upload-limits';
import { FONTS, MIN_CONTRAST, fontFamilyOf, primaryContrast } from '@/lib/theme';
import { Country, formatNumber } from '@/lib/country';
import { useCountry } from '@/contexts/CountryContext';
import { useAlerts } from '@/contexts/AlertContext';
import { useSettingsDraft } from '@/hooks/useSettingsDraft';
import { PageLoader } from '@/components/ui/PageLoader';

/** Combinaciones de color listas para aplicar de un clic. */
const PALETTES = [
  { name: 'Corporativo', primary: '#1e3a8a', secondary: '#ea580c', description: 'Azul serio y naranja vibrante' },
  { name: 'Noche elegante', primary: '#8b5cf6', secondary: '#f59e0b', description: 'Violeta profundo y dorado' },
  { name: 'Bosque', primary: '#166534', secondary: '#65a30d', description: 'Verdes naturales' },
  { name: 'Océano', primary: '#0284c7', secondary: '#06b6d4', description: 'Azules claros y cian' },
  { name: 'Elegancia', primary: '#1f2937', secondary: '#d97706', description: 'Gris oscuro y ámbar' },
  { name: 'Coral', primary: '#dc2626', secondary: '#f97316', description: 'Rojo y naranja cálido' },
] as const;

const RADII = [0, 4, 8, 12, 16, 24] as const;

/** Campos de imagen y la carpeta del almacenamiento donde va cada uno. */
const IMAGES = {
  logoUrl: 'logos',
  faviconUrl: 'logos',
  loginBackgroundUrl: 'fondos',
} as const;

type ImageField = keyof typeof IMAGES;

const OBJECT_FIT = { cover: 'object-cover', contain: 'object-contain' } as const;

export default function ThemePage() {
  const { name: countryName, country } = useCountry();
  const { showAlert } = useAlerts();
  const { draft, edit, save, hasChanges, saving } = useSettingsDraft(true);

  const [uploading, setUploading] = useState<ImageField | null>(null);
  /** Peso máximo tal como se escribe; `null` mientras no se toque. */
  const [maxFileText, setMaxFileText] = useState<string | null>(null);
  const fields = {
    logoUrl: useRef<HTMLInputElement>(null),
    faviconUrl: useRef<HTMLInputElement>(null),
    loginBackgroundUrl: useRef<HTMLInputElement>(null),
  };

  if (!draft) return <PageLoader message="Cargando configuración…" />;

  const maxFileError = maxFileText === null ? null : parseLimitMb(maxFileText, draft.uploadCeilingMb, true).error;
  // Una configuración guardada antes de esta versión puede no traer el tope todavía.
  const ceilingMb = draft.uploadCeilingMb;
  const ceilingHint = ceilingMb
    ? ` Admite hasta ${ceilingMb} MB${ceilingMb % 1024 === 0 ? ` (${formatMb(ceilingMb)})` : ''}.`
    : '';

  const onMaxFileChange = (text: string) => {
    setMaxFileText(text);
    const { value } = parseLimitMb(text, draft.uploadCeilingMb, true);
    if (value !== null) edit({ maxFileMb: value });
  };

  // Un valor que no es válido no llega al borrador: sin esto se guardaría el anterior
  // mientras la pantalla enseña otro.
  const onSave = () => {
    if (maxFileError) {
      showAlert.warning('Revisa el peso máximo por archivo', maxFileError);
      return;
    }
    void save();
  };

  const uploadImage = (field: ImageField) => async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(field);
    try {
      const { filename } = await uploadFile(`/storage/upload?folder=${IMAGES[field]}`, file, {
        limit: uploadLimit(IMAGES[field]),
      });
      // Se guarda la clave, no la URL: así la imagen sigue funcionando aunque cambie el
      // dominio desde el que se sirve la API.
      edit({ [field]: filename } as Partial<Record<ImageField, string>>);
    } catch (error) {
      showAlert.error('No se pudo subir la imagen', errorMessage(error));
    } finally {
      setUploading(null);
      event.target.value = '';
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
          Identidad visual de la sede{countryName ? ` de ${countryName}` : ''}. Cada sede tiene su propia marca y los
          cambios sólo afectan a esta.
        </p>
      </header>

      {/* Identidad */}
      <Section icon={GraduationCap} title="Identidad de marca">
        <Field
          label="Nombre de la plataforma"
          htmlFor="theme-platform-name"
          hint="Aparece en la barra lateral, en el título del navegador y en los correos."
        >
          <input
            id="theme-platform-name"
            type="text"
            value={draft.platformName}
            onChange={(event) => edit({ platformName: event.target.value })}
            maxLength={120}
            className="w-full sm:w-96 h-11 px-4 rounded-xl border border-border bg-background font-medium focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ImageDropZone
            label="Logotipo"
            hint={`Se muestra en la barra lateral, la portada y los correos. Máximo ${formatMb(IMAGE_LIMITS_MB.logos)}.`}
            value={draft.logoUrl}
            uploading={uploading === 'logoUrl'}
            onPick={() => fields.logoUrl.current?.click()}
            onRemove={() => edit({ logoUrl: null })}
            height="h-32"
          />
          <ImageDropZone
            label="Favicon"
            hint={`Icono de la pestaña del navegador. Cuadrado, preferiblemente 64×64. Máximo ${formatMb(IMAGE_LIMITS_MB.logos)}.`}
            value={draft.faviconUrl}
            uploading={uploading === 'faviconUrl'}
            onPick={() => fields.faviconUrl.current?.click()}
            onRemove={() => edit({ faviconUrl: null })}
            height="h-32"
            fit="contain"
          />
        </div>

        <input ref={fields.logoUrl} type="file" accept="image/*" className="hidden" onChange={uploadImage('logoUrl')} />
        <input
          ref={fields.faviconUrl}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={uploadImage('faviconUrl')}
        />
      </Section>

      {/* Colores */}
      <Section icon={Sparkles} title="Colores">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ColorPicker
            label="Color primario"
            hint="En modo oscuro se aclara lo necesario para que se lea bien sobre el fondo."
            value={draft.primaryColor}
            onChange={(color) => edit({ primaryColor: color })}
          />
          <ColorPicker
            label="Color secundario"
            value={draft.secondaryColor}
            onChange={(color) => edit({ secondaryColor: color })}
          />
        </div>

        <ContrastWarning color={draft.primaryColor} country={country} />

        <div>
          <p className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Combinaciones</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {PALETTES.map((palette) => (
              <button
                key={palette.name}
                type="button"
                onClick={() => edit({ primaryColor: palette.primary, secondaryColor: palette.secondary })}
                className="flex items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-primary/50 hover:bg-muted/30 transition-all"
              >
                <span className="flex shrink-0">
                  <span className="h-8 w-8 rounded-l-lg" style={{ background: palette.primary }} />
                  <span className="h-8 w-8 rounded-r-lg" style={{ background: palette.secondary }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold truncate">{palette.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{palette.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Tipografía */}
      <Section icon={Type} title="Tipografía">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {FONTS.map((font) => (
            <button
              key={font}
              type="button"
              onClick={() => edit({ font })}
              className={`rounded-xl border p-4 text-center transition-all ${
                draft.font === font
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <span className="block text-xl font-bold" style={{ fontFamily: fontFamilyOf(font) }}>
                Aa
              </span>
              <span className="block text-xs font-medium mt-1 text-muted-foreground">{font}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Bordes */}
      <Section icon={RectangleHorizontal} title="Redondeo de bordes">
        <div className="flex items-center gap-6">
          <input
            type="range"
            min={0}
            max={24}
            value={draft.borderRadius}
            onChange={(event) => edit({ borderRadius: Number(event.target.value) })}
            className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
            aria-label="Redondeo de bordes en píxeles"
          />
          <span className="text-sm font-mono font-bold w-16 text-center bg-muted/50 px-2 py-1 rounded-lg">
            {draft.borderRadius}px
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div
            className="h-16 w-24 sm:w-32 bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-xs font-bold text-primary"
            style={{ borderRadius: `${draft.borderRadius}px` }}
          >
            Tarjeta
          </div>
          <span
            className="bg-primary text-primary-foreground px-6 py-2 font-bold text-sm"
            style={{ borderRadius: `${draft.borderRadius}px` }}
          >
            Botón
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {RADII.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => edit({ borderRadius: value })}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                draft.borderRadius === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/30 text-muted-foreground'
              }`}
            >
              {value === 0 ? 'Cuadrado' : value === 24 ? 'Muy redondeado' : `${value}px`}
            </button>
          ))}
        </div>
      </Section>

      {/* Acceso */}
      <Section icon={ImageIcon} title="Pantalla de acceso">
        <Field
          label="Mensaje de bienvenida"
          htmlFor="theme-welcome-message"
          hint="Se muestra sobre el formulario de acceso."
        >
          <input
            id="theme-welcome-message"
            type="text"
            value={draft.welcomeMessage}
            onChange={(event) => edit({ welcomeMessage: event.target.value })}
            maxLength={500}
            className="w-full sm:w-96 h-11 px-4 rounded-xl border border-border bg-background font-medium focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </Field>

        <ImageDropZone
          label="Fondo de la pantalla de acceso"
          hint={`Opcional. Se recomienda 1920×1080 o superior. Máximo ${formatMb(IMAGE_LIMITS_MB.fondos)}.`}
          value={draft.loginBackgroundUrl}
          uploading={uploading === 'loginBackgroundUrl'}
          onPick={() => fields.loginBackgroundUrl.current?.click()}
          onRemove={() => edit({ loginBackgroundUrl: null })}
          height="h-40"
        />
        <input
          ref={fields.loginBackgroundUrl}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={uploadImage('loginBackgroundUrl')}
        />
      </Section>

      {/* Límite general de subida de la sede */}
      <Section icon={FileUp} title="Subida de archivos">
        <Field
          label="Peso máximo por archivo (MB)"
          htmlFor="theme-max-file-mb"
          hint={
            'Se aplica a las entregas de las tareas que no tienen un límite propio y al material que suben los ' +
            `docentes. Cada tarea puede fijar el suyo.${ceilingHint}`
          }
        >
          <input
            id="theme-max-file-mb"
            type="number"
            inputMode="numeric"
            min={1}
            max={ceilingMb || undefined}
            step={1}
            value={maxFileText ?? String(draft.maxFileMb)}
            onChange={(event) => onMaxFileChange(event.target.value)}
            aria-invalid={Boolean(maxFileError)}
            className={`w-full sm:w-40 h-11 px-4 rounded-xl border bg-background font-medium focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none ${
              maxFileError ? 'border-destructive' : 'border-border'
            }`}
          />
          {maxFileError && <p className="text-xs font-medium text-destructive mt-1.5">{maxFileError}</p>}
        </Field>
      </Section>

      {/* Barra de guardado: sólo aparece si hay algo que guardar, para que no quede duda de
          si los cambios están aplicados. */}
      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(calc(100%-2rem),40rem)]">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-2xl">
            <p className="text-sm font-medium">Tienes cambios sin guardar.</p>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Palette; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card/70 backdrop-blur-md border border-border/50 rounded-2xl p-4 sm:p-8 shadow-sm mb-8">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  /** Campo al que se asocia el rótulo, cuando es un único control de texto. */
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-bold text-muted-foreground mb-2 block uppercase tracking-wider">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}

/** Usos del color primario cuyo contraste se comprueba al elegirlo. */
const CONTRAST_USES = [
  { mode: 'light', use: 'button', label: 'el texto de los botones en modo claro' },
  { mode: 'light', use: 'text', label: 'los títulos y enlaces en modo claro' },
  { mode: 'dark', use: 'button', label: 'el texto de los botones en modo oscuro' },
  { mode: 'dark', use: 'text', label: 'los títulos y enlaces en modo oscuro' },
] as const;

/** Aviso cuando el primario elegido no llega al contraste mínimo en algún uso. */
function ContrastWarning({ color, country }: { color: string; country: Country }) {
  const contrast = primaryContrast(color);
  if (!contrast) return null;

  // Se trunca para no enseñar «4,5:1» en un contraste de 4,46 que no llega.
  const ratio = (value: number) => `${formatNumber(Math.floor(value * 10) / 10, country)}:1`;
  const failing = CONTRAST_USES.filter(({ mode, use }) => contrast[mode][use] < MIN_CONTRAST).map(
    ({ mode, use, label }) => `${label} (${ratio(contrast[mode][use])})`,
  );
  if (failing.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
      <p>
        Con este color primario cuesta leer {new Intl.ListFormat('es', { type: 'conjunction' }).format(failing)}: no
        llegan al contraste mínimo recomendado de {ratio(MIN_CONTRAST)}. Prueba con un tono más oscuro.
      </p>
    </div>
  );
}

function ColorPicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-4">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-14 w-20 rounded-xl border border-border cursor-pointer bg-transparent"
          aria-label={label}
        />
        <span className="text-sm font-mono">{value}</span>
      </div>
    </Field>
  );
}

function ImageDropZone({
  label,
  hint,
  value,
  uploading,
  onPick,
  onRemove,
  height,
  fit = 'cover',
}: {
  label: string;
  hint: string;
  value: string | null;
  uploading: boolean;
  onPick: () => void;
  onRemove: () => void;
  height: string;
  fit?: 'cover' | 'contain';
}) {
  const url = fileUrlFor(value);

  return (
    <Field label={label} hint={hint}>
      <button
        type="button"
        onClick={onPick}
        disabled={uploading}
        aria-label={`${label}: ${uploading ? 'subiendo…' : 'pulsa para subir una imagen'}`}
        className={`${height} w-full border-2 border-dashed border-border hover:border-primary/50 rounded-xl flex flex-col items-center justify-center transition-all hover:bg-muted/20 relative overflow-hidden disabled:opacity-60`}
      >
        {url ? (
          <img src={url} alt="" className={`h-full w-full ${OBJECT_FIT[fit]} p-2`} />
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground mb-2" />
            <span className="text-xs text-muted-foreground">
              {uploading ? 'Subiendo…' : 'Pulsa para subir una imagen'}
            </span>
          </>
        )}
      </button>

      {value && (
        <button type="button" onClick={onRemove} className="mt-2 text-xs font-bold text-destructive hover:underline">
          Quitar imagen
        </button>
      )}
    </Field>
  );
}
