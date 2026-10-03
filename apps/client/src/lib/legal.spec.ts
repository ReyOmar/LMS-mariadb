import {
  BROWSER_STORAGE,
  STORAGE_NOTICE,
  collectionNotice,
  dataControllerFrom,
  defaultLegalTexts,
  describeController,
  legalVersionLabel,
  missingControllerData,
  parseLegalText,
} from './legal';

const controller = {
  name: 'Transportes Andinos S.A.S.',
  taxId: '900123456-7',
  address: 'Calle 10 # 20-30, Bogotá',
  email: 'datos@andinos.co',
  phone: '601 555 0000',
};

const DATE = '25 de septiembre de 2026';

describe('describeController', () => {
  it('usa la identificación fiscal de cada país', () => {
    expect(describeController(controller, 'COLOMBIA')).toContain('NIT 900123456-7');
    expect(describeController(controller, 'MEXICO')).toContain('RFC 900123456-7');
  });

  it('omite lo que no se ha configurado', () => {
    expect(describeController({ ...controller, taxId: null, address: null }, 'COLOMBIA')).toBe(controller.name);
  });
});

describe('dataControllerFrom', () => {
  it('usa los datos de la portada cuando faltan los del responsable', () => {
    const result = dataControllerFrom(
      { landingOffice: 'Oficina central', landingEmail: 'hola@campus.co', landingPhone: '300' },
      'Campus',
    );
    expect(result).toEqual({
      name: 'Campus',
      taxId: null,
      address: 'Oficina central',
      email: 'hola@campus.co',
      phone: '300',
    });
  });

  it('prefiere el correo de privacidad al de contacto', () => {
    expect(dataControllerFrom({ privacyEmail: 'datos@x.co', landingEmail: 'hola@x.co' }, 'Campus').email).toBe(
      'datos@x.co',
    );
  });
});

describe('missingControllerData', () => {
  const complete = {
    legalEntityName: 'Andinos',
    legalEntityTaxId: '900',
    legalAddress: 'Bogotá',
    privacyEmail: 'datos@andinos.co',
    landingPhone: '601',
  };

  it('no avisa cuando está todo', () => {
    expect(missingControllerData(complete, 'COLOMBIA')).toEqual([]);
  });

  it('en Colombia exige también el teléfono; en México no', () => {
    const withoutPhone = { ...complete, landingPhone: '' };
    expect(missingControllerData(withoutPhone, 'COLOMBIA')).toEqual(['el teléfono']);
    expect(missingControllerData(withoutPhone, 'MEXICO')).toEqual([]);
  });

  it('nombra la identificación fiscal de cada país', () => {
    expect(missingControllerData({ ...complete, legalEntityTaxId: null }, 'MEXICO')).toEqual(['el RFC']);
  });
});

describe('defaultLegalTexts — Colombia (Ley 1581 y Decreto 1377)', () => {
  const texts = defaultLegalTexts('COLOMBIA', 'Campus', controller, DATE);

  it('identifica al responsable con domicilio, correo y teléfono', () => {
    expect(texts.privacy).toContain('Ley 1581 de 2012');
    expect(texts.privacy).toContain('Decreto 1074 de 2015');
    expect(texts.privacy).toContain(`${controller.name}, NIT ${controller.taxId}.`);
    expect(texts.privacy).toContain(controller.address);
    expect(texts.privacy).toContain(controller.email);
    expect(texts.privacy).toContain(controller.phone);
  });

  it('declara datos, finalidades, datos sensibles, menores y destinatarios', () => {
    expect(texts.privacy).toContain('## Datos que tratamos');
    expect(texts.privacy).toContain('## Para qué usamos tus datos');
    expect(texts.privacy).toContain('Plan Estratégico de Seguridad Vial');
    expect(texts.privacy).toContain('No te pedimos datos sensibles');
    expect(texts.privacy).toContain('no estás obligado a subirla');
    expect(texts.privacy).toContain('menores de 18 años');
    expect(texts.privacy).toContain('transmisión a un encargado');
  });

  it('explica la autorización, la conservación, la vigencia de la base y los cambios', () => {
    expect(texts.privacy).toContain('autorización previa, expresa e informada');
    expect(texts.privacy).toContain('## Cuánto tiempo los conservamos');
    expect(texts.privacy).toContain('Las bases de datos del campus estarán vigentes');
    expect(texts.privacy).toContain(`rige desde el ${DATE}`);
    expect(texts.privacy).toContain('te lo comunicaremos antes de aplicarla');
  });

  it('detalla derechos, área responsable, requisitos y plazos legales', () => {
    expect(texts.rights).toContain('Pedir prueba de la autorización');
    expect(texts.rights).toContain('Revocar la autorización');
    expect(texts.rights).toContain('área de protección de datos personales de Transportes Andinos S.A.S.');
    expect(texts.rights).toContain(controller.email);
    expect(texts.rights).toContain('diez (10) días hábiles');
    expect(texts.rights).toContain('cinco (5) días hábiles');
    expect(texts.rights).toContain('quince (15) días hábiles');
    expect(texts.rights).toContain('ocho (8) días hábiles');
    expect(texts.rights).toContain('dos (2) meses');
    expect(texts.rights).toContain('«reclamo en trámite»');
    expect(texts.rights).toContain('Superintendencia de Industria y Comercio');
    expect(texts.rights).toContain('primero debes haber presentado tu consulta o reclamo');
  });

  it('los términos se rigen por la ley colombiana', () => {
    expect(texts.terms).toContain('leyes de la República de Colombia');
    expect(texts.terms).toContain('personas mayores de edad');
  });
});

describe('defaultLegalTexts — México (LFPDPPP de 2025)', () => {
  const texts = defaultLegalTexts('MEXICO', 'Campus', controller, DATE);

  it('contiene los elementos del artículo 15', () => {
    expect(texts.privacy).toContain('## Identidad y domicilio del responsable');
    expect(texts.privacy).toContain(`RFC ${controller.taxId}`);
    expect(texts.privacy).toContain(`Domicilio: ${controller.address}`);
    expect(texts.privacy).toContain('## Datos personales que tratamos');
    expect(texts.privacy).toContain('Ninguno de estos datos es sensible');
    expect(texts.privacy).toContain(
      'No tratamos tus datos para finalidades secundarias que requieran tu consentimiento',
    );
    expect(texts.privacy).toContain('## Cómo limitar el uso o la divulgación de tus datos');
    expect(texts.privacy).toContain('## Derechos ARCO y revocación del consentimiento');
    expect(texts.privacy).toContain('## Cambios a este aviso');
    expect(texts.privacy).toContain(`vigente desde el ${DATE}`);
  });

  it('aclara transferencias, encargados y tecnologías de rastreo', () => {
    expect(texts.privacy).toContain('No realizamos transferencias que requieran tu consentimiento');
    expect(texts.privacy).toContain('Actúan como encargados');
    expect(texts.privacy).toContain('## Uso de cookies y tecnologías similares');
    expect(texts.privacy).not.toContain('Plan Estratégico de Seguridad Vial');
  });

  it('detalla derechos ARCO, requisitos, plazos y autoridad vigentes', () => {
    expect(texts.rights).toContain('derechos ARCO');
    expect(texts.rights).toContain('revocar tu consentimiento');
    expect(texts.rights).toContain('departamento de datos personales');
    expect(texts.rights).toContain('acredite tu identidad');
    expect(texts.rights).toContain('veinte (20) días hábiles');
    expect(texts.rights).toContain('quince (15) días hábiles siguientes');
    expect(texts.rights).toContain('una sola vez por un periodo igual');
    expect(texts.rights).toContain('Secretaría Anticorrupción y Buen Gobierno');
    expect(texts.rights).not.toContain('INAI');
  });

  it('los términos se rigen por la ley mexicana', () => {
    expect(texts.terms).toContain('leyes federales de los Estados Unidos Mexicanos');
  });
});

describe('defaultLegalTexts — casos sin configurar', () => {
  it('sin razón social configurada no repite el nombre de la plataforma', () => {
    const texts = defaultLegalTexts('MEXICO', 'Campus', { ...controller, name: 'Campus' }, 'hoy');
    expect(texts.terms).toContain('Campus es una plataforma de capacitación en seguridad vial.');
  });

  it('sin contacto configurado remite a los canales de la portada', () => {
    const texts = defaultLegalTexts('COLOMBIA', 'Campus', { ...controller, email: null, phone: null }, 'hoy');
    expect(texts.rights).toContain('los canales de contacto publicados en la portada');
    expect(texts.privacy).toContain('Contacto: los canales publicados en la portada.');
  });

  it('no duplica el punto cuando la razón social acaba en abreviatura', () => {
    const texts = defaultLegalTexts('COLOMBIA', 'Campus', { ...controller, taxId: null }, 'hoy');
    expect(texts.terms).toContain('de Transportes Andinos S.A.S. Su uso es gratuito');
    expect(`${texts.terms}${texts.privacy}`).not.toContain('S.A.S..');
  });
});

describe('collectionNotice', () => {
  it('Colombia: identifica y da el contacto del responsable, finalidades y derechos', () => {
    const notice = collectionNotice('COLOMBIA', controller);
    expect(notice.text).toContain(controller.name);
    expect(notice.text).toContain(controller.email);
    expect(notice.text).toContain(controller.phone);
    expect(notice.text).toContain('emitir tus certificados');
    expect(notice.text).toContain('No te pedimos datos sensibles');
    expect(notice.text).toContain('revocar tu autorización');
  });

  it('México: aviso simplificado con domicilio, datos no sensibles, finalidades y cómo limitar', () => {
    const notice = collectionNotice('MEXICO', controller);
    expect(notice.title).toBe('Aviso de privacidad simplificado');
    expect(notice.text).toContain(`con domicilio en ${controller.address}`);
    expect(notice.text).toContain('ninguno es sensible');
    expect(notice.text).toContain('limitar su uso o divulgación');
    expect(notice.fullDocument).toContain('aviso de privacidad integral');
  });
});

describe('almacenamiento en el navegador', () => {
  it('se describe por categorías, con finalidad y duración, sin nombres técnicos', () => {
    for (const item of BROWSER_STORAGE) {
      expect(item.purpose).toBeTruthy();
      expect(item.duration).toBeTruthy();
      expect(`${item.category} ${item.purpose} ${item.duration}`).not.toMatch(/lms_|quiz_|_</);
    }
  });

  it('el aviso visible descarta cookies publicitarias y de seguimiento', () => {
    expect(STORAGE_NOTICE).toContain('No usamos cookies publicitarias, analíticas ni de seguimiento');
    expect(STORAGE_NOTICE).not.toMatch(/lms_/);
  });
});

describe('parseLegalText', () => {
  it('reconoce subtítulos, listas y párrafos', () => {
    expect(parseLegalText('Intro\n\n## Título\n- uno\n- dos\nCierre\nsegunda línea')).toEqual([
      { kind: 'paragraph', text: 'Intro' },
      { kind: 'heading', text: 'Título' },
      { kind: 'list', items: ['uno', 'dos'] },
      { kind: 'paragraph', text: 'Cierre\nsegunda línea' },
    ]);
  });

  it('un texto sin marcas se queda en párrafos', () => {
    expect(parseLegalText('Primero.\n\nSegundo.')).toEqual([
      { kind: 'paragraph', text: 'Primero.' },
      { kind: 'paragraph', text: 'Segundo.' },
    ]);
  });
});

describe('legalVersionLabel', () => {
  it('la versión de serie se lee como su día, sin hora ni saltos de zona horaria', () => {
    expect(legalVersionLabel('2026-09-26')).toBe('26 de septiembre de 2026');
  });

  it('la versión publicada por una sede lleva también la hora, porque puede haber varias en un día', () => {
    expect(legalVersionLabel('2026-10-02T15:04:05.678Z')).toMatch(/de octubre de 2026, \d{2}:\d{2}$/);
  });
});
