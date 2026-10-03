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

    await service.updateTemplate(1, { subject: 'Asunto 2' });
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
