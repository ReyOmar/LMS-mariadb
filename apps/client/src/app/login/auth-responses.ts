import type { SessionUser } from '@/contexts/SessionContext';

/** Lo que devuelven el acceso y el alta de la contraseña propia cuando abren la sesión. */
export interface OpenedSession {
  message: string;
  token: string;
  user: SessionUser;
}

/** La cuenta usa todavía la contraseña temporal: hay que crear una propia antes de entrar. */
interface SetupRequired {
  requireSetup: true;
  message: string;
}

export type LoginResponse = OpenedSession | SetupRequired;

/** Lo que el acceso deja pendiente para crear la contraseña propia. */
export interface PendingSetup {
  email: string;
  temporaryPassword: string;
  message: string;
}
