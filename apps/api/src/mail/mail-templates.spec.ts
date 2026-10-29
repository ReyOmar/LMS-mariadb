import { NotFoundException } from '@nestjs/common';
import { MailTemplates } from './mail-templates';

/**
 * Sustitución de variables en las plantillas.
 *
 * Buena parte de los valores los escribe una persona —un título de curso, un nombre, el
 * comentario de una calificación— y la plantilla los recibe tal cual.
 */
describe('MailTemplates · variables', () => {
  function serviceWith(bodyHtml: string, platformName = 'PESV Education') {
    const prisma = {
      emailEvent: {
        findUnique: async () => ({ templates: [{ subject: 'Curso {{cursoTitulo}}', bodyHtml }] }),
      },
    };
    const settings = { getSettings: async () => ({ platformName, primaryColor: '#1e3a8a', logoUrl: null }) };
    const config = { get: () => undefined };
    return new MailTemplates(config as never, prisma as never, settings as never, {} as never);
  }

  function render(templates: MailTemplates, variables: Record<string, string | number>) {
    return templates.render('MATRICULA_NUEVA', variables, 'COLOMBIA');
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
describe('MailTemplates · plantillas en memoria', () => {
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
    const templates = new MailTemplates(
      { get: () => undefined } as never,
      prisma as never,
      settings as never,
      {} as never,
    );
    const render = () => templates.render('CURSO_MANTENIMIENTO', { nombre: 'Ana' }, 'COLOMBIA');
    return { templates, render, reads: () => reads };
  }

  afterEach(() => jest.useRealTimers());

  it('lee la plantilla una sola vez aunque se envíen muchos correos a la vez', async () => {
    const { render, reads } = countingService();

    await Promise.all(Array.from({ length: 20 }, render));

    expect(reads()).toBe(1);
  });

  it('editar una plantilla se nota en el siguiente correo', async () => {
    const { templates, render, reads } = countingService();
    await render();

    await templates.updateTemplate(1, 'COLOMBIA', { subject: 'Asunto 2' });
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
    const templates = new MailTemplates(
      { get: () => undefined } as never,
      prisma as never,
      settings as never,
      {} as never,
    );
    const render = () => templates.render('CURSO_MANTENIMIENTO', {}, 'COLOMBIA');

    await expect(render()).rejects.toThrow('la base no responde');
    fail = false;

    expect((await render())?.subject).toBe('Hola');
  });
});

/**
 * Plantillas por sede.
 *
 * Cada sede edita sus propios correos: el que recibe un alumno sale de la plantilla de su
 * sede, y un administrador no puede ver ni tocar las de la otra.
 */
describe('MailTemplates · plantillas por sede', () => {
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
    const templates = new MailTemplates(
      { get: () => undefined } as never,
      prisma as never,
      settings as never,
      {} as never,
    );
    return { templates, reads, updates };
  }

  it('el correo usa la plantilla de la sede del destinatario', async () => {
    const { templates } = serviceForSedes();

    const colombia = await templates.render('MATRICULA_NUEVA', {}, 'COLOMBIA');
    const mexico = await templates.render('MATRICULA_NUEVA', {}, 'MEXICO');

    expect(colombia?.subject).toBe('Hola desde Colombia');
    expect(mexico?.subject).toBe('Hola desde México');
  });

  it('la plantilla en memoria de una sede no se usa para la otra', async () => {
    const { templates, reads } = serviceForSedes();

    await templates.render('MATRICULA_NUEVA', {}, 'COLOMBIA');
    const mexico = await templates.render('MATRICULA_NUEVA', {}, 'MEXICO');

    expect(reads).toEqual(['COLOMBIA', 'MEXICO']);
    expect(mexico?.html).toContain('<p>MX</p>');
  });

  it('el listado sólo trae las plantillas de la sede pedida', async () => {
    const { templates, reads } = serviceForSedes();

    await templates.getEvents('MEXICO');

    expect(JSON.stringify(reads[0])).toContain('"where":{"country":"MEXICO"}');
  });

  it('un correo imprescindible se edita, pero no se desactiva', async () => {
    const { templates, updates } = serviceForSedes();

    await expect(templates.updateTemplate(3, 'COLOMBIA', { active: false })).rejects.toThrow(/no desactivarlo/);
    await templates.updateTemplate(3, 'COLOMBIA', { subject: 'Recupera tu acceso' });
    await templates.updateTemplate(1, 'COLOMBIA', { active: false });

    expect(updates).toEqual([3, 1]);
  });

  it('el listado dice qué correos son imprescindibles', async () => {
    const { templates } = serviceForSedes();

    const events = await templates.getEvents('COLOMBIA');

    expect(events.map(({ key, essential }) => [key, essential])).toEqual([
      ['MATRICULA_NUEVA', false],
      ['RECUPERAR_PASSWORD', true],
    ]);
  });

  it('una plantilla de la otra sede no se puede editar', async () => {
    const { templates, updates } = serviceForSedes();

    await expect(templates.updateTemplate(2, 'COLOMBIA', { subject: 'Cambiado' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(updates).toEqual([]);
  });
});
