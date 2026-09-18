'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Search,
  X,
  User,
  Clock,
  Check,
  Loader2,
  Inbox,
  UserPlus,
  CheckCircle,
  XCircle,
  Shield,
  Trash2,
} from 'lucide-react';
import { useRole } from '@/contexts/RoleContext';
import { useEventoRealtime } from '@/contexts/RealtimeContext';
import api from '@/lib/api';
import { PageLoader } from '@/components/ui/PageLoader';
import { useAlert } from '@/contexts/AlertContext';

interface Contact {
  guid: string;
  nombre: string;
  apellido: string;
  rol: string;
  ultimo_mensaje: string;
  ultimo_mensaje_fecha: string;
  no_leidos: number;
}

interface Message {
  id: number;
  contenido: string;
  asunto: string;
  created_at: string;
  remitente: {
    guid: string;
    nombre: string;
    apellido: string;
    rol: string;
  };
}

interface SearchResult {
  guid: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  cursos: string[];
  contacto_estado: string | null;
  es_examinador: boolean;
}

interface PendingRequest {
  id: number;
  solicitante_guid: string;
  curso_guid: string;
  solicitante: { guid: string; nombre: string; apellido: string; email: string; rol: string } | null;
}

export default function MensajesPage() {
  const { user } = useRole();
  const { showConfirm } = useAlert();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);

  // New conversation state
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [searching, setSearching] = useState(false);

  // Pending requests
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [showRequests, setShowRequests] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await api.get('/notificaciones/mensajes/contactos');
      setContacts(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPendingRequests = useCallback(async () => {
    try {
      const res = await api.get('/notificaciones/mensajes/solicitudes');
      setPendingRequests(res.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchContacts();
    fetchPendingRequests();
  }, [fetchContacts, fetchPendingRequests]);

  // Un mensaje entrante se añade a la conversación abierta sin recargarla entera.
  useEventoRealtime('message:new', (datos) => {
    const mensaje = datos as {
      id: number;
      remitente_guid: string;
      remitente_nombre?: string;
      asunto: string;
      contenido: string;
      created_at: string;
    };

    fetchContacts();
    if (!selectedContact || mensaje.remitente_guid !== selectedContact.guid) return;

    const [nombre = '', ...resto] = (mensaje.remitente_nombre ?? '').split(' ');
    setMessages((previos) => [
      ...previos,
      {
        id: mensaje.id,
        contenido: mensaje.contenido,
        asunto: mensaje.asunto,
        created_at: mensaje.created_at,
        remitente: { guid: mensaje.remitente_guid, nombre, apellido: resto.join(' '), rol: '' },
      },
    ]);

    // Ya está a la vista: se marca como leído para que el contador no crezca.
    void api.patch(`/notificaciones/mensajes/${mensaje.remitente_guid}/leer`).catch(() => undefined);
  });

  useEventoRealtime('notification:new', () => fetchPendingRequests());

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openConversation = async (contact: Contact) => {
    setSelectedContact(contact);
    setMsgLoading(true);
    try {
      const res = await api.get(`/notificaciones/mensajes/${contact.guid}`);
      setMessages(res.data || []);
      await api.patch(`/notificaciones/mensajes/${contact.guid}/leer`);
      setContacts((prev) => prev.map((c) => (c.guid === contact.guid ? { ...c, no_leidos: 0 } : c)));
    } catch (err) {
      console.error(err);
    } finally {
      setMsgLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedContact || sending) return;
    setSending(true);
    try {
      await api.post('/notificaciones/mensajes', {
        destinatario_guid: selectedContact.guid,
        asunto: 'Mensaje',
        contenido: newMsg.trim(),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          contenido: newMsg.trim(),
          asunto: 'Mensaje',
          created_at: new Date().toISOString(),
          remitente: {
            guid: user?.guid || '',
            nombre: user?.nombre || '',
            apellido: user?.apellido || '',
            rol: '',
          },
        },
      ]);
      setNewMsg('');
      fetchContacts();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const deleteConversation = async () => {
    if (!selectedContact) return;
    const confirmed = await showConfirm(
      'Eliminar conversación',
      `¿Estás seguro de que quieres eliminar la conversación con ${selectedContact.nombre}? Esta acción no se puede deshacer.`,
      'Eliminar',
    );
    if (!confirmed) return;

    try {
      await api.delete(`/notificaciones/mensajes/${selectedContact.guid}`);
      setMessages([]);
      setSelectedContact(null);
      fetchContacts();
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  // Search for users in the same courses
  const handleSearch = async (term: string) => {
    setUserSearch(term);
    setSearching(true);
    try {
      const res = await api.get('/notificaciones/mensajes/buscar', { params: { q: term } });
      setSearchResults(res.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Send contact request
  const sendContactRequest = async (receptor_guid: string, curso_guid: string) => {
    try {
      await api.post('/notificaciones/mensajes/solicitudes', { receptor_guid, curso_guid });
      // Refresh search results to update status
      handleSearch(userSearch);
      fetchContacts();
    } catch {}
  };

  // Respond to a contact request
  const respondToRequest = async (id: number, aceptar: boolean) => {
    try {
      await api.patch(`/notificaciones/mensajes/solicitudes/${id}`, { aceptar });
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      if (aceptar) fetchContacts();
    } catch {}
  };

  const filteredContacts = contacts.filter((c) =>
    `${c.nombre} ${c.apellido}`.toLowerCase().includes(search.toLowerCase()),
  );

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString('es-ES', { weekday: 'short' });
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  const getRoleColor = (rol: string) => {
    if (rol === 'PROFESOR') return 'bg-blue-500';
    if (rol === 'ESTUDIANTE') return 'bg-emerald-500';
    if (rol === 'ADMINISTRADOR') return 'bg-red-500';
    return 'bg-primary';
  };

  const getRoleLabel = (rol: string) => {
    if (rol === 'PROFESOR') return 'Examinador';
    if (rol === 'ESTUDIANTE') return 'En Capacitación';
    if (rol === 'ADMINISTRADOR') return 'Administrador';
    return 'Usuario';
  };

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
        {/* Contacts List */}
        <div
          className={`w-full md:w-[340px] border-r border-border flex flex-col shrink-0 ${selectedContact ? 'hidden md:flex' : 'flex'}`}
        >
          {/* Search + Actions */}
          <div className="p-4 border-b border-border/50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contacto..."
                className="w-full bg-muted/50 border-0 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowNewChat(true);
                  setShowRequests(false);
                  handleSearch('');
                }}
                className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" /> Nuevo Contacto
              </button>
              {pendingRequests.length > 0 && (
                <button
                  onClick={() => {
                    setShowRequests(!showRequests);
                    setShowNewChat(false);
                  }}
                  className="relative bg-amber-500/10 text-amber-600 border border-amber-500/30 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-amber-500/20 transition-colors"
                  title="Solicitudes pendientes"
                >
                  <Shield className="h-4 w-4" />
                  <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {pendingRequests.length}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Pending Requests Panel */}
          {showRequests && pendingRequests.length > 0 && (
            <div className="p-3 border-b border-border bg-amber-500/5 max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">
                  Solicitudes Pendientes
                </span>
                <button onClick={() => setShowRequests(false)} className="p-1 hover:bg-muted rounded-lg">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 p-3 bg-card border border-border/50 rounded-xl">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {req.solicitante?.nombre?.charAt(0)}
                      {req.solicitante?.apellido?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">
                        {req.solicitante?.nombre} {req.solicitante?.apellido}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Quiere conversar contigo</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => respondToRequest(req.id, true)}
                        className="p-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg hover:bg-emerald-500/20 transition-colors"
                        title="Aceptar"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => respondToRequest(req.id, false)}
                        className="p-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
                        title="Rechazar"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Chat: Search Course Participants */}
          {showNewChat && (
            <div className="p-3 border-b border-border bg-muted/20 max-h-80 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Buscar en tus cursos
                </span>
                <button onClick={() => setShowNewChat(false)} className="p-1 hover:bg-muted rounded-lg">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Nombre o correo electrónico..."
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
                autoFocus
              />
              <div className="flex-1 overflow-y-auto space-y-1">
                {searching ? (
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
                        className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${getRoleColor(u.rol)}`}
                      >
                        {u.nombre?.charAt(0)}
                        {u.apellido?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold truncate">
                            {u.nombre} {u.apellido}
                          </p>
                          {u.es_examinador && (
                            <span className="text-[9px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                              Examinador
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      {u.contacto_estado === 'ACEPTADO' ? (
                        <span className="text-[10px] text-emerald-500 font-bold px-2 py-1 bg-emerald-500/10 rounded-full shrink-0">
                          Conectado
                        </span>
                      ) : u.contacto_estado === 'PENDIENTE' ? (
                        <span className="text-[10px] text-amber-500 font-bold px-2 py-1 bg-amber-500/10 rounded-full shrink-0">
                          Pendiente
                        </span>
                      ) : (
                        <button
                          onClick={() => sendContactRequest(u.guid, u.cursos[0])}
                          className="text-[10px] bg-primary text-white font-bold px-2.5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors shrink-0"
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

          {/* Contact List */}
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
                  onClick={() => openConversation(c)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left border-b border-border/30 ${
                    selectedContact?.guid === c.guid ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${getRoleColor(c.rol)}`}
                  >
                    {c.nombre?.charAt(0)}
                    {c.apellido?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm truncate">
                        {c.nombre} {c.apellido}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {c.ultimo_mensaje_fecha ? formatTime(c.ultimo_mensaje_fecha) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {c.ultimo_mensaje || 'Envía el primer mensaje'}
                    </p>
                  </div>
                  {c.no_leidos > 0 && (
                    <span className="bg-primary text-white text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center shrink-0">
                      {c.no_leidos}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Conversation Area */}
        <div className={`flex-1 flex flex-col ${!selectedContact ? 'hidden md:flex' : 'flex'}`}>
          {!selectedContact ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-14 w-14 mx-auto mb-4 opacity-10" />
                <p className="font-medium">Selecciona una conversación</p>
                <p className="text-sm mt-1 opacity-70">o busca un contacto en tus cursos para comenzar.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation Header */}
              <div className="h-16 px-5 flex items-center gap-3 border-b border-border/50 shrink-0 bg-muted/10">
                <button
                  onClick={() => setSelectedContact(null)}
                  className="md:hidden p-2 hover:bg-muted rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${getRoleColor(selectedContact.rol)}`}
                >
                  {selectedContact.nombre?.charAt(0)}
                  {selectedContact.apellido?.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">
                    {selectedContact.nombre} {selectedContact.apellido}
                  </p>
                  <p className="text-xs text-muted-foreground">{getRoleLabel(selectedContact.rol)}</p>
                </div>
                <button
                  onClick={deleteConversation}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors ml-auto"
                  title="Eliminar conversación"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {msgLoading ? (
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
                    const isMine = m.remitente.guid === user?.guid;
                    return (
                      <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                            isMine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{m.contenido}</p>
                          <p
                            className={`text-[10px] mt-1.5 flex items-center gap-1 ${isMine ? 'text-primary-foreground/60 justify-end' : 'text-muted-foreground'}`}
                          >
                            {new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            {isMine && <Check className="h-3 w-3" />}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-border/50 shrink-0">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={newMsg}
                    onChange={(e) => setNewMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 bg-muted/50 border border-border rounded-xl px-4 py-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    disabled={sending}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMsg.trim() || sending}
                    className="h-11 w-11 bg-primary text-white rounded-xl flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
