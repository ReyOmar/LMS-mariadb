'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import api, { mensajeDeError } from '@/lib/api';
import { Pais, SEDES } from '@/lib/pais';

/**
 * Solicitud de acceso en tres pasos: verificar el correo, confirmar el código y completar
 * los datos.
 *
 * La verificación va primero a propósito: sin ella, cualquiera podría llenar la bandeja del
 * administrador con solicitudes a nombre de correos ajenos.
 */

type Paso = 'correo' | 'codigo' | 'datos';

const PASOS: { id: Paso; etiqueta: string }[] = [
  { id: 'correo', etiqueta: 'Verificar correo' },
  { id: 'codigo', etiqueta: 'Introducir código' },
  { id: 'datos', etiqueta: 'Completar solicitud' },
];

const ROLES = [
  { valor: 'ESTUDIANTE', etiqueta: 'Capacitante (recibo formación)' },
  { valor: 'PROFESOR', etiqueta: 'Examinador (imparto y califico)' },
] as const;

const SEGUNDOS_REENVIO = 60;

export function SolicitudDeAcceso({
  sede,
  onCancelar,
  onEnviada,
}: {
  sede: Pais;
  onCancelar: () => void;
  onEnviada: () => void;
}) {
  const [paso, setPaso] = useState<Paso>('correo');
  const [correo, setCorreo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [rol, setRol] = useState<string>('ESTUDIANTE');

  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [cuentaAtras, setCuentaAtras] = useState(0);

  useEffect(() => {
    if (cuentaAtras <= 0) return;
    const temporizador = setTimeout(() => setCuentaAtras((valor) => valor - 1), 1000);
    return () => clearTimeout(temporizador);
  }, [cuentaAtras]);

  const enviarCodigo = async () => {
    if (!correo.includes('@')) {
      setError('Escribe un correo electrónico válido.');
      return;
    }

    setOcupado(true);
    setError('');
    try {
      await api.post('/auth/verificar-email', { email: correo });
      setPaso('codigo');
      setCuentaAtras(SEGUNDOS_REENVIO);
    } catch (fallo) {
      setError(mensajeDeError(fallo, 'No se pudo enviar el código.'));
    } finally {
      setOcupado(false);
    }
  };

  const confirmarCodigo = async () => {
    setOcupado(true);
    setError('');
    try {
      await api.post('/auth/confirmar-email', { email: correo, codigo });
      setPaso('datos');
    } catch (fallo) {
      setError(mensajeDeError(fallo, 'El código no es correcto.'));
    } finally {
      setOcupado(false);
    }
  };

  const enviarSolicitud = async (evento: FormEvent) => {
    evento.preventDefault();
    setOcupado(true);
    setError('');
    try {
      await api.post('/auth/solicitar', { email: correo, nombre, apellido, rol_pedido: rol, pais: sede });
      onEnviada();
    } catch (fallo) {
      setError(mensajeDeError(fallo, 'No se pudo enviar la solicitud.'));
    } finally {
      setOcupado(false);
    }
  };

  const indiceActual = PASOS.findIndex((p) => p.id === paso);

  return (
    <div className="space-y-5">
      {/* Progreso */}
      <div className="flex items-center gap-2">
        {PASOS.map((item, indice) => (
          <div key={item.id} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                indice === indiceActual
                  ? 'bg-primary text-primary-foreground scale-110'
                  : indice < indiceActual
                    ? 'bg-emerald-500 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {indice < indiceActual ? <CheckCircle2 className="h-4 w-4" /> : indice + 1}
            </div>
            {indice < PASOS.length - 1 && (
              <div className={`w-8 h-0.5 rounded ${indice < indiceActual ? 'bg-emerald-500' : 'bg-muted'}`} />
            )}
          </div>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{PASOS[indiceActual].etiqueta}</span>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed">
        Solicitas acceso a la sede de{' '}
        <strong>
          {SEDES[sede].bandera} {SEDES[sede].nombre}
        </strong>
        . La sede no se puede cambiar después; si no es la correcta, vuelve atrás y cámbiala antes de continuar.
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      {paso === 'correo' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="solicitud-correo" className="text-xs font-bold text-muted-foreground">
              Correo electrónico
            </label>
            <input
              id="solicitud-correo"
              type="email"
              value={correo}
              onChange={(evento) => setCorreo(evento.target.value)}
              placeholder="nombre@empresa.com"
              autoComplete="email"
              className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="flex gap-2">
            <BotonSecundario onClick={onCancelar}>Volver</BotonSecundario>
            <BotonPrincipal onClick={enviarCodigo} ocupado={ocupado} icono={Send}>
              Enviar código
            </BotonPrincipal>
          </div>
        </div>
      )}

      {paso === 'codigo' && (
        <div className="space-y-4">
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
            Enviamos un código de 6 dígitos a <strong>{correo}</strong>. Revisa también la carpeta de spam.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="solicitud-codigo" className="text-xs font-bold text-muted-foreground">
              Código de verificación
            </label>
            <input
              id="solicitud-codigo"
              type="text"
              inputMode="numeric"
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
              className="w-full h-12 rounded-xl border border-input bg-background text-center text-2xl font-mono font-bold tracking-[0.5em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <div className="flex gap-2">
            <BotonSecundario
              onClick={() => {
                setPaso('correo');
                setError('');
              }}
            >
              Cambiar correo
            </BotonSecundario>
            <BotonPrincipal
              onClick={confirmarCodigo}
              ocupado={ocupado}
              deshabilitado={codigo.length !== 6}
              icono={CheckCircle2}
            >
              Confirmar
            </BotonPrincipal>
          </div>
          <div className="text-center">
            {cuentaAtras > 0 ? (
              <span className="text-xs text-muted-foreground">Podrás pedir otro código en {cuentaAtras}s</span>
            ) : (
              <button
                type="button"
                onClick={enviarCodigo}
                disabled={ocupado}
                className="text-xs font-bold text-primary hover:underline disabled:opacity-60"
              >
                Reenviar código
              </button>
            )}
          </div>
        </div>
      )}

      {paso === 'datos' && (
        <form onSubmit={enviarSolicitud} className="space-y-4">
          <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              <strong>{correo}</strong> verificado correctamente
            </span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo id="solicitud-nombre" etiqueta="Nombre" valor={nombre} onCambio={setNombre} />
            <Campo id="solicitud-apellido" etiqueta="Apellido" valor={apellido} onCambio={setApellido} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="solicitud-rol" className="text-xs font-bold text-muted-foreground">
              ¿Con qué función participas?
            </label>
            <select
              id="solicitud-rol"
              value={rol}
              onChange={(evento) => setRol(evento.target.value)}
              className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {ROLES.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Un administrador revisará la solicitud y confirmará tu función antes de darte acceso.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <BotonSecundario onClick={onCancelar}>Cancelar</BotonSecundario>
            <BotonPrincipal tipo="submit" ocupado={ocupado} deshabilitado={!nombre.trim() || !apellido.trim()}>
              Enviar solicitud
            </BotonPrincipal>
          </div>
        </form>
      )}
    </div>
  );
}

function Campo({
  id,
  etiqueta,
  valor,
  onCambio,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold text-muted-foreground">
        {etiqueta}
      </label>
      <input
        id={id}
        type="text"
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        required
        className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </div>
  );
}

function BotonSecundario({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 px-4 text-xs font-bold text-muted-foreground rounded-xl border border-border hover:bg-muted transition-colors"
    >
      {children}
    </button>
  );
}

function BotonPrincipal({
  onClick,
  ocupado,
  deshabilitado,
  icono: Icono,
  tipo = 'button',
  children,
}: {
  onClick?: () => void;
  ocupado: boolean;
  deshabilitado?: boolean;
  icono?: typeof Send;
  tipo?: 'button' | 'submit';
  children: React.ReactNode;
}) {
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={ocupado || deshabilitado}
      className="flex-1 h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
    >
      {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : Icono ? <Icono className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}
