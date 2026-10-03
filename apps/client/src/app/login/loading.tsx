import { PageLoader } from '@/components/ui/PageLoader';

/**
 * Mismo contenedor y mismo mensaje que las esperas de la propia pantalla de acceso: al
 * pasar de una a otra el indicador no cambia de sitio ni de texto.
 */
export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <PageLoader message="Cargando campus…" />
    </div>
  );
}
