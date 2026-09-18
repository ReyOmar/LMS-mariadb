'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import api, { mensajeDeError } from '@/lib/api';
import { formatearNota } from '@/lib/calificacion';
import { PageLoader } from '@/components/ui/PageLoader';

/**
 * Verificación pública de un certificado.
 *
 * La API ya ofrecía esta comprobación, pero no había ninguna página desde la que usarla:
 * el código impreso en el certificado no servía para nada. Aquí cualquiera —una empresa,
 * un auditor— puede comprobar que un certificado es auténtico sin necesidad de cuenta.
 *
 * La respuesta es deliberadamente escueta: nombre, curso y fecha. Lo justo para confirmar
 * el documento que se tiene delante, sin exponer datos de contacto ni el historial de nadie.
 */

interface CertificadoVerificado {
  nombre_estudiante: string;
  curso: string;
  fecha_emision: string;
  horas: number;
  nota_promedio: number | null;
  codigo_verificacion: string;
}

type Resultado =
  | { estado: 'valido'; certificado: CertificadoVerificado }
  | { estado: 'invalido'; mensaje: string };

export default function PaginaDeVerificacion() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <PageLoader message="Cargando…" />
        </div>
      }
    >
      <Verificador />
    </Suspense>
  );
}

function Verificador() {
  const parametros = useSearchParams();
  const [codigo, setCodigo] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const [error, setError] = useState('');

  const verificar = useCallback(async (codigoAComprobar: string) => {
    const limpio = codigoAComprobar.trim();
    if (!limpio) return;

    setComprobando(true);
    setError('');
    setResultado(null);
    try {
      const { data } = await api.get(`/certificados/verificar/${encodeURIComponent(limpio)}`);
      setResultado(
        data.valido
          ? { estado: 'valido', certificado: data.certificado }
          : { estado: 'invalido', mensaje: data.mensaje },
      );
    } catch (fallo) {
      setError(mensajeDeError(fallo, 'No se pudo comprobar el certificado.'));
    } finally {
      setComprobando(false);
    }
  }, []);

  // Permite enlazar directamente desde un QR o un correo: /verificar?codigo=CERT-...
  useEffect(() => {
    const desdeUrl = parametros?.get('codigo');
    if (!desdeUrl) return;
    setCodigo(desdeUrl);
    void verificar(desdeUrl);
  }, [parametros, verificar]);

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    void verificar(codigo);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
          <span className="flex items-center gap-2 font-bold text-primary">
            <ShieldCheck className="h-5 w-5" /> Verificación de certificados
          </span>
        </div>
      </header>

      <main className="flex-1 px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 mb-6">
              <BadgeCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">Comprueba un certificado</h1>
            <p className="text-muted-foreground leading-relaxed">
              Introduce el código de verificación que aparece al pie del documento para confirmar que fue emitido
              por este campus.
            </p>
          </div>

          <form onSubmit={enviar} className="flex flex-col sm:flex-row gap-3 mb-10">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={codigo}
                onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
                placeholder="CERT-XXXXXXXXXX-XXXXXX"
                aria-label="Código de verificación"
                className="h-13 w-full rounded-2xl border border-border bg-card pl-11 pr-4 py-4 font-mono text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={comprobando || !codigo.trim()}
              className="h-13 rounded-2xl bg-primary px-8 py-4 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {comprobando ? 'Comprobando…' : 'Verificar'}
            </button>
          </form>

          {error && (
            <p role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-5 py-4 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          {resultado?.estado === 'invalido' && (
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
              <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Certificado no encontrado</h2>
              <p className="text-muted-foreground">{resultado.mensaje}</p>
            </div>
          )}

          {resultado?.estado === 'valido' && (
            <div className="rounded-3xl border-2 border-emerald-500/30 bg-emerald-500/5 p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
                  <ShieldCheck className="h-6 w-6 text-emerald-600" />
                </span>
                <div>
                  <h2 className="text-xl font-bold">Certificado auténtico</h2>
                  <p className="text-sm text-muted-foreground">Emitido por este campus.</p>
                </div>
              </div>

              <dl className="space-y-4">
                <Dato etiqueta="Titular" valor={resultado.certificado.nombre_estudiante} destacado />
                <Dato etiqueta="Programa" valor={resultado.certificado.curso} destacado />
                <Dato
                  etiqueta="Fecha de emisión"
                  valor={new Date(resultado.certificado.fecha_emision).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                />
                <Dato etiqueta="Duración" valor={`${resultado.certificado.horas} horas`} />
                <Dato etiqueta="Calificación" valor={formatearNota(resultado.certificado.nota_promedio)} />
                <Dato etiqueta="Código" valor={resultado.certificado.codigo_verificacion} monoespaciado />
              </dl>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  destacado,
  monoespaciado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  monoespaciado?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">{etiqueta}</dt>
      <dd className={`${destacado ? 'text-lg font-bold' : 'font-medium'} ${monoespaciado ? 'font-mono text-sm' : ''}`}>
        {valor}
      </dd>
    </div>
  );
}
