import { retryAfterSeconds } from './api';

export type SubmissionOutcome =
  | { status: 'skipped' }
  | { status: 'sent' }
  | { status: 'failed'; failure: unknown; retryAfterSeconds: number };

/**
 * Nunca deja enviar con un envío en curso ni durante la espera de un 429; decide al instante, así que
 * un doble clic no lanza otra petición aunque React aún no haya deshabilitado el botón.
 */
export class SubmissionGate {
  private sending = false;
  private retryAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  isOpen(): boolean {
    return !this.sending && this.now() >= this.retryAt;
  }

  async pass(request: () => Promise<void>): Promise<SubmissionOutcome> {
    if (!this.isOpen()) return { status: 'skipped' };

    this.sending = true;
    try {
      await request();
      return { status: 'sent' };
    } catch (failure) {
      const waitSeconds = retryAfterSeconds(failure);
      this.retryAt = this.now() + waitSeconds * 1000;
      return { status: 'failed', failure, retryAfterSeconds: waitSeconds };
    } finally {
      this.sending = false;
    }
  }
}

/** «0:42», «1:05»: lo que falta de una espera, como en un reloj. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
