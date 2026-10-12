'use client';

import { useState } from 'react';
import { FileUp, GraduationCap, Image as ImageIcon, Palette, RectangleHorizontal, Sparkles, Type } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { IMAGE_LIMITS_MB, fileSizeWarning, formatMb, parseLimitMb, uploadLimit } from '@/lib/upload-limits';
import { imageAccept, imageFormatNames, imageFormatWarning } from '@/lib/image-formats';
import type { CountrySettings } from '@/contexts/ConfigContext';
import { useCountry } from '@/contexts/CountryContext';
import { useAlerts } from '@/contexts/AlertContext';
import { PageLoader } from '@/components/ui/PageLoader';
import { UnsavedChangesBar } from '@/components/ui/UnsavedChangesBar';
import { useCountrySettingsDraft } from '../useCountrySettingsDraft';
import { IMAGE_FOLDERS, usePendingImages, type ImageField } from './usePendingImages';
import { Field, Section } from './components/ThemeSection';
import { ImageDropZone } from './components/ImageDropZone';
import { ColorSettings } from './components/ColorSettings';
import { FontPicker } from './components/FontPicker';
import { RadiusPicker } from './components/RadiusPicker';
import { UploadLimitField } from './components/UploadLimitField';

const TEXT_INPUT_CLASS =
  'w-full sm:w-96 h-11 px-4 rounded-xl border border-border bg-background font-medium focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none';

const LOGO_FORMAT = `${imageFormatNames('logos')}, máximo ${formatMb(IMAGE_LIMITS_MB.logos)}`;
const BACKGROUND_FORMAT = `${imageFormatNames('fondos')}, máximo ${formatMb(IMAGE_LIMITS_MB.fondos)}`;

export default function ThemePage() {
  const { name: countryName, country } = useCountry();
  const { showAlert } = useAlerts();
  const images = usePendingImages();
  const { draft, edit, save, hasChanges, saving } = useCountrySettingsDraft({
    livePreview: true,
    hasPendingFiles: images.hasPending,
  });
  /** El peso máximo tal como se escribe; `null` mientras no se toque. */
  const [maxFileText, setMaxFileText] = useState<string | null>(null);

  if (!draft) return <PageLoader message="Cargando configuración…" />;

  const maxFileError = maxFileText === null ? null : parseLimitMb(maxFileText, draft.uploadCeilingMb, true).error;

  const onMaxFileChange = (text: string) => {
    setMaxFileText(text);
    const { value } = parseLimitMb(text, draft.uploadCeilingMb, true);
    if (value !== null) edit({ maxFileMb: value });
  };

  const editImage = (field: ImageField, key: string | null) => edit({ [field]: key } as Partial<CountrySettings>);

  const pickImage = (field: ImageField, file: File) => {
    const folder = IMAGE_FOLDERS[field];
    const warning = imageFormatWarning(file, folder) ?? fileSizeWarning(file, uploadLimit(folder));
    if (warning) showAlert.error('No se pudo usar la imagen', warning);
    else images.pick(field, file);
  };

  const imageProps = (field: ImageField) => ({
    imageUrl: images.previewOf(field) ?? fileUrlFor(draft[field]),
    accept: imageAccept(IMAGE_FOLDERS[field]),
    onPick: (file: File) => pickImage(field, file),
    onRemove: () => {
      images.discard(field);
      editImage(field, null);
    },
  });

  // El peso inválido no llega al borrador: se guardaría el anterior mientras la pantalla enseña otro.
  const onSave = () => {
    if (maxFileError) {
      showAlert.warning('Revisa el peso máximo por archivo', maxFileError);
      return;
    }
    void save(() => images.uploadAll(editImage));
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
            className={TEXT_INPUT_CLASS}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ImageDropZone
            label="Logotipo"
            hint={`Se muestra en la barra lateral, la portada, los correos y los certificados. ${LOGO_FORMAT}.`}
            height="h-32"
            {...imageProps('logoUrl')}
          />
          <ImageDropZone
            label="Favicon"
            hint={`Icono de la pestaña del navegador. Cuadrado, preferiblemente 64×64. ${LOGO_FORMAT}.`}
            height="h-32"
            fit="contain"
            {...imageProps('faviconUrl')}
          />
        </div>
      </Section>

      <Section icon={Sparkles} title="Colores">
        <ColorSettings colors={draft} country={country} onChange={edit} />
      </Section>

      <Section icon={Type} title="Tipografía">
        <FontPicker value={draft.font} onChange={(font) => edit({ font })} />
      </Section>

      <Section icon={RectangleHorizontal} title="Redondeo de bordes">
        <RadiusPicker value={draft.borderRadius} onChange={(borderRadius) => edit({ borderRadius })} />
      </Section>

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
            className={TEXT_INPUT_CLASS}
          />
        </Field>

        <ImageDropZone
          label="Fondo de la pantalla de acceso"
          hint={`Opcional. Se recomienda 1920×1080 o superior. ${BACKGROUND_FORMAT}.`}
          height="h-40"
          {...imageProps('loginBackgroundUrl')}
        />
      </Section>

      <Section icon={FileUp} title="Subida de archivos">
        <UploadLimitField
          text={maxFileText ?? String(draft.maxFileMb)}
          ceilingMb={draft.uploadCeilingMb}
          error={maxFileError}
          onChange={onMaxFileChange}
        />
      </Section>

      {hasChanges && <UnsavedChangesBar saving={saving} onSave={onSave} />}
    </div>
  );
}
