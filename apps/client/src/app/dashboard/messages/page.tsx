'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Search,
  X,
  Check,
  Loader2,
  Inbox,
  UserPlus,
  CheckCircle,
  XCircle,
  Shield,
  Trash2,
} from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useRealtimeEvent } from '@/contexts/RealtimeContext';
import api, { errorMessage } from '@/lib/api';
import type { Contact, Message, UserRole } from '@/types/models';
import { PageLoader } from '@/components/ui/PageLoader';
import { useAlerts } from '@/contexts/AlertContext';
import { useDebounce } from '@/hooks/useDebounce';
import { USER_ROLE_LABEL } from '@/lib/labels';
import { shortTime, conversationTimestamp } from '@/lib/dates';
import { initials } from '@/lib/text';

/** Relación con alguien a quien se ha pedido conversar. */
type ContactStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

interface ContactCandidate {
  guid: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  contactStatus: ContactStatus | null;
  isExaminer: boolean;
}

interface ContactRequest {
  id: number;
  courseGuid: string;
  createdAt: string;
  requester: { guid: string; firstName: string; lastName: string; email: string; role: UserRole } | null;
}

/** Color del avatar de cada rol. */
const ROLE_COLOR: Record<UserRole, string> = {
  TEACHER: 'bg-blue-500',
  STUDENT: 'bg-emerald-500',
  ADMIN: 'bg-red-500',
};

const roleColor = (role: UserRole) => ROLE_COLOR[role] ?? 'bg-primary';

/**
 * Caracteres mínimos para buscar personas. Con uno solo casi todos coinciden y el servidor
 * no busca; sin texto sí lista a los primeros de tus cursos.
 */
const MIN_SEARCH_LENGTH = 2;

const isTooShort = (text: string) => {
  const length = text.trim().length;
  return length > 0 && length < MIN_SEARCH_LENGTH;
};

export default function MessagesPage() {
  const { user } = useSession();
  const { showAlert, showConfirmation, notify } = useAlerts();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [openContact, setOpenContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  /** Conversación cuya carga está en curso: si se abre otra antes de que llegue, se ignora. */
  const conversationRequest = useRef<string | null>(null);

  // Búsqueda de personas para empezar una conversación nueva.
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchResults, setSearchResults] = useState<ContactCandidate[]>([]);
  const [personSearch, setPersonSearch] = useState('');
  const appliedPersonSearch = useDebounce(personSearch, 300);
  const [searching, setSearching] = useState(false);
  /** Se incrementa para volver a pedir los resultados sin que cambie el texto buscado. */
  const [searchVersion, setSearchVersion] = useState(0);

  // Solicitudes de contacto recibidas.
  const [pendingRequests, setPendingRequests] = useState<ContactRequest[]>([]);
  const [showRequests, setShowRequests] = useState(false);

  const conversationEnd = useRef<HTMLDivElement>(null);

  const loadContacts = useCallback(async () => {
    try {
      const { data } = await api.get<Contact[]>('/notifications/messages/contacts');
      setContacts(data ?? []);
    } catch (error) {
      notify.error('No se pudieron cargar tus conversaciones', errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadPendingRequests = useCallback(async () => {
    try {
      const { data } = await api.get<ContactRequest[]>('/notifications/messages/requests');
      setPendingRequests(data ?? []);
    } catch {
      // Las solicitudes son complementarias: la bandeja sigue siendo usable sin ellas.
    }
  }, []);

  useEffect(() => {
    void loadContacts();
    void loadPendingRequests();
  }, [loadContacts, loadPendingRequests]);

  // Sólo se busca entre quienes comparten curso: el chat no abre la sede entera. Se espera a
  // que se deje de teclear para no lanzar una consulta por letra.
  useEffect(() => {
    if (!showNewChat || isTooShort(appliedPersonSearch)) {
      // Una búsqueda anterior pudo quedar a medias: su respuesta ya no se va a pintar.
      setSearching(false);
      return;
    }
    let current = true;
    setSearching(true);
    api
      .get<ContactCandidate[]>('/notifications/messages/search', { params: { q: appliedPersonSearch.trim() } })
      .then(({ data }) => {
        if (current) setSearchResults(data ?? []);
      })
      .catch(() => {
        if (current) setSearchResults([]);
      })
      .finally(() => {
        if (current) setSearching(false);
      });
    return () => {
      current = false;
    };
  }, [showNewChat, appliedPersonSearch, searchVersion]);

  // Un mensaje entrante se añade a la conversación abierta sin recargarla entera.
  useRealtimeEvent('message:new', (data) => {
    const message = data as {
      id: number;
      senderGuid: string;
      senderName?: string;
      subject: string;
      content: string;
      createdAt: string;
    };

    void loadContacts();
    if (!openContact || message.senderGuid !== openContact.guid) return;

    setMessages((prev) => [
      ...prev,
      {
        id: message.id,
        senderGuid: message.senderGuid,
        subject: message.subject,
        content: message.content,
        read: true,
        createdAt: message.createdAt,
        isMine: false,
      },
    ]);

    // Ya está a la vista: se marca como leído para que el contador no crezca.
    void api.patch(`/notifications/messages/${message.senderGuid}/read`).catch(() => undefined);
  });

  useRealtimeEvent('notification:new', () => loadPendingRequests());

  // Al llegar un mensaje se baja del todo: lo último escrito es lo que se quiere leer.
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openConversation = async (contact: Contact) => {
    conversationRequest.current = contact.guid;
    setOpenContact(contact);
    setMessages([]);
    setLoadingMessages(true);
    try {
      const { data } = await api.get<Message[]>(`/notifications/messages/${contact.guid}`);
      if (conversationRequest.current !== contact.guid) return;
      setMessages(data ?? []);
      await api.patch(`/notifications/messages/${contact.guid}/read`);
      setContacts((prev) => prev.map((c) => (c.guid === contact.guid ? { ...c, unreadCount: 0 } : c)));
    } catch (error) {
      if (conversationRequest.current !== contact.guid) return;
      notify.error('No se pudieron cargar los mensajes', errorMessage(error));
    } finally {
      if (conversationRequest.current === contact.guid) setLoadingMessages(false);
    }
  };

  const closeConversation = () => {
    conversationRequest.current = null;
    setOpenContact(null);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !openContact || sending) return;
    setSending(true);
    try {
      await api.post('/notifications/messages', {
        recipientGuid: openContact.guid,
        subject: 'Mensaje',
        content: newMessage.trim(),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          senderGuid: user?.guid ?? '',
          subject: 'Mensaje',
          content: newMessage.trim(),
          read: false,
          createdAt: new Date().toISOString(),
          isMine: true,
        },
      ]);
      setNewMessage('');
      void loadContacts();
    } catch (error) {
      showAlert.error('No se pudo enviar el mensaje', errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const deleteConversation = async () => {
    if (!openContact) return;
    const confirmed = await showConfirmation(
      'Vaciar conversación',
      `Se eliminará de tu bandeja la conversación con ${openContact.firstName}. ` +
        'La otra persona conservará su copia y podréis seguir escribiéndoos. No se puede deshacer.',
      'Vaciar',
    );
    if (!confirmed) return;

    try {
      await api.delete(`/notifications/messages/${openContact.guid}`);
      setMessages([]);
      closeConversation();
      void loadContacts();
      notify.success('Conversación vaciada de tu bandeja.');
    } catch (error) {
      showAlert.error('No se pudo vaciar la conversación', errorMessage(error));
    }
  };

  const sendContactRequest = async (receiverGuid: string) => {
    try {
      await api.post('/notifications/messages/requests', { receiverGuid });
      // Se vuelven a pedir los resultados para que el botón pase a «Pendiente» o «Conectado».
      setSearchVersion((version) => version + 1);
      void loadContacts();
    } catch (error) {
      showAlert.error('No se pudo enviar la solicitud', errorMessage(error));
    }
  };

  const respondToRequest = async (id: number, accept: boolean) => {
    try {
      await api.patch(`/notifications/messages/requests/${id}`, { accept });
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      if (accept) void loadContacts();
    } catch (error) {
      showAlert.error('No se pudo responder a la solicitud', errorMessage(error));
    }
  };

  const filteredContacts = contacts.filter((c) =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <PageLoader message="Cargando mensajes..." />;

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-6rem)]">
      <header className="mb-6">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
          <MessageSquare className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          Mensajes
        </h1>
        <p className="text-muted-foreground mt-1.5">Comunicación exclusiva entre participantes del curso.</p>
      </header>

      <div className="flex gap-0 h-[calc(100vh-14rem)] bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Lista de contactos */}
        <div
          className={`w-full md:w-[340px] border-r border-border flex flex-col shrink-0 ${openContact ? 'hidden md:flex' : 'flex'}`}
        >
          {/* Búsqueda y acciones */}
          <div className="p-4 border-b border-border/50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar contacto"
                placeholder="Buscar contacto..."
                className="w-full bg-muted/50 border-0 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewChat(true);
                  setShowRequests(false);
                  setPersonSearch('');
                }}
                className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" /> Nuevo contacto
              </button>
              {pendingRequests.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowRequests(!showRequests);
                    setShowNewChat(false);
                  }}
                  className="relative bg-amber-500/10 text-amber-600 border border-amber-500/30 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-amber-500/20 transition-colors"
                  title="Solicitudes pendientes"
                  aria-label={`Solicitudes pendientes (${pendingRequests.length})`}
                  aria-expanded={showRequests}
                >
                  <Shield className="h-4 w-4" />
                  <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 bg-amber-500 text-amber-950 text-[10px] font-bold rounded-full flex items-center justify-center">
                    {pendingRequests.length}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Panel de solicitudes pendientes */}
          {showRequests && pendingRequests.length > 0 && (
            <div className="p-3 border-b border-border bg-amber-500/5 max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
                  Solicitudes pendientes
                </span>
                <button
                  type="button"
                  onClick={() => setShowRequests(false)}
                  className="p-1 hover:bg-muted rounded-lg"
                  aria-label="Cerrar solicitudes"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 p-3 bg-card border border-border/50 rounded-xl">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {initials(req.requester?.firstName, req.requester?.lastName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">
                        {req.requester?.firstName} {req.requester?.lastName}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Quiere conversar contigo</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => respondToRequest(req.id, true)}
                        className="p-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg hover:bg-emerald-500/20 transition-colors"
                        title="Aceptar"
                        aria-label="Aceptar la solicitud"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => respondToRequest(req.id, false)}
                        className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
                        title="Rechazar"
                        aria-label="Rechazar la solicitud"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat nuevo: buscar entre los del curso */}
          {showNewChat && (
            <div className="p-3 border-b border-border bg-muted/20 max-h-80 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Buscar en tus cursos
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewChat(false)}
                  className="p-1 hover:bg-muted rounded-lg"
                  aria-label="Cerrar la búsqueda"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <input
                type="text"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                aria-label="Buscar en tus cursos por nombre o correo electrónico"
                placeholder="Nombre o correo electrónico..."
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
                autoFocus
              />
              <div className="flex-1 overflow-y-auto space-y-1">
                {isTooShort(personSearch) ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Escribe al menos {MIN_SEARCH_LENGTH} caracteres para buscar.
                  </p>
                ) : searching ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    No se encontraron participantes en tus cursos. Verifica que estés inscrito o asignado a un curso.
                  </p>
                ) : (
                  searchResults.map((u) => (
                    <div
                      key={u.guid}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-card border border-border/30 hover:border-primary/30 transition-all"
                    >
                      <div
                        className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${roleColor(u.role)}`}
                      >
                        {initials(u.firstName, u.lastName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold truncate">
                            {u.firstName} {u.lastName}
                          </p>
                          {u.isExaminer && (
                            <span className="text-[9px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                              Examinador
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      {u.contactStatus === 'ACCEPTED' ? (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold px-2 py-1 bg-emerald-500/10 rounded-full shrink-0">
                          Conectado
                        </span>
                      ) : u.contactStatus === 'PENDING' ? (
                        <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold px-2 py-1 bg-amber-500/10 rounded-full shrink-0">
                          Pendiente
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => sendContactRequest(u.guid)}
                          className="text-[10px] bg-primary text-primary-foreground font-bold px-2.5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors shrink-0"
                        >
                          Solicitar
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Lista de contactos */}
          <div className="flex-1 overflow-y-auto">
            {filteredContacts.length === 0 && !showNewChat && !showRequests ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
                <Inbox className="h-10 w-10 opacity-20 mb-3" />
                <p className="text-sm font-medium">Sin conversaciones</p>
                <p className="text-xs text-center mt-1">
                  Busca un compañero o examinador de tu curso para iniciar una conversación.
                </p>
              </div>
            ) : (
              filteredContacts.map((c) => (
                <button
                  key={c.guid}
                  type="button"
                  onClick={() => openConversation(c)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left border-b border-border/30 ${
                    openContact?.guid === c.guid ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${roleColor(c.role)}`}
                  >
                    {initials(c.firstName, c.lastName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {c.lastMessageAt ? conversationTimestamp(c.lastMessageAt) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {c.lastMessage || 'Envía el primer mensaje'}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Zona de la conversación */}
        <div className={`flex-1 flex flex-col ${!openContact ? 'hidden md:flex' : 'flex'}`}>
          {!openContact ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-14 w-14 mx-auto mb-4 opacity-10" />
                <p className="font-medium">Selecciona una conversación</p>
                <p className="text-sm mt-1">o busca un contacto en tus cursos para comenzar.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Cabecera de la conversación */}
              <div className="h-16 px-5 flex items-center gap-3 border-b border-border/50 shrink-0 bg-muted/10">
                <button
                  type="button"
                  onClick={closeConversation}
                  className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
                  aria-label="Volver a las conversaciones"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${roleColor(openContact.role)}`}
                >
                  {initials(openContact.firstName, openContact.lastName)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">
                    {openContact.firstName} {openContact.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{USER_ROLE_LABEL[openContact.role]}</p>
                </div>
                <button
                  type="button"
                  onClick={deleteConversation}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-auto"
                  title="Vaciar conversación de mi bandeja"
                  aria-label="Vaciar conversación de mi bandeja"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-10" />
                      <p className="text-sm">Envía el primer mensaje.</p>
                    </div>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMine = m.isMine;
                    return (
                      <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                            isMine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                          <p
                            className={`text-[10px] mt-1.5 flex items-center gap-1 ${isMine ? 'text-primary-foreground/60 justify-end' : 'text-muted-foreground'}`}
                          >
                            {shortTime(m.createdAt)}
                            {isMine && <Check className="h-3 w-3" />}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={conversationEnd} />
              </div>

              {/* Campo */}
              <div className="p-4 border-t border-border/50 shrink-0">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    aria-label="Mensaje"
                    placeholder="Escribe un mensaje..."
                    className="flex-1 bg-muted/50 border border-border rounded-xl px-4 py-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    disabled={sending}
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    aria-label="Enviar mensaje"
                    className="h-11 w-11 bg-primary text-primary-foreground rounded-xl flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
