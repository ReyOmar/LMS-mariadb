import { Truck } from 'lucide-react';

/** Logotipo de la sede o, si no tiene, el icono de la plataforma. */
export function BrandMark({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" className="max-h-10 w-auto max-w-24 sm:max-w-36 object-contain shrink-0" />;
  }

  return (
    <span className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
      <Truck className="h-5 w-5 text-primary-foreground" />
    </span>
  );
}
