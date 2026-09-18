'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Role, useRole } from '@/contexts/RoleContext';
import { PageLoader } from '@/components/ui/PageLoader';

/**
 * Qué rol puede entrar en cada zona del panel.
 * Lo que no aparece aquí queda abierto a cualquier usuario con sesión.
 */
const PERMISOS: Record<string, Role[]> = {
  '/dashboard/admin': ['admin'],
  '/dashboard/constructor-cursos': ['admin', 'teacher'],
  '/dashboard/examiner': ['admin', 'teacher'],
  '/dashboard/student': ['admin', 'student'],
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
export function GuardiaDeSesion({ children }: { children: ReactNode }) {
  const { autenticado, listo, rolReal } = useRole();
  const router = useRouter();
  const ruta = usePathname() ?? '';

  const permitido = puedeEntrar(ruta, rolReal);

  useEffect(() => {
    if (!listo) return;

    if (!autenticado) {
      router.replace('/login');
      return;
    }
    if (!permitido) {
      router.replace('/dashboard');
    }
  }, [listo, autenticado, permitido, router]);

  if (!listo || !autenticado) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PageLoader message="Comprobando tu sesión…" />
      </div>
    );
  }

  if (!permitido) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PageLoader message="Redirigiendo…" />
      </div>
    );
  }

  return <>{children}</>;
}

/** Aplica el permiso del prefijo más específico que coincida con la ruta. */
function puedeEntrar(ruta: string, rol: Role): boolean {
  const prefijo = Object.keys(PERMISOS)
    .filter((clave) => ruta.startsWith(clave))
    .sort((a, b) => b.length - a.length)[0];

  return prefijo ? PERMISOS[prefijo].includes(rol) : true;
}
