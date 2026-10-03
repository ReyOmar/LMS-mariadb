import type { Country } from './country';
import { longDate, shortTime } from './dates';

/**
 * Textos legales de serie de cada sede.
 *
 * Colombia se rige por la Ley 1581 de 2012 y el Decreto 1377 de 2013 (compilado en el
 * Decreto 1074 de 2015); México, por la Ley Federal de Protección de Datos Personales en
 * Posesión de los Particulares de 2025. Cada administración puede sustituirlos desde el
 * panel; mientras no lo haga, rigen éstos con los datos del responsable que configure.
 *
 * Los textos admiten un formato mínimo que la página legal convierte en estructura: una
 * línea que empieza por «## » es un subtítulo, las que empiezan por «- » forman una lista
 * y una línea en blanco separa párrafos. Un texto sin marcas se ve como párrafos.
 */

/**
 * Fecha de los textos de serie (la de `BASE_LEGAL_VERSION` en la API). A mediodía UTC para
 * que se lea el mismo día en cualquier zona horaria de las sedes.
 */
export const BASE_LEGAL_DATE = '2026-09-26T12:00:00Z';

/**
 * Cómo se lee una versión de los textos legales. Las que publica una sede llevan fecha y
 * hora; la de los textos de serie es sólo un día, que se lee a mediodía UTC como
 * `BASE_LEGAL_DATE` para que no cambie de día en la zona horaria de las sedes.
 */
export function legalVersionLabel(version: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(version)) return longDate(`${version}T12:00:00Z`);
  return `${longDate(version)}, ${shortTime(version)}`;
}

/** Identificación del responsable del tratamiento, tal como la configura cada sede. */
export interface DataController {
  name: string;
  taxId: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export interface LegalTexts {
  terms: string;
  privacy: string;
  rights: string;
}

const TAX_ID_LABEL: Record<Country, string> = { COLOMBIA: 'NIT', MEXICO: 'RFC' };

/** Campos de la configuración de la sede de los que sale el responsable. */
export interface ControllerSettings {
  legalEntityName?: string | null;
  legalEntityTaxId?: string | null;
  legalAddress?: string | null;
  privacyEmail?: string | null;
  landingOffice?: string | null;
  landingEmail?: string | null;
  landingPhone?: string | null;
}

/** Responsable según la configuración de la sede, con los datos de la portada como respaldo. */
export function dataControllerFrom(settings: ControllerSettings | null | undefined, platform: string): DataController {
  return {
    name: settings?.legalEntityName || platform,
    taxId: settings?.legalEntityTaxId || null,
    address: settings?.legalAddress || settings?.landingOffice || null,
    email: settings?.privacyEmail || settings?.landingEmail || null,
    phone: settings?.landingPhone || null,
  };
}

/**
 * Datos del responsable que la ley obliga a publicar y la sede no ha configurado.
 * En Colombia se exigen también la dirección y el teléfono (Decreto 1377, art. 13).
 */
export function missingControllerData(settings: ControllerSettings | null | undefined, country: Country): string[] {
  const missing = [
    !settings?.legalEntityName && 'la razón social',
    !settings?.legalEntityTaxId && `el ${TAX_ID_LABEL[country]}`,
    !(settings?.legalAddress || settings?.landingOffice) && 'el domicilio',
    !(settings?.privacyEmail || settings?.landingEmail) && 'el correo para ejercer los derechos',
    country === 'COLOMBIA' && !settings?.landingPhone && 'el teléfono',
  ];
  return missing.filter((item): item is string => Boolean(item));
}

/**
 * Lo que el campus guarda en el navegador, por categorías y en lenguaje llano.
 * Los nombres técnicos no se publican: no le dicen nada a quien lee y cambian con el código.
 */
export const BROWSER_STORAGE = [
  {
    category: 'Sesión',
    purpose: 'Te mantiene conectado y permite mostrar tu nombre, tu función y tu sede sin esperar al servidor.',
    duration: 'Se borra al cerrar sesión y, en cualquier caso, deja de ser válida a las 24 horas.',
  },
  {
    category: 'Preferencias',
    purpose:
      'Recuerdan la sede que elegiste, el tema claro u oscuro, si dejaste abierto el temario de un curso y que ya ' +
      'leíste el aviso sobre este almacenamiento.',
    duration: 'Se conservan hasta que las borres desde tu navegador.',
  },
  {
    category: 'Apariencia de la sede',
    purpose:
      'Una copia del nombre, los colores y el logotipo de la sede, para que las páginas carguen rápido y sin ' +
      'parpadeos. No contiene datos tuyos.',
    duration: 'Se renueva en cada visita y se conserva hasta que la borres.',
  },
  {
    category: 'Borradores de cuestionarios',
    purpose: 'Tus respuestas mientras haces un cuestionario, para que no las pierdas si se recarga la página.',
    duration: 'Se borran al enviar el cuestionario.',
  },
] as const;

/** Texto del aviso visible sobre el almacenamiento; el detalle está en la página legal. */
export const STORAGE_NOTICE =
  'Este sitio guarda en tu navegador sólo lo necesario para funcionar: tu sesión, tus preferencias y los ' +
  'borradores de los cuestionarios. No usamos cookies publicitarias, analíticas ni de seguimiento. Los vídeos de ' +
  'YouTube de algunos cursos pueden usar cookies de YouTube al reproducirlos.';

/** Identificación del responsable en una línea, con lo que haya configurado. */
export function describeController(controller: DataController, country: Country): string {
  const parts = [
    controller.name,
    controller.taxId && `${TAX_ID_LABEL[country]} ${controller.taxId}`,
    controller.address && `domicilio en ${controller.address}`,
  ].filter(Boolean);
  return parts.join(', ');
}

/** Canales para ejercer los derechos, dentro de una frase. */
function contactLine(controller: DataController): string {
  const channels = [
    controller.email && `el correo ${controller.email}`,
    controller.phone && `el teléfono ${controller.phone}`,
  ]
    .filter(Boolean)
    .join(' o ');
  return channels || 'los canales de contacto publicados en la portada';
}

/** Cierra una frase con punto sin duplicarlo cuando acaba en abreviatura («S.A.S.»). */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`;
}

/** Une líneas descartando las condicionales que no aplican; '' deja una línea en blanco. */
function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string').join('\n');
}

function controllerBlock(controller: DataController, country: Country): string {
  const identity = [controller.name, controller.taxId && `${TAX_ID_LABEL[country]} ${controller.taxId}`]
    .filter(Boolean)
    .join(', ');
  const hasContact = Boolean(controller.email || controller.phone);
  return lines(
    sentence(identity),
    controller.address && `- ${country === 'COLOMBIA' ? 'Domicilio y dirección' : 'Domicilio'}: ${controller.address}`,
    controller.email && `- Correo electrónico: ${controller.email}`,
    controller.phone && `- Teléfono: ${controller.phone}`,
    !hasContact && 'Contacto: los canales publicados en la portada.',
  );
}

const PERSONAL_DATA = lines(
  '- Identificación y contacto: nombre, apellido, correo electrónico y la sede a la que perteneces.',
  '- Cuenta: tu función en el campus (capacitante, examinador o administrador), tu contraseña —guardada cifrada, ' +
    'nadie puede leerla—, las fechas de alta y de último acceso, y la fecha y la versión del texto legal que aceptaste.',
  '- Formación: cursos asignados, avance, tiempo de estudio (sólo cuenta mientras trabajas en el curso), entregas y ' +
    'archivos que subes, respuestas y calificaciones de las evaluaciones, comentarios de los examinadores y certificados.',
  '- Comunicaciones: los mensajes que intercambias en el campus y las notificaciones que recibes.',
  '- Datos opcionales: tu fotografía de perfil y, si eres examinador, la imagen de tu firma, tu nombre y tu cargo ' +
    'tal como aparecen en los certificados.',
  '- Datos técnicos: por seguridad, el servidor registra datos de conexión como la dirección IP, la fecha y la hora ' +
    'y el tipo de navegador.',
);

function purposes(country: Country): string {
  const authorities =
    country === 'COLOMBIA'
      ? 'y acreditar tu capacitación ante las autoridades cuando la ley lo exija, por ejemplo en el marco del Plan ' +
        'Estratégico de Seguridad Vial.'
      : 'y acreditar tu capacitación ante las autoridades cuando la ley lo exija.';
  return lines(
    '- Estudiar tu solicitud de acceso, y crear y gestionar tu cuenta.',
    '- Impartir los cursos, registrar tu avance y tu tiempo de estudio, y calificar tus evaluaciones.',
    '- Emitir tus certificados y permitir que cualquiera compruebe su autenticidad con el código impreso en ellos.',
    `- Informar de tu avance, tus resultados y tus certificados a la empresa u organización para la que te capacitas, ${authorities}`,
    '- Enviarte avisos del servicio por correo y en el campus: matrículas, calificaciones, fechas límite, ' +
      'recordatorios cuando llevas días sin entrar y recuperación de la contraseña.',
    '- Permitir la mensajería con los examinadores y los compañeros de tus cursos.',
    '- Proteger el campus frente a accesos indebidos y suplantaciones; por eso cada cuenta admite una sola sesión activa.',
  );
}

const INTERNAL_RECIPIENTS = lines(
  '- Los administradores de tu sede y los examinadores de tus cursos, que ven tu avance, tu tiempo de estudio, tus ' +
    'entregas y tus calificaciones.',
  '- Quien tenga uno de tus certificados y lo verifique con su código: verá tu nombre, el curso, la fecha de emisión, ' +
    'la vigencia, la intensidad horaria y la calificación, nunca tu correo.',
);

const PROCESSORS =
  'proveedores tecnológicos que tratan los datos por nuestra cuenta, sólo bajo nuestras instrucciones y con ' +
  'obligación de confidencialidad y seguridad: el alojamiento del campus y de su base de datos, el servicio de envío ' +
  'de correos y, si se usa, el de almacenamiento de archivos';

const SECURITY =
  'Protegemos tus datos con medidas técnicas y organizativas: la contraseña se guarda cifrada de forma irreversible, ' +
  'cada persona sólo accede a lo que su función necesita, los datos de cada sede están separados, cada cuenta admite ' +
  'una sola sesión activa y los archivos privados, como entregas y certificados, sólo se entregan a quien tiene permiso.';

const COOKIES_SUMMARY =
  'El campus no usa cookies ni otras tecnologías para rastrearte, ni con fines publicitarios o analíticos. Sólo guarda ' +
  'en tu navegador lo necesario para funcionar —por ejemplo, tu sesión, que incluye tu nombre, tu función y tu sede—. ' +
  'Los vídeos de YouTube que incluyen algunos cursos se rigen por las condiciones de YouTube. El detalle y cómo ' +
  'borrar estos datos están en la sección «Cookies y almacenamiento en tu navegador» de esta página.';

const ACCOUNT_SETTINGS =
  'Además, desde «Ajustes de la cuenta» puedes actualizar tu nombre, tu fotografía y tu contraseña en cualquier momento.';

/** Los términos de uso son los mismos en las dos sedes salvo la ley aplicable. */
function termsOfUse(platform: string, controller: DataController, country: Country): string {
  const introduction =
    controller.name === platform
      ? `${platform} es una plataforma de capacitación en seguridad vial.`
      : sentence(`${platform} es la plataforma de capacitación en seguridad vial de ${controller.name}`);
  const law =
    country === 'COLOMBIA'
      ? 'Estos términos se rigen por las leyes de la República de Colombia.'
      : 'Estos términos se rigen por las leyes federales de los Estados Unidos Mexicanos.';

  return lines(
    `${introduction} Su uso es gratuito para las personas a las que se asigna la capacitación. Al solicitar acceso o ` +
      'usar el campus aceptas estos términos.',
    '',
    '## Tu cuenta',
    '- Es personal e intransferible: el certificado acredita que una persona concreta hizo la formación, así que no ' +
      'compartas tu contraseña ni dejes que otra persona haga los cursos o las evaluaciones por ti.',
    '- Cada cuenta admite una sola sesión activa: si entras desde otro dispositivo, la sesión anterior se cierra.',
    '- Debes dar datos verdaderos y avisarnos si alguien usa tu cuenta sin tu permiso.',
    '- El campus está dirigido a personas mayores de edad.',
    '',
    '## Uso permitido',
    'Usa el campus sólo para tu formación. No está permitido copiar ni distribuir sus contenidos, intentar acceder a ' +
      'información de otras personas, alterar su funcionamiento, subir archivos dañinos o ilícitos, ni usar la ' +
      'mensajería para fines ajenos a los cursos.',
    '',
    '## Contenidos',
    'Los cursos y materiales son propiedad del responsable o de sus licenciantes, y puedes usarlos para tu formación ' +
      'mientras tengas acceso. Lo que entregas sigue siendo tuyo; nos autorizas a guardarlo y a que lo revisen los ' +
      'examinadores para evaluarte. Los contenidos tienen fines formativos y no sustituyen las normas de tránsito ni ' +
      'las instrucciones de seguridad de tu empresa. Algunos cursos incluyen vídeos o enlaces de otros sitios, que se ' +
      'rigen por sus propias condiciones.',
    '',
    '## Disponibilidad, suspensión y baja',
    'Procuramos que el campus funcione de forma continua, pero puede interrumpirse por mantenimiento o por causas ' +
      'técnicas. Podemos suspender o cerrar una cuenta que incumpla estos términos. Puedes pedir la baja de la tuya ' +
      `por ${contactLine(controller)}; conservaremos sólo lo que la ley exija, como se explica en el apartado de datos ` +
      'personales.',
    '',
    '## Cambios y ley aplicable',
    'Si cambiamos estos términos, publicaremos la nueva versión en esta página con su fecha y te la mostraremos la ' +
      `próxima vez que entres. ${law}`,
  );
}

function colombiaTexts(platform: string, controller: DataController, effectiveDate: string): LegalTexts {
  const contact = contactLine(controller);

  return {
    terms: termsOfUse(platform, controller, 'COLOMBIA'),
    privacy: lines(
      `Esta política explica cómo se tratan tus datos personales en ${platform}, conforme a la Ley 1581 de 2012 y al ` +
        'Decreto 1377 de 2013, hoy compilado en el Decreto 1074 de 2015.',
      '',
      '## Responsable del tratamiento',
      controllerBlock(controller, 'COLOMBIA'),
      '',
      '## Datos que tratamos',
      PERSONAL_DATA,
      '',
      '## Datos sensibles y menores de edad',
      'No te pedimos datos sensibles, como los relativos a tu salud, tu origen, tus creencias o tus datos biométricos. ' +
        'La fotografía de perfil es opcional: como tu imagen puede considerarse un dato sensible, no estás obligado a ' +
        'subirla; sólo se muestra dentro del campus, nunca se usa para reconocimiento facial y puedes quitarla cuando ' +
        'quieras.',
      'El campus está dirigido a personas mayores de edad que se capacitan por motivos laborales; no está pensado para ' +
        'menores de 18 años.',
      '',
      '## Para qué usamos tus datos',
      purposes('COLOMBIA'),
      'No usamos tus datos con fines publicitarios ni de mercadeo, no elaboramos perfiles comerciales y no los vendemos.',
      '',
      '## Quién puede conocerlos',
      INTERNAL_RECIPIENTS,
      '- La empresa u organización para la que te capacitas, que recibe tu avance, tus resultados y tus certificados.',
      `- Los ${PROCESSORS}. Algunos pueden estar fuera de Colombia, por ejemplo en la Unión Europea o en Estados ` +
        'Unidos; en ese caso se trata de una transmisión a un encargado, amparada por un contrato que le exige el ' +
        'mismo nivel de protección.',
      '- Las autoridades que lo requieran en ejercicio de sus funciones o por orden judicial.',
      '',
      '## Tu autorización',
      'Tratamos tus datos con tu autorización previa, expresa e informada. La das al solicitar acceso, marcando la ' +
        'casilla correspondiente, o la primera vez que entras si tu cuenta la creó un administrador. Guardamos la fecha ' +
        'y la versión de esta política que aceptaste como prueba. Puedes revocarla en cualquier momento, como se ' +
        'explica en «Tus derechos y cómo ejercerlos»; como los datos son imprescindibles para la capacitación, ' +
        'revocarla supone dejar de usar el campus.',
      '',
      '## Cuánto tiempo los conservamos',
      'Tratamos tus datos mientras tengas cuenta en el campus. Si tu cuenta se da de baja, conservamos lo necesario para ' +
        'acreditar las capacitaciones y los certificados emitidos, y para cumplir obligaciones legales o atender ' +
        'reclamaciones, sólo durante los plazos que fijen las normas aplicables; después los suprimimos. Algunos ' +
        'datos se borran antes: los códigos de verificación y los enlaces para recuperar la contraseña, al caducar, y ' +
        'los mensajes, cuando las dos personas de la conversación los han borrado.',
      'Las bases de datos del campus estarán vigentes mientras se preste este servicio de capacitación.',
      '',
      '## Seguridad',
      `${SECURITY} Si ocurre un incidente de seguridad que afecte a tus datos, te lo comunicaremos.`,
      '',
      '## Cookies y almacenamiento en tu navegador',
      COOKIES_SUMMARY,
      '',
      '## Vigencia y cambios',
      `Esta política rige desde el ${effectiveDate}. Si la cambiamos de forma sustancial, te lo comunicaremos antes ` +
        'de aplicarla: publicaremos la nueva versión en esta página, con su fecha, y te pediremos que la aceptes la ' +
        `próxima vez que entres. Si tienes dudas, comunícate con nosotros por ${contact}.`,
    ),
    rights: lines(
      'Como titular de tus datos personales tienes derecho a:',
      '- Conocer, actualizar y rectificar tus datos.',
      '- Pedir prueba de la autorización que diste.',
      '- Saber, si lo pides, qué uso se ha dado a tus datos.',
      '- Revocar la autorización o pedir que se supriman tus datos, salvo que exista un deber legal o contractual de ' +
        'conservarlos.',
      '- Consultar tus datos gratis, al menos una vez al mes y cada vez que esta política cambie de forma sustancial.',
      '- Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley de ' +
        'protección de datos.',
      '',
      '## Cómo ejercerlos',
      `Atiende tus solicitudes el área de protección de datos personales de ${controller.name}, a la que puedes ` +
        `dirigirte por ${contact}. Pueden presentarlas tú, tus causahabientes o tu representante o apoderado, ` +
        'acreditando esa condición. Indica en tu solicitud:',
      '- Tu nombre completo y el correo con el que usas el campus, para comprobar tu identidad.',
      '- Lo que pides y, si es un reclamo, los hechos que lo motivan.',
      '- La dirección o el correo donde quieres recibir la respuesta.',
      '- Los documentos que quieras aportar.',
      '',
      '## Plazos',
      '- Consultas (conocer tus datos o cómo se han usado): respondemos en un máximo de diez (10) días hábiles desde ' +
        'que la recibimos. Si no es posible, te explicaremos el motivo y responderemos dentro de los cinco (5) días ' +
        'hábiles siguientes.',
      '- Reclamos (corregir, actualizar o suprimir datos, revocar la autorización o denunciar un incumplimiento): ' +
        'respondemos en un máximo de quince (15) días hábiles desde el día siguiente a recibirlo. Si no es posible, ' +
        'te explicaremos el motivo y responderemos dentro de los ocho (8) días hábiles siguientes.',
      '- Si a tu reclamo le falta información, te la pediremos dentro de los cinco (5) días siguientes; si pasan dos ' +
        '(2) meses sin que la aportes, entenderemos que desististe. Mientras lo resolvemos, tus datos llevarán la ' +
        'leyenda «reclamo en trámite».',
      '',
      '## Ante la Superintendencia de Industria y Comercio',
      'Para presentar una queja ante la SIC (www.sic.gov.co) primero debes haber presentado tu consulta o reclamo ' +
        'ante nosotros.',
      '',
      ACCOUNT_SETTINGS,
    ),
  };
}

function mexicoTexts(platform: string, controller: DataController, effectiveDate: string): LegalTexts {
  const contact = contactLine(controller);

  return {
    terms: termsOfUse(platform, controller, 'MEXICO'),
    privacy: lines(
      `Este aviso explica cómo se tratan tus datos personales en ${platform}, conforme a la Ley Federal de Protección ` +
        'de Datos Personales en Posesión de los Particulares.',
      '',
      '## Identidad y domicilio del responsable',
      controllerBlock(controller, 'MEXICO'),
      '',
      '## Datos personales que tratamos',
      PERSONAL_DATA,
      'Ninguno de estos datos es sensible: no te pedimos información sobre tu salud, tu origen, tus creencias, tus ' +
        'opiniones políticas ni tu preferencia sexual. La fotografía de perfil es opcional y nunca se usa para ' +
        'reconocimiento facial. El campus está dirigido a personas mayores de edad que se capacitan por motivos ' +
        'laborales.',
      '',
      '## Finalidades',
      purposes('MEXICO'),
      'Todas estas finalidades son necesarias para prestarte el servicio de capacitación que solicitas o que te ' +
        'asignaron. No tratamos tus datos para finalidades secundarias que requieran tu consentimiento, como ' +
        'publicidad, mercadotecnia o prospección comercial, y no los vendemos.',
      '',
      '## Quién puede conocer tus datos',
      INTERNAL_RECIPIENTS,
      `- Los ${PROCESSORS}. Actúan como encargados, así que no se trata de transferencias.`,
      '',
      '## Transferencias',
      'Sólo comunicamos tus datos a terceros en casos en los que la ley no exige tu consentimiento: a la empresa u ' +
        'organización para la que te capacitas (tu avance, tus resultados y tus certificados), porque es necesario ' +
        'para la relación que da origen a la capacitación, y a las autoridades competentes, cuando una ley o una orden ' +
        'fundada y motivada lo exija. No realizamos transferencias que requieran tu consentimiento.',
      '',
      '## Cómo limitar el uso o la divulgación de tus datos',
      'La fotografía de perfil es opcional y puedes quitarla desde «Ajustes de la cuenta». Para cualquier otra ' +
        `limitación, comunícate con nosotros por ${contact}; te responderemos en los mismos plazos que a las solicitudes de ` +
        'derechos ARCO.',
      '',
      '## Derechos ARCO y revocación del consentimiento',
      'Puedes acceder a tus datos, rectificarlos, cancelarlos u oponerte a su tratamiento, y revocar tu ' +
        'consentimiento. Los medios, los requisitos y los plazos están en la sección «Tus derechos y cómo ' +
        'ejercerlos» de esta página.',
      '',
      '## Cuánto tiempo conservamos tus datos',
      'Tratamos tus datos mientras tengas cuenta en el campus. Cuando dejen de ser necesarios, los bloquearemos sólo ' +
        'durante el plazo en que puedan exigirse responsabilidades derivadas del tratamiento o para acreditar las ' +
        'capacitaciones y los certificados emitidos, y después los suprimiremos. Algunos datos se borran antes: los ' +
        'códigos de verificación y los enlaces para recuperar la contraseña, al caducar, y los mensajes, cuando las ' +
        'dos personas de la conversación los han borrado.',
      '',
      '## Seguridad',
      `${SECURITY} Si ocurre una vulneración que afecte de forma significativa tus derechos, te la informaremos de ` +
        'inmediato.',
      '',
      '## Uso de cookies y tecnologías similares',
      COOKIES_SUMMARY,
      '',
      '## Cambios a este aviso',
      `Este aviso está vigente desde el ${effectiveDate}. Si lo modificamos, publicaremos la nueva versión en esta ` +
        'página con su fecha y te la mostraremos la próxima vez que entres al campus; si cambian las finalidades, te ' +
        'pediremos que la aceptes de nuevo.',
    ),
    rights: lines(
      'Tienes derecho a:',
      '- Acceder a tus datos personales y conocer cómo los tratamos.',
      '- Rectificarlos cuando sean inexactos, incompletos o no estén actualizados.',
      '- Cancelarlos, es decir, pedir que dejemos de tenerlos: se bloquean durante el plazo que marca la ley y ' +
        'después se suprimen.',
      '- Oponerte a su tratamiento por una causa legítima.',
      'Son los llamados derechos ARCO. También puedes revocar tu consentimiento, sin efectos retroactivos, y pedir ' +
        'que limitemos el uso o la divulgación de tus datos. Los cuestionarios se califican de forma automática; si ' +
        'no estás de acuerdo con una calificación, puedes pedir que la revise una persona.',
      '',
      '## Cómo ejercerlos',
      `Envía tu solicitud al departamento de datos personales de ${controller.name} por ${contact}. Debe incluir:`,
      '- Tu nombre y un correo u otro medio para comunicarte la respuesta.',
      '- Un documento que acredite tu identidad o, si actúa un representante, la identidad de éste y su ' +
        'representación.',
      '- Una descripción clara de los datos y del derecho que quieres ejercer (para el acceso basta con pedirlo).',
      '- Si pides una rectificación, los cambios que hay que hacer y el documento que los respalde.',
      '- Cualquier otro elemento que ayude a localizar tus datos.',
      '',
      '## Plazos',
      'Te comunicaremos nuestra respuesta en un máximo de veinte (20) días hábiles desde que recibamos tu solicitud y, ' +
        'si procede, la haremos efectiva dentro de los quince (15) días hábiles siguientes. Ambos plazos pueden ' +
        'ampliarse una sola vez por un periodo igual cuando las circunstancias lo justifiquen; te lo avisaremos. El ' +
        'acceso se entrega en un documento electrónico. Ejercer estos derechos es gratuito: sólo podríamos cobrarte ' +
        'los costos de reproducción o envío si pides copias físicas.',
      'Revocar tu consentimiento se pide por el mismo medio. Como los datos son necesarios para la capacitación, ' +
        'revocarlo supone dejar de usar el campus, y conservaremos sólo lo que la ley nos obligue a guardar.',
      '',
      '## Ante la autoridad',
      'Si no estás conforme con la respuesta, o no la recibes a tiempo, puedes presentar una solicitud de protección ' +
        'de derechos ante la Secretaría Anticorrupción y Buen Gobierno, autoridad en materia de protección de datos ' +
        'personales, dentro de los quince (15) días hábiles siguientes a que te comuniquemos la respuesta o a partir ' +
        'de que venza el plazo para darla.',
      '',
      ACCOUNT_SETTINGS,
    ),
  };
}

/** Textos de serie de la sede con los datos del responsable ya incorporados. */
export function defaultLegalTexts(
  country: Country,
  platform: string,
  controller: DataController,
  effectiveDate: string,
): LegalTexts {
  return country === 'MEXICO'
    ? mexicoTexts(platform, controller, effectiveDate)
    : colombiaTexts(platform, controller, effectiveDate);
}

export interface CollectionNotice {
  title: string;
  text: string;
  /** Texto del enlace al documento completo. */
  fullDocument: string;
}

/**
 * Aviso breve que acompaña a la petición de autorización.
 *
 * Colombia exige informar al pedirla de la finalidad, del carácter facultativo de los datos
 * sensibles, de los derechos y de cómo contactar al responsable (Ley 1581, art. 12). México,
 * cuando los datos se recogen por medios electrónicos, exige el aviso simplificado con la
 * identidad y el domicilio del responsable, los datos, las finalidades y cómo limitar su uso,
 * más el enlace al integral (LFPDPPP, art. 16).
 */
export function collectionNotice(country: Country, controller: DataController): CollectionNotice {
  const purposesSummary =
    'para gestionar tu acceso y tu cuenta, impartir y evaluar tus cursos, emitir tus certificados, informar de tu ' +
    'avance a la organización para la que te capacitas y enviarte avisos del servicio';
  const data = 'tus datos de identificación y contacto y los de tu formación (avance, evaluaciones y certificados)';

  if (country === 'MEXICO') {
    const domicile = controller.address ? `, con domicilio en ${controller.address},` : '';
    return {
      title: 'Aviso de privacidad simplificado',
      text:
        `${controller.name}${domicile} tratará ${data} —ninguno es sensible— ${purposesSummary}. Todas son ` +
        'finalidades necesarias para el servicio; no los usamos para otras que requieran tu consentimiento. Para ' +
        `limitar su uso o divulgación, o ejercer tus derechos ARCO, comunícate por ${contactLine(controller)}.`,
      fullDocument: 'Consulta el aviso de privacidad integral',
    };
  }

  const reach = [
    controller.email && `correo ${controller.email}`,
    controller.phone && `teléfono ${controller.phone}`,
    controller.address && `dirección ${controller.address}`,
  ].filter(Boolean);
  const contact = reach.length > 0 ? ` (${reach.join(', ')})` : '';
  return {
    title: 'Tratamiento de tus datos',
    text:
      `${controller.name}${contact}, como responsable, tratará ${data} ${purposesSummary}. No te pedimos datos ` +
      'sensibles; la fotografía de perfil es opcional. Tienes derecho a conocer, actualizar, rectificar y suprimir ' +
      'tus datos y a revocar tu autorización.',
    fullDocument: 'Lee la política de tratamiento de datos personales',
  };
}

export type LegalBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

/** Convierte un texto legal en bloques según el formato descrito al principio del módulo. */
export function parseLegalText(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];

  const closeParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  const closeList = () => {
    if (items.length > 0) blocks.push({ kind: 'list', items });
    items = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      closeParagraph();
      closeList();
    } else if (line.startsWith('## ')) {
      closeParagraph();
      closeList();
      blocks.push({ kind: 'heading', text: line.slice(3).trim() });
    } else if (line.startsWith('- ')) {
      closeParagraph();
      items.push(line.slice(2).trim());
    } else {
      closeList();
      paragraph.push(line);
    }
  }
  closeParagraph();
  closeList();
  return blocks;
}

/** Cómo se nombra ese documento dentro de una frase, con su artículo. */
export const PRIVACY_REFERENCE: Record<Country, string> = {
  COLOMBIA: 'la política de tratamiento de datos personales',
  MEXICO: 'el aviso de privacidad',
};

/** Nombre del documento principal de privacidad en cada país. */
export const PRIVACY_TITLE: Record<Country, string> = {
  COLOMBIA: 'Política de tratamiento de datos personales',
  MEXICO: 'Aviso de privacidad integral',
};
