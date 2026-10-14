'use client';

import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import type { ClosedRound } from '../closed-round';

/**
 * Avisa de cada vuelta que se cierra al emitirse un certificado en los cursos de quien mira, para
 * corregir las filas ya cargadas: recargar sólo pone al día la primera página.
 */
export function useRoundClosed(onClosed: (round: ClosedRound) => void): void {
  useRealtimeEvent('round:closed', (data) => onClosed(data as ClosedRound));
}
