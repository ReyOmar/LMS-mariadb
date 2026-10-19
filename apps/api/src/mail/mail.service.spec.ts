import { NotFoundException } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Sustitución de variables en las plantillas.
 *
 * Buena parte de los valores los escribe una persona —un título de curso, un nombre, el
 * comentario de una calificación— y la plantilla los recibe tal cual.
 */
describe('MailService · plantillas', () => {
  function serviceWith(bodyHtml: string, platformName = 'PESV Education') {
    const prisma = {
      emailEvent: {
        findUnique: async () => ({ templates: [{ subject: 'Curso {{cursoTitulo}}', bodyHtml }] }),
      },
    };
    const settings = { getSettings: async () => ({ platformName, primaryColor: '#1e3a8a', logoUrl: null }) };
    const config = { get: () => undefined };
    return new MailService(config as never, prisma as never, settings as never, {} as never);
  }

  function render(service: MailService, variables: Record<string, string | number>) {
    return service['render']('MATRICULA_NUEVA', variables, 'COLOMBIA');
  }

  it('inserta el valor literal aunque contenga patrones de reemplazo', async () => {
    const service = serviceWith('<p>{{cursoTitulo}}</p><footer>fin</footer>');

    const result = await render(service, { cursoTitulo: "Tarifas $' y $&" });

    expect(result?.html).toContain('<p>Tarifas $&#39; y $&amp;</p><footer>fin</footer>');
    expect(result?.subject).toBe("Curso Tarifas $' y $&");
  });

  it('escapa el HTML que traen los valores', async () => {
    const service = serviceWith('<p>{{cursoTitulo}}</p>');

    const result = await render(service, { cursoTitulo: '<script>alert(1)</script>' });

    expect(result?.html).not.toContain('<script>');
  });

  it('escapa el nombre de la plataforma en la cabecera del correo', async () => {
    const service = serviceWith('<p>hola</p>', 'Campus <b>PESV</b>');

    const result = await render(service, {});

    expect(result?.html).toContain('Campus &lt;b&gt;PESV&lt;/b&gt;');
  });
});

/**
 * Plantillas en memoria.
 *
 * Un envío en bloque —avisar a todos los matriculados de un curso— usa la misma plantilla
 * para cada correo: leerla de la base una vez por destinatario no aporta nada. Lo que sí
 * importa es que una edición desde el panel se note en el siguiente correo.
 */
describe('MailService · plantillas en memoria', () => {
  function countingService() {
    let reads = 0;
    let subject = 'Asunto 1';
    const prisma = {
      emailEvent: {
        findUnique: async () => {
          reads++;
          return { templates: [{ subject, bodyHtml: '<p>{{nombre}}</p>' }] };
        },
      },
      emailTemplate: {
        findFirst: async () => ({ id: 1 }),
        update: async ({ data }: { data: { subject: string } }) => {
          subject = data.subject;
          return { id: 1, ...data };
        },
      },
    };
    const settings = { getSettings: async () => ({ platformName: 'PESV', primaryColor: '#000', logoUrl: null }) };
    const service = new MailService({ get: () => undefined } as never, prisma as never, settings as never, {} as never);
    const render = () => service['render']('CURSO_MANTENIMIENTO', { nombre: 'Ana' }, 'COLOMBIA');
    return { service, render, reads: () => reads };
  }

  afterEach(() => jest.useRealTimers());

  it('lee la plantilla una sola vez aunque se envíen muchos correos a la vez', async () => {
    const { render, reads } = countingService();

    await Promise.all(Array.from({ length: 20 }, render));

    expect(reads()).toBe(1);
  });

  it('editar una plantilla se nota en el siguiente correo', async () => {
    const { service, render, reads } = countingService();
    await render();

    await service.updateTemplate(1, 'COLOMBIA', { subject: 'Asunto 2' });
    const next = await render();

    expect(reads()).toBe(2);
    expect(next?.subject).toBe('Asunto 2');
  });

  it('pasado el plazo vuelve a leerla', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-27T10:00:00Z') });
    const { render, reads } = countingService();
    await render();

    jest.setSystemTime(new Date('2026-09-27T10:00:31Z'));
    await render();

    expect(reads()).toBe(2);
  });

  it('un fallo de la base no se queda guardado', async () => {
    let fail = true;
    const prisma = {
      emailEvent: {
        findUnique: async () => {
          if (fail) throw new Error('la base no responde');
          return { templates: [{ subject: 'Hola', bodyHtml: '<p>hola</p>' }] };
        },
      },
    };
    const settings = { getSettings: async () => ({ platformName: 'PESV', primaryColor: '#000', logoUrl: null }) };
    const service = new MailService({ get: () => undefined } as never, prisma as never, settings as never, {} as never);
    const render = () => service['render']('CURSO_MANTENIMIENTO', {}, 'COLOMBIA');

    await expect(render()).rejects.toThrow('la base no responde');
    fail = false;

    expect((await render())?.subject).toBe('Hola');
  });
});

/** Correos de la gestión de cuentas: llevan la sede y entran por ella. */
describe('MailService · cuentas', () => {
  function capturingService() {
    const config = { get: (key: string) => (key === 'APP_URL' ? 'https://campus.test/' : undefined) };
    const service = new MailService(config as never, {} as never, {} as never, {} as never);
    const sent: { key: string; variables: Record<string, string | number> }[] = [];
    jest
      .spyOn(service as never as { sendTemplate: (...args: unknown[]) => Promise<void> }, 'sendTemplate')
      .mockImplementation(async (key: unknown, _recipient: unknown, variables: unknown) => {
        sent.push({ key: key as string, variables: variables as Record<string, string | number> });
      });
    return { service, sent };
  }

  it('el aviso de rechazo escapa el motivo que escribió el administrador', async () => {
    const { service, sent } = capturingService();

    await service.sendAccessRequestRejected('rita@pesv.test', 'Rita', '<b>No</b> consta', 'COLOMBIA');

    expect(sent[0].key).toBe('SOLICITUD_RECHAZADA');
    expect(sent[0].variables.motivo).toContain('&lt;b&gt;No&lt;/b&gt; consta');
    expect(sent[0].variables.sede).toBe('Colombia');
  });

  it('sin motivo, el aviso no lleva el recuadro vacío', async () => {
    const { service, sent } = capturingService();

    await service.sendAccessRequestRejected('rita@pesv.test', 'Rita', null, 'COLOMBIA');

    expect(sent[0].variables.motivo).toBe('');
  });
});

/**
 * Bienvenida con la contraseña temporal.
 *
 * Sin ella la persona no puede entrar, así que tiene un texto de respaldo para cuando la
 * sede no tiene plantilla. El respaldo es para eso y sólo para eso: si lo que falla es el
 * proveedor, repetir el envío con otro texto duplica los reintentos y puede hacer que
 * llegue dos veces.
 */
describe('MailService · bienvenida', () => {
  function welcomeService({ withTemplate = true, delivered = true } = {}) {
    const config = { get: (key: string) => (key === 'APP_URL' ? 'https://campus.test/' : undefined) };
    const prisma = {
      emailEvent: {
        findUnique: async () => ({
          templates: withTemplate ? [{ subject: 'Bienvenida', bodyHtml: '<p>{{sede}} {{url_campus}}</p>' }] : [],
        }),
      },
    };
    const settings = { getSettings: async () => ({ platformName: 'PESV', primaryColor: '#000', logoUrl: null }) };
    const service = new MailService(config as never, prisma as never, settings as never, {} as never);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    const deliveries: { subject: string; html: string }[] = [];
    jest
      .spyOn(service as never as { deliverToProvider: (...args: string[]) => Promise<void> }, 'deliverToProvider')
      .mockImplementation(async (_recipient: string, subject: string, html: string) => {
        deliveries.push({ subject, html });
        if (!delivered) throw new Error('El proveedor no responde');
      });
    return { service, deliveries };
  }

  it('nombra la sede y enlaza al acceso con esa sede elegida', async () => {
    const { service, deliveries } = welcomeService();

    await service.sendWelcome('eva@pesv.test', 'Eva', 'Temporal2026', 'MEXICO');

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].html).toContain('México https://campus.test/login?sede=MEXICO');
  });

  it('sin plantilla envía el texto de respaldo con la contraseña temporal', async () => {
    const { service, deliveries } = welcomeService({ withTemplate: false });

    await service.sendWelcome('eva@pesv.test', 'Eva', 'Temporal2026', 'MEXICO');

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].html).toContain('Temporal2026');
  });

  it('si falla el envío, no lo repite con el texto de respaldo', async () => {
    const { service, deliveries } = welcomeService({ delivered: false });

    await expect(service.sendWelcome('eva@pesv.test', 'Eva', 'Temporal2026', 'MEXICO')).rejects.toThrow(
      'El proveedor no responde',
    );
    expect(deliveries).toHaveLength(1);
  });
});

/**
 * Plantillas por sede.
 *
 * Cada sede edita sus propios correos: el que recibe un alumno sale de la plantilla de su
 * sede, y un administrador no puede ver ni tocar las de la otra.
 */
describe('MailService · plantillas por sede', () => {
  const TEMPLATES = [
    {
      id: 1,
      key: 'MATRICULA_NUEVA',
      country: 'COLOMBIA',
      active: true,
      subject: 'Hola desde Colombia',
      bodyHtml: '<p>CO</p>',
    },
    {
      id: 2,
      key: 'MATRICULA_NUEVA',
      country: 'MEXICO',
      active: true,
      subject: 'Hola desde México',
      bodyHtml: '<p>MX</p>',
    },
    { id: 3, key: 'RECUPERAR_PASSWORD', country: 'COLOMBIA', active: true, subject: 'Recupera', bodyHtml: '<p>R</p>' },
  ];

  function serviceForSedes() {
    const reads: unknown[] = [];
    const updates: number[] = [];
    const prisma = {
      emailEvent: {
        findUnique: async ({ select }: { select: { templates: { where: { country: string; active: boolean } } } }) => {
          const { country, active } = select.templates.where;
          reads.push(country);
          return { templates: TEMPLATES.filter((t) => t.country === country && t.active === active) };
        },
        findMany: async (query: unknown) => {
          reads.push(query);
          return [
            { key: 'MATRICULA_NUEVA', templates: [] },
            { key: 'RECUPERAR_PASSWORD', templates: [] },
          ];
        },
      },
      emailTemplate: {
        findFirst: async ({ where }: { where: { id: number; country: string } }) => {
          const template = TEMPLATES.find((t) => t.id === where.id && t.country === where.country);
          return template ? { event: { key: template.key } } : null;
        },
        update: async ({ where }: { where: { id: number } }) => {
          updates.push(where.id);
          return { id: where.id };
        },
      },
    };
    const settings = { getSettings: async () => ({ platformName: 'PESV', primaryColor: '#000', logoUrl: null }) };
    const service = new MailService({ get: () => undefined } as never, prisma as never, settings as never, {} as never);
    return { service, reads, updates };
  }

  it('el correo usa la plantilla de la sede del destinatario', async () => {
    const { service } = serviceForSedes();

    const colombia = await service['render']('MATRICULA_NUEVA', {}, 'COLOMBIA');
    const mexico = await service['render']('MATRICULA_NUEVA', {}, 'MEXICO');

    expect(colombia?.subject).toBe('Hola desde Colombia');
    expect(mexico?.subject).toBe('Hola desde México');
  });

  it('la plantilla en memoria de una sede no se usa para la otra', async () => {
    const { service, reads } = serviceForSedes();

    await service['render']('MATRICULA_NUEVA', {}, 'COLOMBIA');
    const mexico = await service['render']('MATRICULA_NUEVA', {}, 'MEXICO');

    expect(reads).toEqual(['COLOMBIA', 'MEXICO']);
    expect(mexico?.html).toContain('<p>MX</p>');
  });

  it('el listado sólo trae las plantillas de la sede pedida', async () => {
    const { service, reads } = serviceForSedes();

    await service.getEvents('MEXICO');

    expect(JSON.stringify(reads[0])).toContain('"where":{"country":"MEXICO"}');
  });

  it('un correo imprescindible se edita, pero no se desactiva', async () => {
    const { service, updates } = serviceForSedes();

    await expect(service.updateTemplate(3, 'COLOMBIA', { active: false })).rejects.toThrow(/no desactivarlo/);
    await service.updateTemplate(3, 'COLOMBIA', { subject: 'Recupera tu acceso' });
    await service.updateTemplate(1, 'COLOMBIA', { active: false });

    expect(updates).toEqual([3, 1]);
  });

  it('el listado dice qué correos son imprescindibles', async () => {
    const { service } = serviceForSedes();

    const events = await service.getEvents('COLOMBIA');

    expect(events.map(({ key, essential }) => [key, essential])).toEqual([
      ['MATRICULA_NUEVA', false],
      ['RECUPERAR_PASSWORD', true],
    ]);
  });

  it('una plantilla de la otra sede no se puede editar', async () => {
    const { service, updates } = serviceForSedes();

    await expect(service.updateTemplate(2, 'COLOMBIA', { subject: 'Cambiado' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(updates).toEqual([]);
  });
});

/**
 * Comentario del examinador en el aviso de calificación.
 *
 * Quien aprueba también debe leer lo que le escribió el examinador, no sólo quien suspende.
 */
describe('MailService · comentario del examinador', () => {
  function gradeService() {
    const prisma = {
      emailEvent: {
        findUnique: async () => ({
          templates: [{ subject: 'Nota', bodyHtml: '{{mensaje_aprobacion}}<section>{{comentario}}</section>' }],
        }),
      },
    };
    const settings = { getSettings: async () => ({ platformName: 'PESV', primaryColor: '#000', logoUrl: null }) };
    const service = new MailService({ get: () => undefined } as never, prisma as never, settings as never, {} as never);
    const sent: string[] = [];
    jest.spyOn(service as never, 'deliverToProvider').mockImplementation((async (
      _to: string,
      _s: string,
      html: string,
    ) => {
      sent.push(html);
    }) as never);
    return { service, sent };
  }

  it('el aviso de aprobado incluye el comentario, escapado', async () => {
    const { service, sent } = gradeService();

    await service.sendGrade('ana@pesv.test', 'Ana', 'Informe', 95, 'COLOMBIA', 'Muy bien <b>Ana</b> & equipo');

    expect(sent[0]).toContain('Comentario del examinador:');
    expect(sent[0]).toContain('Muy bien &lt;b&gt;Ana&lt;/b&gt; &amp; equipo');
  });

  it('sin comentario no añade el recuadro', async () => {
    const { service, sent } = gradeService();

    await service.sendGrade('ana@pesv.test', 'Ana', 'Informe', 95, 'COLOMBIA', '   ');

    expect(sent[0]).toContain('<section></section>');
  });
});

/**
 * Lo que pasa cuando el proveedor de correo falla: tras los reintentos se avisa a quien
 * envía, que decide si contarlo, registrarlo o volver a intentarlo otro día.
 */
describe('MailService · fallos del proveedor', () => {
  function serviceWithTransport(transport: { sendMail: jest.Mock } | null) {
    const service = new MailService({ get: () => undefined } as never, {} as never, {} as never, {} as never);
    service['transport'] = transport as never;
    jest.spyOn(service as never as { wait: () => Promise<void> }, 'wait').mockResolvedValue(undefined);
    return service;
  }
  const deliver = (service: MailService) => service['deliverToProvider']('ana@pesv.test', 'Asunto', '<p>Hola</p>');

  it('si el proveedor sigue fallando tras los reintentos, lo dice', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP caído'));
    const service = serviceWithTransport({ sendMail });

    await expect(deliver(service)).rejects.toThrow(/fallido tras \d+ intentos: SMTP caído/);
    expect(sendMail.mock.calls.length).toBeGreaterThan(1);
  });

  it('un fallo pasajero se resuelve con el reintento', async () => {
    const sendMail = jest.fn().mockRejectedValueOnce(new Error('SMTP caído')).mockResolvedValue(undefined);
    const service = serviceWithTransport({ sendMail });

    await expect(deliver(service)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('sin proveedor configurado no envía nada, y no es un fallo', async () => {
    await expect(deliver(serviceWithTransport(null))).resolves.toBeUndefined();
  });
});

/** Brevo rechaza un remitente sin verificar: sin `MAIL_FROM` no se intenta enviar nada. */
describe('MailService · remitente', () => {
  function configuredWith(values: Record<string, string>) {
    const service = new MailService(
      { get: (key: string) => values[key] } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    return service;
  }

  it('con la clave de Brevo y el remitente, envía por Brevo', async () => {
    const service = configuredWith({ BREVO_API_KEY: 'xkeysib-prueba', MAIL_FROM: 'campus@pesv.test' });

    await service.onModuleInit();

    expect(service['brevoApiKey']).toBe('xkeysib-prueba');
  });

  it('sin remitente no activa ningún proveedor, y lo dice', async () => {
    const service = configuredWith({ BREVO_API_KEY: 'xkeysib-prueba', SMTP_HOST: '127.0.0.1' });

    await service.onModuleInit();

    expect(service['brevoApiKey']).toBeNull();
    expect(service['transport']).toBeNull();
    expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('MAIL_FROM'));
  });
});
