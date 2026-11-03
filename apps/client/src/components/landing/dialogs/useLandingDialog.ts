'use client';

import { useEffect, useState } from 'react';
import type { LegalSectionId } from '@/components/legal/LegalDocument';

type LandingDialog = { kind: 'access' } | { kind: 'legal'; section?: LegalSectionId };

/**
 * La ventana abierta en la portada: el acceso o los textos legales.
 *
 * Abrirla añade una entrada al historial con la misma dirección y el mismo estado del router, así
 * que «Atrás» —el botón del celular, sobre todo— la cierra en vez de salir de la portada. Por eso
 * cerrarla es volver atrás: la X, Escape y el velo pasan por el mismo camino.
 */
export function useLandingDialog() {
  const [dialog, setDialog] = useState<LandingDialog | null>(null);

  useEffect(() => {
    if (!dialog) return;
    const closed = () => setDialog(null);
    window.addEventListener('popstate', closed);
    return () => window.removeEventListener('popstate', closed);
  }, [dialog]);

  const open = (next: LandingDialog) => {
    if (!dialog) window.history.pushState(window.history.state, '', window.location.href);
    setDialog(next);
  };
  const close = () => window.history.back();

  return { dialog, open, close };
}
