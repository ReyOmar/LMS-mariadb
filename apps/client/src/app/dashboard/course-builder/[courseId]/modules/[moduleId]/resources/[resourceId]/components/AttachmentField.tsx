'use client';

import { Download, Paperclip } from 'lucide-react';
import { fileUrlFor } from '@/lib/api';
import { formatMb, type UploadLimit } from '@/lib/upload-limits';
import type { StoredAttachment } from '../resource-form';
import { EditorSection } from './EditorSection';

const MATERIAL_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar';

interface Props {
  attachment: StoredAttachment | null;
  /** Elegido y aún no subido: se sube al guardar. */
  pendingFile: File | null;
  limit: UploadLimit | null;
  readOnly: boolean;
  /** Mientras se guarda: el archivo que se sube es el que se ve. */
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/** Material descargable del recurso. */
export function AttachmentField({ attachment, pendingFile, limit, readOnly, disabled, onPick, onRemove }: Props) {
  const name = pendingFile?.name ?? attachment?.name;
  const downloadUrl = pendingFile ? null : fileUrlFor(attachment?.url);

  return (
    <EditorSection icon={Paperclip} title="Archivo adjunto" optional>
      {name ? (
        <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
          <Paperclip className="h-5 w-5 text-primary flex-shrink-0" />
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sm flex-1 truncate text-primary hover:underline flex items-center gap-1"
            >
              <Download className="h-3.5 w-3.5" /> {name}
            </a>
          ) : (
            <span className="font-medium text-sm flex-1 truncate">
              {name}
              {pendingFile && <span className="text-muted-foreground font-normal"> · se subirá al guardar</span>}
            </span>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-bold disabled:opacity-50 disabled:pointer-events-none"
            >
              Quitar
            </button>
          )}
        </div>
      ) : readOnly ? (
        <p className="text-sm text-muted-foreground">Sin archivo adjunto.</p>
      ) : (
        <label
          className={`flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-6 transition-colors ${
            disabled ? 'opacity-50' : 'cursor-pointer hover:border-primary/50 hover:bg-muted/20'
          }`}
        >
          <Paperclip className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-medium">
            Haz clic para adjuntar un archivo (PDF, Word, PPT...)
            {limit && ` — máximo ${formatMb(limit.maxMb)}`}
          </span>
          <input
            type="file"
            className="hidden"
            accept={MATERIAL_TYPES}
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onPick(file);
            }}
          />
        </label>
      )}
    </EditorSection>
  );
}
