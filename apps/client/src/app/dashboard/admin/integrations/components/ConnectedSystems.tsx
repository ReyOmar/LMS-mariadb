'use client';

import { FormEvent, useState } from 'react';
import { BellRing, KeyRound, Loader2, Plug, Trash2, Unplug } from 'lucide-react';
import type { IntegrationClient } from '@/types/models';
import { shortDate, timeAgo } from '@/lib/dates';
import { INPUT_CLASS } from '@/components/ui/FormFields';

/** Lo que admite la API para el nombre de un sistema. */
const MAX_NAME_LENGTH = 100;

interface Props {
  clients: IntegrationClient[];
  isBusy: (key: string) => boolean;
  /** @returns Si quedó conectado. */
  onConnect: (name: string) => Promise<boolean>;
  onRenewKey: (client: IntegrationClient) => void;
  onRevokeKey: (client: IntegrationClient) => void;
  onRemove: (client: IntegrationClient) => void;
  onEditCallback: (client: IntegrationClient) => void;
}

/**
 * Los sistemas que pueden pedir matrículas en la sede, cada uno con su clave y la dirección a la que
 * se le avisa. Uno conectado se desconecta; uno desconectado se vuelve a conectar o se elimina.
 */
export function ConnectedSystems({
  clients,
  isBusy,
  onConnect,
  onRenewKey,
  onRevokeKey,
  onRemove,
  onEditCallback,
}: Props) {
  const [name, setName] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && (await onConnect(name.trim()))) setName('');
  };

  return (
    <div className="space-y-5">
      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay ningún sistema conectado.</p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-xl border border-border/50">
          {clients.map((client) => {
            const busy = isBusy(`client-${client.id}`);
            return (
              <li key={client.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{client.name}</p>
                  {client.keyPrefix ? (
                    <p className="text-xs text-muted-foreground">
                      Clave <span className="font-mono">{client.keyPrefix}…</span> · Emitida el{' '}
                      {shortDate(client.keyIssuedAt)} ·{' '}
                      {client.lastUsedAt ? `Último uso: ${timeAgo(client.lastUsedAt)}` : 'Sin usar todavía'}
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                      Desconectado: no tiene clave vigente.
                    </p>
                  )}
                  <NoticeState client={client} />
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEditCallback(client)}
                    disabled={busy}
                    aria-label={`Avisos a ${client.name}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <BellRing className="h-3.5 w-3.5" /> Avisos
                  </button>
                  <button
                    type="button"
                    onClick={() => onRenewKey(client)}
                    disabled={busy}
                    aria-label={`${client.keyPrefix ? 'Nueva clave para' : 'Volver a conectar'} ${client.name}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> {client.keyPrefix ? 'Nueva clave' : 'Volver a conectar'}
                  </button>
                  {client.keyPrefix ? (
                    <button
                      type="button"
                      onClick={() => onRevokeKey(client)}
                      disabled={busy}
                      aria-label={`Desconectar ${client.name}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      <Unplug className="h-3.5 w-3.5" /> Desconectar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRemove(client)}
                      disabled={busy}
                      aria-label={`Eliminar ${client.name}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="integration-client-name" className="sr-only">
          Nombre del sistema
        </label>
        <input
          id="integration-client-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Nombre del sistema, por ejemplo: Software PESV"
          className={`${INPUT_CLASS} flex-1`}
        />
        <button
          type="submit"
          disabled={!name.trim() || isBusy('connect')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isBusy('connect') ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Conectar sistema
        </button>
      </form>
    </div>
  );
}

/** A dónde se le avisa y cómo fue el último aviso. */
function NoticeState({ client }: { client: IntegrationClient }) {
  if (!client.callbackUrl) {
    return <p className="text-xs text-muted-foreground mt-0.5">Sin dirección de avisos: consulta él el estado.</p>;
  }
  return (
    <p className="text-xs text-muted-foreground mt-0.5 break-all">
      Avisos a <span className="font-mono">{client.callbackUrl}</span>
      {client.noticeError ? (
        <span className="block font-semibold text-red-700 dark:text-red-400">
          El último aviso no llegó ({timeAgo(client.lastNoticeAt)}): {client.noticeError} Se reintenta cada 15 minutos.
        </span>
      ) : (
        client.lastNoticeAt && ` · Último aviso: ${timeAgo(client.lastNoticeAt)}`
      )}
    </p>
  );
}
