import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, type LucideIcon } from 'lucide-react';

/** Tarjeta de las pantallas de recuperación de contraseña: cabecera de color y cuerpo. */
export function AuthCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-gradient-to-r from-primary to-primary/80 p-8 text-center text-primary-foreground">
          <div className="w-16 h-16 bg-primary-foreground/10 rounded-2xl mx-auto flex items-center justify-center mb-4">
            <Icon className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm mt-2 opacity-80">{subtitle}</p>
        </div>
        <div className="p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

/** Lo que se ve cuando la petición salió bien, con su forma de continuar. */
export function AuthDone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="text-center animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-emerald-500/10 rounded-full mx-auto flex items-center justify-center mb-4">
        <CheckCircle className="h-8 w-8 text-emerald-500" />
      </div>
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      {children}
    </div>
  );
}

export function BackToSignIn() {
  return (
    <Link
      href="/login"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Volver al inicio de sesión
    </Link>
  );
}
