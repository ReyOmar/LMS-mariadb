'use client';

import { Clock, Monitor, ShieldAlert } from 'lucide-react';

/** Motivos por los que se llega al login sin haber pulsado «cerrar sesión». */
export type MotivoDeSalida = 'expirada' | 'revocada' | 'desplazada';

const AVISOS: Record<MotivoDeSalida, { icono: typeof Clock; titulo: string; texto: string; tono: string }> = {
  expirada: {
    icono: Clock,
    titulo: 'Tu sesión caducó',
    texto: 'Por seguridad, las sesiones se cierran tras un tiempo de inactividad. Vuelve a entrar para continuar donde lo dejaste.',
    tono: 'text-primary bg-primary/10 ring-primary/20',
  },
  desplazada: {
    icono: Monitor,
    titulo: 'Se inició sesión en otro dispositivo',
    texto: 'Cada cuenta admite una sola sesión activa. Si no has sido tú, cambia tu contraseña en cuanto entres.',
    tono: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 ring-amber-500/20',
  },
  revocada: {
    icono: ShieldAlert,
    titulo: 'Tu acceso fue retirado',
    texto: 'Un administrador cerró tu sesión o dio de baja tu cuenta. Contacta con la administración de tu sede si crees que es un error.',
    tono: 'text-red-600 dark:text-red-400 bg-red-500/10 ring-red-500/20',
  },
};

/**
 * Explica por qué el usuario acabó en el login.
 *
 * Volver a una pantalla de acceso sin explicación hace pensar que algo se rompió; nombrar
 * el motivo y decir qué hacer a continuación evita el aviso al soporte.
 */
export function AvisoDeSesion({ motivo, onContinuar }: { motivo: MotivoDeSalida; onContinuar: () => void }) {
  const aviso = AVISOS[motivo];
  const Icono = aviso.icono;

  return (
    <div className="flex flex-col items-center text-center">
      <div className={`h-16 w-16 rounded-3xl flex items-center justify-center mb-6 ring-1 ${aviso.tono}`}>
        <Icono className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-bold mb-2">{aviso.titulo}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">{aviso.texto}</p>
      <button
        type="button"
        onClick={onContinuar}
        className="h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm transition-colors"
      >
        Iniciar sesión
      </button>
    </div>
  );
}
