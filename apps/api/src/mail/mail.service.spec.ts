import { MailService } from './mail.service';
import { MailTemplates } from './mail-templates';

/** Correos de la gestión de cuentas: llevan la sede y entran por ella. */
describe('MailService · cuentas', () => {
  function capturingService() {
    const config = { get: (key: string) => (key === 'APP_URL' ? 'https://campus.test/' : undefined) };
    const sent: { key: string; variables: Record<string, string | number> }[] = [];
    const templates = {
      render: async (key: string, variables: Record<string, string | number>) => {
        sent.push({ key, variables });
        return null;
      },
    };
    const service = new MailService(config as never, templates as never, {} as never);
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
    const templates = new MailTemplates(config as never, prisma as never, settings as never, {} as never);
    jest.spyOn(templates['logger'], 'warn').mockImplementation(() => undefined);

    const deliveries: { subject: string; html: string }[] = [];
    const transport = {
      deliver: async (_recipient: string, subject: string, html: string) => {
        deliveries.push({ subject, html });
        if (!delivered) throw new Error('El proveedor no responde');
      },
    };
    const service = new MailService(config as never, templates, transport as never);
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
    const config = { get: () => undefined };
    const templates = new MailTemplates(config as never, prisma as never, settings as never, {} as never);
    const sent: string[] = [];
    const transport = {
      deliver: async (_to: string, _subject: string, html: string) => {
        sent.push(html);
      },
    };
    const service = new MailService(config as never, templates, transport as never);
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
