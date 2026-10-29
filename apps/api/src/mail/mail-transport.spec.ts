import { MailTransport } from './mail-transport';

/**
 * Lo que pasa cuando el proveedor de correo falla: tras los reintentos se avisa a quien
 * envía, que decide si contarlo, registrarlo o volver a intentarlo otro día.
 */
describe('MailTransport · fallos del proveedor', () => {
  function transportWith(smtp: { sendMail: jest.Mock } | null) {
    const transport = new MailTransport({ get: () => undefined } as never);
    transport['smtp'] = smtp as never;
    jest.spyOn(transport as never as { wait: () => Promise<void> }, 'wait').mockResolvedValue(undefined);
    return transport;
  }
  const deliver = (transport: MailTransport) => transport.deliver('ana@pesv.test', 'Asunto', '<p>Hola</p>');

  it('si el proveedor sigue fallando tras los reintentos, lo dice', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP caído'));
    const transport = transportWith({ sendMail });

    await expect(deliver(transport)).rejects.toThrow(/fallido tras \d+ intentos: SMTP caído/);
    expect(sendMail.mock.calls.length).toBeGreaterThan(1);
  });

  it('un fallo pasajero se resuelve con el reintento', async () => {
    const sendMail = jest.fn().mockRejectedValueOnce(new Error('SMTP caído')).mockResolvedValue(undefined);
    const transport = transportWith({ sendMail });

    await expect(deliver(transport)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('sin proveedor configurado no envía nada, y no es un fallo', async () => {
    await expect(deliver(transportWith(null))).resolves.toBeUndefined();
  });
});

/** Brevo rechaza un remitente sin verificar: sin `MAIL_FROM` no se intenta enviar nada. */
describe('MailTransport · remitente', () => {
  function configuredWith(values: Record<string, string>) {
    const transport = new MailTransport({ get: (key: string) => values[key] } as never);
    jest.spyOn(transport['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(transport['logger'], 'log').mockImplementation(() => undefined);
    return transport;
  }

  it('con la clave de Brevo y el remitente, envía por Brevo', async () => {
    const transport = configuredWith({ BREVO_API_KEY: 'xkeysib-prueba', MAIL_FROM: 'campus@pesv.test' });

    await transport.onModuleInit();

    expect(transport['brevoApiKey']).toBe('xkeysib-prueba');
  });

  it('sin remitente no activa ningún proveedor, y lo dice', async () => {
    const transport = configuredWith({ BREVO_API_KEY: 'xkeysib-prueba', SMTP_HOST: '127.0.0.1' });

    await transport.onModuleInit();

    expect(transport['brevoApiKey']).toBeNull();
    expect(transport['smtp']).toBeNull();
    expect(transport['logger'].error).toHaveBeenCalledWith(expect.stringContaining('MAIL_FROM'));
  });
});
