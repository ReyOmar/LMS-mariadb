'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Role, useSession } from '@/contexts/SessionContext';
import { useCountry } from '@/contexts/CountryContext';
import { isCountry } from '@/lib/country';
import { PageLoader } from '@/components/ui/PageLoader';
import { DashboardShell } from '@/components/layout/DashboardShell';

/**
 * Qué rol puede entrar en cada zona del panel.
 * Lo que no aparece aquí queda abierto a cualquier usuario con sesión.
 */
const PERMISSIONS: Record<string, Role[]> = {
  '/dashboard/admin': ['admin'],
  '/dashboard/course-builder': ['admin', 'teacher'],
  '/dashboard/examiner': ['admin', 'teacher'],
  '/dashboard/student': ['student'],
};

/**
 * Control de acceso del panel.
 *
 * Es una comprobación de interfaz, no de seguridad: sirve para no enseñar pantallas que el
 * servidor va a rechazar de todas formas. La autorización real la aplica la API en cada
 * petición, así que saltarse esto no da acceso a ningún dato.
 *
 * Mientras se restaura la sesión guardada no se pinta el contenido: hacerlo mostraría por
 * un instante el panel a quien no ha entrado.
 */
export function SessionGuard({ children }: { children: ReactNode }) {
  const { authenticated, ready, role, user } = useSession();
  const { selectCountry } = useCountry();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const allowed = canEnter(pathname, role);

  // En la portada y en el acceso manda la sede que se elige a mano; dentro del panel, la
  // de la cuenta.
  const accountCountry = user?.country;
  useEffect(() => {
    if (isCountry(accountCountry)) selectCountry(accountCountry);
  }, [accountCountry, selectCountry]);

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      router.replace('/login');
      return;
    }
    if (!allowed) {
      router.replace('/dashboard');
    }
  }, [ready, authenticated, allowed, router]);

  // La espera se pinta ya dentro del marco del panel, donde las pantallas ponen la suya.
  const checking = !ready || !authenticated;
  if (checking || !allowed) {
    return (
      <DashboardShell>
        <PageLoader message={checking ? 'Comprobando tu sesión…' : 'Redirigiendo…'} />
      </DashboardShell>
    );
  }

  return <>{children}</>;
}

/** Aplica el permiso del prefijo más específico que coincida con la ruta. */
function canEnter(pathname: string, role: Role): boolean {
  const prefix = Object.keys(PERMISSIONS)
    .filter((key) => pathname.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];

  return prefix ? PERMISSIONS[prefix].includes(role) : true;
}
