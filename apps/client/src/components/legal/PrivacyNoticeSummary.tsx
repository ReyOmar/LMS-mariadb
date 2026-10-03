'use client';

import Link from 'next/link';
import { useConfig } from '@/contexts/ConfigContext';
import type { Country } from '@/lib/country';
import { collectionNotice, dataControllerFrom } from '@/lib/legal';

/**
 * Aviso breve que se muestra junto a la petición de autorización: en la solicitud de acceso
 * y en el diálogo que pide aceptar la versión vigente. Lo que debe decir cada país está en
 * `collectionNotice`.
 */
export function PrivacyNoticeSummary({ country }: { country: Country }) {
  const { config } = useConfig();
  const controller = dataControllerFrom(config, config?.platformName || 'PESV Education');
  const notice = collectionNotice(country, controller);

  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      <p className="font-bold text-foreground mb-1">{notice.title}</p>
      <p>
        {notice.text}{' '}
        <Link href="/legal#privacy" target="_blank" className="font-semibold text-primary hover:underline">
          {notice.fullDocument}
        </Link>
        .
      </p>
    </div>
  );
}
