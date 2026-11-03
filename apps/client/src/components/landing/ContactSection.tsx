'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Copy, FileText, Mail, MapPin, Monitor, Phone, Plug, User, type LucideIcon } from 'lucide-react';
import { COUNTRY_INFO, type Country } from '@/lib/country';
import { useAlerts } from '@/contexts/AlertContext';
import type { ContactChannel, PublishedContact } from './landing-content';
import { enterDelay } from './screens';

const CHANNELS: Record<ContactChannel, { icon: LucideIcon; title: string; copyLabel?: string }> = {
  phone: { icon: Phone, title: 'Teléfono', copyLabel: 'Copiar el teléfono' },
  email: { icon: Mail, title: 'Correo', copyLabel: 'Copiar el correo' },
  office: { icon: MapPin, title: 'Oficina' },
};

/** Un correo se parte justo tras la «@» si no cabe en su línea; a media palabra, sólo si ni así cabe. */
function breakableEmail(email: string): ReactNode {
  const at = email.indexOf('@');
  if (at < 0) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

function ContactCard({ contact, turn }: { contact: PublishedContact; turn: number }) {
  const { notify } = useAlerts();
  const { icon: Icon, title, copyLabel } = CHANNELS[contact.channel];
  const value = contact.channel === 'email' ? breakableEmail(contact.value) : contact.value;

  // Los enlaces tel: y mailto: no siempre abren nada (un computador sin programa de correo).
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contact.value);
      notify.success('Copiado', contact.value);
    } catch {
      notify.error('No se pudo copiar', 'Selecciónalo y cópialo a mano.');
    }
  };

  return (
    <li className="card card-interactive contact-card" data-enter style={enterDelay(turn)}>
      <span className="icon-tile icon-tile-sm">
        <Icon className="i" />
      </span>
      <h3>{title}</h3>
      <p className="contact-value">
        {contact.href ? <a href={contact.href}>{value}</a> : <span>{value}</span>}
        {copyLabel && (
          <button className="copy" type="button" onClick={() => void copy()} aria-label={copyLabel}>
            <Copy className="i" />
          </button>
        )}
      </p>
      {contact.detail && <p className="contact-detail">{contact.detail}</p>}
    </li>
  );
}

/** En qué se apoya el campus: hechos que la plataforma cumple, no promesas. */
function facts(dataLaw: string) {
  return [
    { icon: FileText, title: 'La normativa de cada sede', text: dataLaw },
    {
      icon: User,
      title: 'Una cuenta, una persona',
      text: 'Una sola sesión activa por cuenta: el certificado acredita a quien hizo el curso.',
    },
    {
      icon: Plug,
      title: 'Conectada con el PESV',
      text: 'El sistema PESV de la empresa pide la matrícula y recibe avisos firmados del avance y del certificado.',
    },
    { icon: Monitor, title: 'En cualquier pantalla', text: 'Del computador al celular, en modo claro u oscuro.' },
  ];
}

/**
 * El cierre de la portada: los contactos que publicó la sede (los vacíos no salen), en qué se
 * apoya el campus y el pie, que llega como `footer`.
 */
export function ContactSection({
  contacts,
  country,
  dataLaw,
  footer,
}: {
  contacts: PublishedContact[];
  country: Country;
  dataLaw: string;
  footer: ReactNode;
}) {
  return (
    <section className="screen" id="contacto" aria-labelledby="t-contacto">
      <div className="wrap closing">
        <div className="contact-main">
          {contacts.length > 0 && (
            <div className="contact-top">
              <div className="split-head" data-enter style={enterDelay(0)}>
                <p className="badge">
                  <Phone className="i" />
                  Contacto
                </p>
                <h2 className="title" id="t-contacto">
                  Contáctanos
                </h2>
                <p className="lead">Datos de la sede de {COUNTRY_INFO[country].name}.</p>
              </div>
              <ul className="contact-cards" style={{ '--cards': Math.max(contacts.length, 2) } as CSSProperties}>
                {contacts.map((contact, index) => (
                  <ContactCard key={contact.channel} contact={contact} turn={1 + index} />
                ))}
              </ul>
            </div>
          )}
          <div className="reasons-block" data-enter style={enterDelay(4)}>
            <h2 id={contacts.length > 0 ? undefined : 't-contacto'}>
              En qué <span className="text-primary">se apoya</span>
            </h2>
            <ul className="reasons">
              {facts(dataLaw).map((fact) => (
                <li key={fact.title} className="reason">
                  <span className="icon-tile icon-tile-sm">
                    <fact.icon className="i" />
                  </span>
                  <div>
                    <h3>{fact.title}</h3>
                    <p>{fact.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {footer}
      </div>
    </section>
  );
}
