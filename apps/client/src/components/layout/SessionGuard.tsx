'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Role, useSession } from '@/contexts/SessionContext';
import { useCountry } from '@/contexts/CountryContext';
import { isCountry } from '@/lib/country';
import { loginUrl } from '@/lib/api';
import { FullScreenLoader, PageLoader } from '@/components/ui/PageLoader';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { Sidebar } from '@/components/layout/Sidebar';

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
 * Con una sesión guardada, el menú aparece en el acto y sólo el contenido espera a que el
 * servidor la confirme. Sin sesión no se pinta nada del panel: se lleva al acceso.
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
      // Tras entrar vuelve aquí: es lo que espera quien abre un enlace de un correo sin sesión.
      router.replace(loginUrl(undefined, `${window.location.pathname}${window.location.search}`));
      return;
    }
    if (!allowed) {
      router.replace('/dashboard');
    }
  }, [ready, authenticated, allowed, router]);

  if (!authenticated) return <FullScreenLoader message="Comprobando tu sesión…" />;

  return (
    <DashboardShell sidebar={<Sidebar />}>
      {ready && allowed ? children : <PageLoader message={ready ? 'Redirigiendo…' : 'Comprobando tu sesión…'} />}
    </DashboardShell>
  );
}

/** Aplica el permiso del prefijo más específico que coincida con la ruta. */
function canEnter(pathname: string, role: Role): boolean {
  const prefix = Object.keys(PERMISSIONS)
    .filter((key) => pathname.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];

  return prefix ? PERMISSIONS[prefix].includes(role) : true;
}
