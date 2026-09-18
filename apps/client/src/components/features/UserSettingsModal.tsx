'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle, Eye, EyeOff, Loader2, Lock, Save, Trash2, User, X } from 'lucide-react';
import api, { mensajeDeError, subirArchivo, urlDeArchivo } from '@/lib/api';
import { useRole } from '@/contexts/RoleContext';
import { SEDES } from '@/lib/pais';

/** Imágenes admitidas para la foto de perfil. */
const TIPOS_DE_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FOTO_MB = 5;

/** Longitud mínima de contraseña, igual que la que aplica el servidor. */
const MIN_CONTRASENA = 8;

interface Aviso {
  tipo: 'exito' | 'error';
  texto: string;
}

/**
 * Datos de la cuenta: nombre, foto y contraseña.
 *
 * El correo se muestra pero no se edita: identifica la cuenta en la recuperación de
 * contraseña y cambiarlo sin volver a verificarlo permitiría apropiarse de una cuenta ajena.
 */
export function UserSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refrescarUsuario } = useRole();

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [contrasenaActual, setContrasenaActual] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [verActual, setVerActual] = useState(false);
  const [verNueva, setVerNueva] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const campoFoto = useRef<HTMLInputElement>(null);

  const mostrarAviso = useCallback((tipo: Aviso['tipo'], texto: string) => {
    setAviso({ tipo, texto });
  }, []);

  // Al abrir se parte siempre de los datos actuales; al cerrar se limpia todo para que las
  // contraseñas no queden en memoria del componente.
  useEffect(() => {
    if (open && user) {
      setNombre(user.nombre);
      setApellido(user.apellido);
      setAviso(null);
      return;
    }
    if (!open) {
      setContrasenaActual('');
      setNuevaContrasena('');
      setConfirmacion('');
      setVerActual(false);
      setVerNueva(false);
      setAviso(null);
    }
  }, [open, user]);

  if (!open || !user) return null;

  const cambiaContrasena = nuevaContrasena.length > 0;

  const validar = (): string | null => {
    if (!nombre.trim() || !apellido.trim()) return 'El nombre y el apellido son obligatorios.';
    if (!cambiaContrasena) return null;
    if (!contrasenaActual) return 'Escribe tu contraseña actual para poder cambiarla.';
    if (nuevaContrasena.length < MIN_CONTRASENA) {
      return `La nueva contraseña debe tener al menos ${MIN_CONTRASENA} caracteres.`;
    }
    if (!/[a-zA-Z]/.test(nuevaContrasena) || !/[0-9]/.test(nuevaContrasena)) {
      return 'La nueva contraseña debe incluir al menos una letra y un número.';
    }
    if (nuevaContrasena !== confirmacion) return 'La nueva contraseña y su confirmación no coinciden.';
    return null;
  };

  const guardar = async () => {
    const problema = validar();
    if (problema) {
      mostrarAviso('error', problema);
      return;
    }

    setGuardando(true);
    try {
      await api.patch('/auth/me', {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        ...(cambiaContrasena
          ? { contrasena_actual: contrasenaActual, nueva_contrasena: nuevaContrasena }
          : {}),
      });

      // Cambiar la contraseña cierra la sesión: el servidor revoca el token y la siguiente
      // petición devolverá al login. Se avisa antes para que no parezca un fallo.
      if (cambiaContrasena) {
        mostrarAviso('exito', 'Contraseña actualizada. Vuelve a iniciar sesión con la nueva.');
        return;
      }

      await refrescarUsuario();
      mostrarAviso('exito', 'Datos actualizados.');
    } catch (error) {
      mostrarAviso('error', mensajeDeError(error, 'No se pudieron guardar los cambios.'));
    } finally {
      setGuardando(false);
    }
  };

  const subirFoto = async (evento: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    if (!TIPOS_DE_IMAGEN.includes(archivo.type)) {
      mostrarAviso('error', 'La foto debe ser una imagen JPG, PNG, WebP o GIF.');
      return;
    }
    if (archivo.size > MAX_FOTO_MB * 1024 * 1024) {
      mostrarAviso('error', `La imagen no puede superar los ${MAX_FOTO_MB} MB.`);
      return;
    }

    setSubiendoFoto(true);
    try {
      await subirArchivo('/auth/me/foto', archivo);
      await refrescarUsuario();
      mostrarAviso('exito', 'Foto de perfil actualizada.');
    } catch (error) {
      mostrarAviso('error', mensajeDeError(error, 'No se pudo subir la foto.'));
    } finally {
      setSubiendoFoto(false);
      if (campoFoto.current) campoFoto.current.value = '';
    }
  };

  const borrarFoto = async () => {
    setSubiendoFoto(true);
    try {
      await api.delete('/auth/me/foto');
      await refrescarUsuario();
      mostrarAviso('exito', 'Foto de perfil eliminada.');
    } catch (error) {
      mostrarAviso('error', mensajeDeError(error, 'No se pudo eliminar la foto.'));
    } finally {
      setSubiendoFoto(false);
    }
  };

  const foto = urlDeArchivo(user.foto_url);
  const iniciales = `${user.nombre[0] ?? ''}${user.apellido[0] ?? ''}`.toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ajustes"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <h2 id="titulo-ajustes" className="text-lg font-bold">
            Mi cuenta
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {aviso && (
            <p
              role={aviso.tipo === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
                aviso.tipo === 'exito'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-destructive/20 bg-destructive/10 text-destructive'
              }`}
            >
              {aviso.tipo === 'exito' ? (
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              {aviso.texto}
            </p>
          )}

          {/* Identidad */}
          <section className="flex items-center gap-4">
            <div className="relative">
              <div className="h-20 w-20 rounded-2xl overflow-hidden bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
                {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : iniciales}
              </div>
              {subiendoFoto && (
                <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-bold truncate">
                {user.nombre} {user.apellido}
              </p>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sede {SEDES[user.pais].bandera} {SEDES[user.pais].nombre}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => campoFoto.current?.click()}
                  disabled={subiendoFoto}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition-colors disabled:opacity-60"
                >
                  <Camera className="h-3.5 w-3.5" /> Cambiar foto
                </button>
                {user.foto_url && (
                  <button
                    type="button"
                    onClick={borrarFoto}
                    disabled={subiendoFoto}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Quitar
                  </button>
                )}
              </div>

              <input
                ref={campoFoto}
                type="file"
                accept={TIPOS_DE_IMAGEN.join(',')}
                onChange={subirFoto}
                className="hidden"
              />
            </div>
          </section>

          {/* Datos personales */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <User className="h-4 w-4 text-muted-foreground" /> Datos personales
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CampoTexto id="ajustes-nombre" etiqueta="Nombre" valor={nombre} onCambio={setNombre} />
              <CampoTexto id="ajustes-apellido" etiqueta="Apellido" valor={apellido} onCambio={setApellido} />
            </div>

            <p className="text-xs text-muted-foreground">
              El correo no se puede modificar porque identifica tu cuenta en la recuperación de contraseña.
              Si necesitas cambiarlo, pídeselo a un administrador.
            </p>
          </section>

          {/* Contraseña */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Lock className="h-4 w-4 text-muted-foreground" /> Cambiar contraseña
            </h3>

            <CampoContrasena
              id="ajustes-actual"
              etiqueta="Contraseña actual"
              valor={contrasenaActual}
              onCambio={setContrasenaActual}
              visible={verActual}
              onAlternar={() => setVerActual((valor) => !valor)}
              autoComplete="current-password"
            />
            <CampoContrasena
              id="ajustes-nueva"
              etiqueta="Nueva contraseña"
              valor={nuevaContrasena}
              onCambio={setNuevaContrasena}
              visible={verNueva}
              onAlternar={() => setVerNueva((valor) => !valor)}
              autoComplete="new-password"
              ayuda={`Mínimo ${MIN_CONTRASENA} caracteres, con al menos una letra y un número.`}
            />
            <CampoContrasena
              id="ajustes-confirmacion"
              etiqueta="Repite la nueva contraseña"
              valor={confirmacion}
              onCambio={setConfirmacion}
              visible={verNueva}
              onAlternar={() => setVerNueva((valor) => !valor)}
              autoComplete="new-password"
            />

            {cambiaContrasena && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                Al cambiar la contraseña se cerrará tu sesión y tendrás que entrar de nuevo.
              </p>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <button
            onClick={onClose}
            className="h-10 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoTexto({
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
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </div>
  );
}

function CampoContrasena({
  id,
  etiqueta,
  valor,
  onCambio,
  visible,
  onAlternar,
  autoComplete,
  ayuda,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  visible: boolean;
  onAlternar: () => void;
  autoComplete: string;
  ayuda?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold text-muted-foreground">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={(evento) => onCambio(evento.target.value)}
          autoComplete={autoComplete}
          className="h-11 w-full rounded-xl border border-input bg-background px-3 pr-11 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="button"
          onClick={onAlternar}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
        </button>
      </div>
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}
