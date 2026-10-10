'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { STORAGE_NOTICE } from '@/lib/legal';
import { readLocal, writeLocal } from '@/lib/local-storage';

const NOTICE_KEY = 'lms_storage_notice';

/**
 * Alto que ocupa el aviso, con su margen. Lo leen el final de la página (`globals.css`) y lo
 * que se fija abajo, como la barra de cambios sin guardar, para colocarse por encima.
 */
const NOTICE_SPACE = '--storage-notice-space';

/**
 * Aviso sobre lo que el campus guarda en el navegador.
 *
 * Todo lo que se guarda es imprescindible para funcionar —sesión, preferencias, apariencia de
 * la sede, borradores de cuestionario— y no hay cookies de seguimiento, así que no se ofrece
 * rechazarlo: se informa, se enlaza el detalle y se recuerda que ya se leyó. Es la
 * advertencia visible que piden los Lineamientos del Aviso de Privacidad en México.
 *
 * En el móvil es una franja compacta pegada al borde inferior. Mientras se ve, publica su
 * alto en `--storage-notice-space` para no tapar los botones de abajo, como «Entrar».
 */
export function StorageNotice() {
  // Se decide tras montar: en el servidor no hay almacenamiento que consultar.
  const [visible, setVisible] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(readLocal(NOTICE_KEY) === null);
  }, []);

  useEffect(() => {
    const notice = noticeRef.current;
    if (!visible || !notice) return;
    const root = document.documentElement.style;
    const reserveSpace = () => root.setProperty(NOTICE_SPACE, `${notice.offsetHeight + 16}px`);
    reserveSpace();
    const observer = new ResizeObserver(reserveSpace);
    observer.observe(notice);
    return () => {
      observer.disconnect();
      root.removeProperty(NOTICE_SPACE);
    };
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    writeLocal(NOTICE_KEY, '1');
    setVisible(false);
  };

  return (
    <div
      ref={noticeRef}
      role="region"
      aria-label="Aviso de almacenamiento en el navegador"
      className="fixed inset-x-0 bottom-0 z-[9000] flex items-center gap-3 rounded-t-2xl border-t border-border bg-card shadow-xl px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:block sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md sm:rounded-2xl sm:border sm:p-4"
    >
      <p className="flex-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
        {STORAGE_NOTICE}{' '}
        <Link href="/legal#cookies" className="font-semibold text-primary hover:underline">
          Más información
        </Link>
      </p>
      <div className="shrink-0 sm:flex sm:justify-end sm:mt-3">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-xl bg-primary px-3 py-2 text-xs sm:px-4 sm:text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
