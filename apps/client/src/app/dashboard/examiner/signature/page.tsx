'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { FileSignature, Save, Loader2, Upload, Trash2, Eye } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useAlerts } from '@/contexts/AlertContext';
import { PageLoader } from '@/components/ui/PageLoader';
import api, { errorMessage, uploadFile, fileUrlFor } from '@/lib/api';
import { IMAGE_LIMITS_MB, uploadLimit } from '@/lib/upload-limits';

/** Una firma escaneada es una imagen pequeña: más peso sólo engorda cada certificado. */
const MAX_SIGNATURE_SIZE_MB = IMAGE_LIMITS_MB.firmas;

/** Firma del examinador en sesión. La imagen llega como URL firmada: la carpeta es reservada. */
interface SignatureSettings {
  signatureUrl: string | null;
  signatureName: string | null;
  signatureTitle: string | null;
  firstName: string;
  lastName: string;
}

export default function ExaminerSignature() {
  const { user } = useSession();
  const { showAlert, notify } = useAlerts();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [signatureTitle, setSignatureTitle] = useState('');
  const [fullName, setFullName] = useState('');
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const loadSignature = useCallback(async () => {
    try {
      const { data } = await api.get<SignatureSettings>('/settings/signature');
      setSignatureUrl(data.signatureUrl || null);
      setSignatureName(data.signatureName || '');
      setSignatureTitle(data.signatureTitle || '');
      setFullName(`${data.firstName} ${data.lastName}`);
    } catch (error) {
      showAlert.error('Error', errorMessage(error, 'No se pudieron cargar los datos de firma.'));
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (user?.guid) void loadSignature();
  }, [user?.guid, loadSignature]);

  const onSave = async () => {
    setSaving(true);
    try {
      await api.post('/settings/signature', {
        signatureName: signatureName || null,
        signatureTitle: signatureTitle || null,
      });
      notify.success('Tu información de firma se actualizó correctamente.');
    } catch (error) {
      showAlert.error('Error', errorMessage(error, 'No se pudieron guardar los cambios.'));
    } finally {
      setSaving(false);
    }
  };

  const onSignatureUpload = async (file: File) => {
    setUploading(true);
    try {
      const { filename } = await uploadFile('/storage/upload?folder=firmas', file, { limit: uploadLimit('firmas') });
      // Se guarda la clave, pero se muestra la URL firmada que devuelve la API: la clave a
      // secas apunta a una carpeta reservada y el navegador recibiría un 403.
      const { data } = await api.post<SignatureSettings>('/settings/signature', { signatureUrl: filename });
      setSignatureUrl(data.signatureUrl);
      notify.success('Tu imagen de firma se cargó correctamente.');
    } catch (error) {
      showAlert.error('No se pudo subir la imagen', errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const onRemoveSignature = async () => {
    try {
      await api.post('/settings/signature', { signatureUrl: null });
      setSignatureUrl(null);
      notify.info('La imagen de firma fue eliminada.');
    } catch (error) {
      showAlert.error('Error', errorMessage(error, 'No se pudo eliminar la firma.'));
    }
  };

  if (loading) return <PageLoader message="Cargando tu firma…" />;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <FileSignature className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            Mi firma
          </h1>
          <p className="text-muted-foreground mt-1">
            Configura tu firma escaneada, nombre y cargo para los certificados de tus cursos asignados.
          </p>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 flex items-center gap-2 shrink-0"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {/* Subida de la imagen de la firma */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Imagen de firma escaneada</h2>
        </div>
        <div className="p-6">
          <input
            ref={signatureInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Se vacía para que volver a elegir el mismo archivo dispare el cambio otra vez.
              e.target.value = '';
              if (file) void onSignatureUpload(file);
            }}
          />

          {signatureUrl ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-background border border-border/50 rounded-xl">
              <div className="h-16 w-32 bg-muted/50 rounded-lg border border-dashed border-border flex items-center justify-center overflow-hidden">
                <img
                  src={fileUrlFor(signatureUrl) ?? ''}
                  alt="Firma"
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Firma cargada</p>
                <p className="text-xs text-muted-foreground">
                  Esta imagen aparecerá sobre la línea de firma en los certificados que emitas.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => signatureInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs font-bold px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                >
                  Cambiar
                </button>
                <button
                  onClick={onRemoveSignature}
                  className="text-xs font-bold px-3 py-2 bg-red-500/10 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                  aria-label="Eliminar firma"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => signatureInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-3 p-8 bg-background border-2 border-dashed border-border/60 rounded-xl hover:border-primary/40 transition-colors group cursor-pointer"
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
              )}
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">
                  {uploading ? 'Subiendo...' : 'Subir imagen de firma'}
                </p>
                <p className="text-xs text-muted-foreground">PNG o JPG — Máximo {MAX_SIGNATURE_SIZE_MB} MB</p>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* Nombre y cargo de la firma */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <FileSignature className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Datos de la firma</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="signature-name" className="block text-sm font-bold text-foreground mb-1.5">
              Nombre que aparecerá en la firma
            </label>
            <input
              id="signature-name"
              type="text"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder={fullName}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Si lo dejas vacío, se usará tu nombre registrado: <strong>{fullName}</strong>
            </p>
          </div>
          <div>
            <label htmlFor="signature-title" className="block text-sm font-bold text-foreground mb-1.5">
              Cargo / título profesional
            </label>
            <input
              id="signature-title"
              type="text"
              value={signatureTitle}
              onChange={(e) => setSignatureTitle(e.target.value)}
              placeholder="Instructor / examinador del curso"
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <p className="text-xs text-muted-foreground mt-1">Ej.: Ing. de seguridad vial, capacitador PESV, etc.</p>
          </div>
        </div>
      </section>

      {/* Vista previa */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Vista previa de tu firma</h2>
        </div>
        <div className="p-6">
          <div className="bg-white rounded-xl border border-border p-8 flex flex-col items-center justify-center text-center">
            {/* Imagen de la firma */}
            {signatureUrl && (
              <div className="mb-2 h-12 w-28 flex items-center justify-center">
                <img
                  src={fileUrlFor(signatureUrl) ?? ''}
                  alt="Firma"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
            {/* Línea de la firma */}
            <div className="w-48 h-[1px] bg-slate-300" />
            <p className="text-sm font-bold text-slate-800 mt-2">{signatureName || fullName}</p>
            <p className="text-xs text-slate-500">{signatureTitle || 'Instructor / examinador del curso'}</p>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Así se verá tu firma en los certificados de los cursos que examinas.
          </p>
        </div>
      </section>
    </div>
  );
}
