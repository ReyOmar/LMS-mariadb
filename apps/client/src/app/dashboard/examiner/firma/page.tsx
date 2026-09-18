'use client';

import { useEffect, useState, useRef } from 'react';
import { FileSignature, Save, Loader2, Upload, Trash2, Eye, Download, Award } from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { useAlert } from '@/contexts/AlertContext';
import api, { mensajeDeError, subirArchivo, urlDeArchivo } from '@/lib/api';

export default function ExaminerFirmaPage() {
  const { user } = useRole();
  const { showAlert, showToast } = useAlert();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null);
  const [firmaNombre, setFirmaNombre] = useState('');
  const [firmaCargo, setFirmaCargo] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const firmaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.guid) return;
    fetchFirma();
  }, [user?.guid]);

  const fetchFirma = async () => {
    try {
      const res = await api.get('/configuracion/firma');
      const data = res.data;
      setFirmaUrl(data.firma_url || null);
      setFirmaNombre(data.firma_nombre || '');
      setFirmaCargo(data.firma_cargo || '');
      setNombreCompleto(`${data.nombre} ${data.apellido}`);
    } catch {
      showAlert.error('Error', 'No se pudieron cargar los datos de firma.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/configuracion/firma', {
        firma_nombre: firmaNombre || null,
        firma_cargo: firmaCargo || null,
      });
      showToast.success('Tu información de firma se actualizó correctamente.');
    } catch {
      showAlert.error('Error', 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFirma = async (file: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showAlert.warning('Archivo muy grande', 'La imagen no puede superar 2 MB.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/storage/upload?folder=firmas', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const filename = res.data.filename || res.data.url;
      await api.post('/configuracion/firma', { firma_url: filename });
      setFirmaUrl(filename);
      showToast.success('Tu imagen de firma se cargó correctamente.');
    } catch {
      showAlert.error('Error', 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFirma = async () => {
    try {
      await api.post('/configuracion/firma', { firma_url: null });
      setFirmaUrl(null);
      showToast.info('La imagen de firma fue eliminada.');
    } catch {
      showAlert.error('Error', 'No se pudo eliminar la firma.');
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-foreground flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <FileSignature className="h-5 w-5 text-primary" />
            </div>
            Mi Firma
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Configura tu firma escaneada, nombre y cargo para los certificados de tus cursos asignados.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 flex items-center gap-2 shrink-0"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {/* Firma Image Upload */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Imagen de Firma Escaneada</h2>
        </div>
        <div className="p-6">
          <input
            ref={firmaInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleUploadFirma(e.target.files[0]);
            }}
          />

          {firmaUrl ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-background border border-border/50 rounded-xl">
              <div className="h-16 w-32 bg-muted/50 rounded-lg border border-dashed border-border flex items-center justify-center overflow-hidden">
                <img
                  src={urlDeArchivo(firmaUrl) ?? ''}
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
                  onClick={() => firmaInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs font-bold px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                >
                  Cambiar
                </button>
                <button
                  onClick={handleRemoveFirma}
                  className="text-xs font-bold px-3 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => firmaInputRef.current?.click()}
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
                <p className="text-xs text-muted-foreground">PNG, JPG o WebP — Máximo 2 MB</p>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* Firma Name & Title */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <FileSignature className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Datos de la Firma</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-foreground mb-1.5">Nombre que aparecerá en la firma</label>
            <input
              type="text"
              value={firmaNombre}
              onChange={(e) => setFirmaNombre(e.target.value)}
              placeholder={nombreCompleto}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Si lo dejas vacío, se usará tu nombre registrado: <strong>{nombreCompleto}</strong>
            </p>
          </div>
          <div>
            <label className="block text-sm font-bold text-foreground mb-1.5">Cargo / Título Profesional</label>
            <input
              type="text"
              value={firmaCargo}
              onChange={(e) => setFirmaCargo(e.target.value)}
              placeholder="Instructor / Examinador del Curso"
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <p className="text-xs text-muted-foreground mt-1">Ej: Ing. de Seguridad Vial, Capacitador PESV, etc.</p>
          </div>
        </div>
      </section>

      {/* Preview */}
      <section className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 bg-muted/20 border-b border-border flex items-center gap-3">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">Vista Previa de tu Firma</h2>
        </div>
        <div className="p-6">
          <div className="bg-white rounded-xl border border-border p-8 flex flex-col items-center justify-center text-center">
            {/* Signature image */}
            {firmaUrl && (
              <div className="mb-2 h-12 w-28 flex items-center justify-center">
                <img
                  src={urlDeArchivo(firmaUrl) ?? ''}
                  alt="Firma"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
            {/* Signature line */}
            <div className="w-48 h-[1px] bg-slate-300" />
            <p className="text-sm font-bold text-slate-800 mt-2">{firmaNombre || nombreCompleto}</p>
            <p className="text-xs text-slate-500">{firmaCargo || 'Instructor / Examinador del Curso'}</p>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Así se verá tu firma en los certificados de los cursos que examinas.
          </p>
        </div>
      </section>
    </div>
  );
}
