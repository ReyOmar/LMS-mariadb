import { Mail, MapPin, Phone, type LucideIcon } from 'lucide-react';
import { COUNTRY_INFO, type Country } from '@/lib/country';
import { Reveal } from '@/components/ui/Reveal';
import { CARD_CLASS, IconTile, REVEAL_STAGGER_S, SectionHeading } from './SectionParts';
import type { ContactChannel, PublishedContact } from './landing-content';

const CHANNELS: Record<ContactChannel, { icon: LucideIcon; title: string }> = {
  phone: { icon: Phone, title: 'Teléfono' },
  email: { icon: Mail, title: 'Correo' },
  office: { icon: MapPin, title: 'Oficina' },
};

/** Columnas según cuántas tarjetas hay, para que queden centradas. */
const COLUMNS_BY_COUNT: Record<number, string> = {
  1: 'max-w-sm mx-auto',
  2: 'md:grid-cols-2 max-w-3xl mx-auto',
  3: 'md:grid-cols-3',
};

export function Contact({ contacts, country }: { contacts: PublishedContact[]; country: Country }) {
  return (
    <section id="contact" className="py-24 px-4 sm:px-6 bg-gradient-to-b from-transparent to-muted/30">
      <div className="max-w-6xl mx-auto">
        <SectionHeading title="Contáctanos" intro={`Datos de la sede de ${COUNTRY_INFO[country].name}.`} />

        <div className={`grid grid-cols-1 gap-6 ${COLUMNS_BY_COUNT[contacts.length]}`}>
          {contacts.map((contact, i) => (
            <Reveal key={contact.channel} delay={i * REVEAL_STAGGER_S}>
              <ContactCard contact={contact} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactCard({ contact }: { contact: PublishedContact }) {
  const { icon, title } = CHANNELS[contact.channel];
  const valueClass = 'text-primary font-bold mt-2 text-lg wrap-anywhere';

  return (
    <div
      className={`${CARD_CLASS} rounded-3xl p-8 hover:-translate-y-2 text-center flex flex-col items-center justify-center`}
    >
      <IconTile icon={icon} size="md" className="mb-5" />
      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{title}</h3>
      {contact.href ? (
        <a href={contact.href} className={`${valueClass} hover:underline`}>
          {contact.value}
        </a>
      ) : (
        <p className={valueClass}>{contact.value}</p>
      )}
      {contact.detail && <p className="text-sm text-muted-foreground mt-1">{contact.detail}</p>}
    </div>
  );
}
