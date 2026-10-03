'use client';

import { useState } from 'react';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import api, { errorMessage } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (failure) {
      setError(errorMessage(failure, 'No se pudo enviar la solicitud.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Cabecera */}
          <div className="bg-gradient-to-r from-primary to-primary/80 p-8 text-center">
            <div className="w-16 h-16 bg-white/10 rounded-2xl mx-auto flex items-center justify-center mb-4 backdrop-blur-sm">
              <Mail className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Recuperar contraseña</h1>
            <p className="text-white/70 text-sm mt-2">
              Ingresa tu correo electrónico para recibir un enlace de recuperación.
            </p>
          </div>

          {/* Cuerpo */}
          <div className="p-8">
            {sent ? (
              <div className="text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full mx-auto flex items-center justify-center mb-4">
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                </div>
                <h3 className="text-lg font-bold mb-2">¡Correo enviado!</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Si el correo <strong>{email}</strong> está registrado en el sistema, recibirás un enlace para
                  restablecer tu contraseña. Revisa tu bandeja de entrada y la carpeta de spam.
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 mt-6 text-primary font-bold text-sm hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Volver al inicio de sesión
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-bold mb-2">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="text-red-700 dark:text-red-400 text-sm font-medium bg-red-500/10 px-4 py-2 rounded-xl"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
                    </>
                  ) : (
                    'Enviar enlace de recuperación'
                  )}
                </button>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-sm text-muted-foreground hover:text-foreground font-medium inline-flex items-center gap-1.5"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Volver al inicio de sesión
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
