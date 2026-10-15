import { DEFAULT_LANDING_TEXT, landingText, publishedContacts } from './landing-content';

describe('landingText', () => {
  it('usa los textos que escribió la sede, sin espacios de sobra', () => {
    expect(
      landingText({
        landingHeroTitle1: ' Rutas seguras, ',
        landingHeroTitle2: 'conductores formados',
        landingHeroSubtitle: 'Formación PESV para tu flota.',
        landingFooterText: 'Transportes del Valle',
      }),
    ).toEqual({
      heroTitle: 'Rutas seguras,',
      heroHighlight: 'conductores formados',
      heroSubtitle: 'Formación PESV para tu flota.',
      footer: 'Transportes del Valle',
    });
  });

  it('sin configuración todavía, enseña los de serie', () => {
    expect(landingText(null)).toEqual(DEFAULT_LANDING_TEXT);
  });

  it('un texto que la sede dejó vacío no deja el titular en blanco', () => {
    const text = landingText({ landingHeroTitle1: '', landingHeroTitle2: '   ', landingFooterText: 'Pie propio' });

    expect(text.heroTitle).toBe(DEFAULT_LANDING_TEXT.heroTitle);
    expect(text.heroHighlight).toBe(DEFAULT_LANDING_TEXT.heroHighlight);
    expect(text.footer).toBe('Pie propio');
  });
});

describe('publishedContacts', () => {
  it('publica sólo los canales con un dato real, en orden: teléfono, correo y oficina', () => {
    const contacts = publishedContacts(
      {
        landingOffice: 'Bogotá',
        landingOfficeSub: 'Calle 80 # 12-34',
        landingPhone: '',
        landingEmail: 'hola@flota.co',
      },
      'COLOMBIA',
    );

    expect(contacts.map((contact) => contact.channel)).toEqual(['email', 'office']);
    expect(contacts[1]).toMatchObject({ value: 'Bogotá', detail: 'Calle 80 # 12-34', href: null });
  });

  it('no publica los datos de relleno ni el nombre de la sede como oficina', () => {
    expect(
      publishedContacts(
        { landingPhone: '+52 000 000 0000', landingEmail: 'contacto.mx@pesveducation.com', landingOffice: 'México' },
        'MEXICO',
      ),
    ).toEqual([]);
    expect(publishedContacts(null, 'MEXICO')).toEqual([]);
  });

  it('un detalle vacío o de relleno se omite sin quitar la tarjeta', () => {
    const [office] = publishedContacts({ landingOffice: 'Medellín', landingOfficeSub: 'Colombia' }, 'COLOMBIA');

    expect(office).toMatchObject({ value: 'Medellín', detail: null });
  });

  it('el teléfono y el correo llevan su enlace para llamar o escribir', () => {
    const [phone, email] = publishedContacts(
      { landingPhone: '+57 (601) 234-5678', landingEmail: 'hola@flota.co' },
      'COLOMBIA',
    );

    expect(phone.href).toBe('tel:+576012345678');
    expect(email.href).toBe('mailto:hola@flota.co');
  });
});
