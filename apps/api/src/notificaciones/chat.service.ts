import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificacionesService } from './notificaciones.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { EnviarMensajeDto } from './dto/mensajes.dto';

/** Mensajes que devuelve una conversación. Basta para el historial visible. */
const LIMITE_CONVERSACION = 200;

/**
 * Mensajería entre usuarios, con aprobación previa.
 *
 * Existían dos reglas declaradas pero no aplicadas: sólo se puede hablar con alguien de un
 * curso compartido, y sólo tras aceptar la solicitud de contacto. `enviarMensaje` no
 * consultaba ninguna de las dos, de modo que conociendo el identificador de una persona se
 * le podía escribir directamente. Con la separación por sedes eso habría sido además una
 * vía de contacto entre Colombia y México.
 *
 * Ahora ambas reglas se comprueban en el servidor, en `asegurarContactoAceptado`.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ── Mensajes ─────────────────────────────────────────────────────────────

  /** Envía un mensaje a un contacto aceptado. */
  async enviarMensaje(dto: EnviarMensajeDto, user: JwtPayload) {
    if (dto.destinatario_guid === user.sub) {
      throw new BadRequestException('No puedes enviarte mensajes a ti mismo.');
    }

    const destinatario = await this.asegurarContactoAceptado(user, dto.destinatario_guid);

    const mensaje = await this.prisma.lms_mensajes.create({
      data: {
        remitente_guid: user.sub,
        destinatario_guid: dto.destinatario_guid,
        asunto: dto.asunto,
        contenido: dto.contenido,
        ref_tipo: dto.ref_tipo,
        ref_guid: dto.ref_guid,
      },
    });

    const remitente = await this.prisma.usuarios.findUnique({
      where: { guid: user.sub },
      select: { nombre: true, apellido: true },
    });
    const nombreRemitente = remitente ? `${remitente.nombre} ${remitente.apellido}` : 'Un usuario';

    await this.notificaciones.crear({
      usuario_guid: dto.destinatario_guid,
      pais: destinatario.pais,
      tipo: 'MENSAJE_NUEVO',
      titulo: `Mensaje de ${nombreRemitente}`,
      mensaje: dto.asunto,
      url_accion: '/dashboard/mensajes',
      ref_tipo: 'mensaje',
      ref_guid: String(mensaje.id),
    });

    this.realtime.emitirAUsuarios(
      'message:new',
      {
        id: mensaje.id,
        remitente_guid: user.sub,
        remitente_nombre: nombreRemitente,
        asunto: mensaje.asunto,
        contenido: mensaje.contenido,
        created_at: mensaje.created_at,
      },
      destinatario.pais,
      [dto.destinatario_guid],
    );

    return mensaje;
  }

  /** Historial con un contacto. */
  async getConversacion(contactoGuid: string, user: JwtPayload) {
    await this.asegurarContactoAceptado(user, contactoGuid);

    const mensajes = await this.prisma.lms_mensajes.findMany({
      where: {
        OR: [
          { remitente_guid: user.sub, destinatario_guid: contactoGuid },
          { remitente_guid: contactoGuid, destinatario_guid: user.sub },
        ],
      },
      orderBy: { created_at: 'asc' },
      take: LIMITE_CONVERSACION,
      select: {
        id: true,
        remitente_guid: true,
        asunto: true,
        contenido: true,
        leido: true,
        created_at: true,
      },
    });

    return mensajes.map((m) => ({ ...m, es_mio: m.remitente_guid === user.sub }));
  }

  async marcarConversacionLeida(contactoGuid: string, user: JwtPayload) {
    const { count } = await this.prisma.lms_mensajes.updateMany({
      where: { remitente_guid: contactoGuid, destinatario_guid: user.sub, leido: false },
      data: { leido: true },
    });
    return { message: `${count} mensaje(s) marcados como leídos.` };
  }

  /** Borra la conversación para ambas partes. */
  async eliminarConversacion(contactoGuid: string, user: JwtPayload) {
    const { count } = await this.prisma.lms_mensajes.deleteMany({
      where: {
        OR: [
          { remitente_guid: user.sub, destinatario_guid: contactoGuid },
          { remitente_guid: contactoGuid, destinatario_guid: user.sub },
        ],
      },
    });
    return { message: `Conversación eliminada (${count} mensaje(s)).` };
  }

  // ── Contactos ────────────────────────────────────────────────────────────

  /**
   * Personas con las que el usuario comparte curso y con las que, por tanto, puede abrir
   * una conversación. La consulta ya está acotada a la sede porque un curso pertenece a
   * una sola sede y sólo se mira entre los cursos del propio usuario.
   */
  async buscarPosiblesContactos(busqueda: string, user: JwtPayload) {
    const cursoGuids = await this.cursosDelUsuario(user);
    if (cursoGuids.length === 0) return [];

    const termino = busqueda.trim();

    const candidatos = await this.prisma.usuarios.findMany({
      where: {
        pais: user.pais,
        activo: true,
        guid: { not: user.sub },
        OR: [
          { matriculas: { some: { curso_guid: { in: cursoGuids }, activa: true } } },
          { cursos_impartidos: { some: { guid: { in: cursoGuids } } } },
        ],
        ...(termino
          ? {
              OR: [
                { nombre: { contains: termino } },
                { apellido: { contains: termino } },
                { email: { contains: termino } },
              ],
            }
          : {}),
      },
      select: { guid: true, nombre: true, apellido: true, email: true, rol: true },
      take: 50,
      orderBy: [{ nombre: 'asc' }],
    });

    const relaciones = await this.prisma.lms_contacto_chat.findMany({
      where: {
        OR: [{ solicitante_guid: user.sub }, { receptor_guid: user.sub }],
      },
      select: { solicitante_guid: true, receptor_guid: true, estado: true },
    });

    const estadoPorContacto = new Map(
      relaciones.map((r) => [r.solicitante_guid === user.sub ? r.receptor_guid : r.solicitante_guid, r.estado]),
    );

    return candidatos.map((candidato) => ({
      ...candidato,
      contacto_estado: estadoPorContacto.get(candidato.guid) ?? null,
      es_examinador: candidato.rol !== 'ESTUDIANTE',
    }));
  }

  /**
   * Pide contacto con alguien de un curso compartido.
   * Escribir a un examinador del curso no necesita aprobación: es la vía por la que un
   * alumno pide ayuda y exigir que el profesor la acepte primero la bloquearía.
   */
  async solicitarContacto(receptorGuid: string, cursoGuid: string, user: JwtPayload) {
    if (receptorGuid === user.sub) {
      throw new BadRequestException('No puedes añadirte a ti mismo como contacto.');
    }

    const curso = await this.prisma.lms_cursos.findFirst({
      where: { guid: cursoGuid, pais: user.pais },
      select: { guid: true, profesor_guid: true },
    });
    if (!curso) throw new NotFoundException('Curso no encontrado.');

    const compartenCurso = await this.compartenCurso(user.sub, receptorGuid, cursoGuid);
    if (!compartenCurso) {
      throw new ForbiddenException('Sólo puedes contactar con personas de un curso que compartáis.');
    }

    const esExaminador = curso.profesor_guid === receptorGuid;
    const estadoInicial = esExaminador ? 'ACEPTADO' : 'PENDIENTE';

    const existente = await this.prisma.lms_contacto_chat.findFirst({
      where: {
        curso_guid: cursoGuid,
        OR: [
          { solicitante_guid: user.sub, receptor_guid: receptorGuid },
          { solicitante_guid: receptorGuid, receptor_guid: user.sub },
        ],
      },
    });

    if (existente) {
      if (existente.estado === 'ACEPTADO') return existente;
      if (existente.estado === 'PENDIENTE') {
        throw new BadRequestException('Ya hay una solicitud pendiente con esta persona.');
      }
      // Una solicitud rechazada puede reintentarse; se reinicia la dirección.
      return this.prisma.lms_contacto_chat.update({
        where: { id: existente.id },
        data: { solicitante_guid: user.sub, receptor_guid: receptorGuid, estado: estadoInicial },
      });
    }

    const contacto = await this.prisma.lms_contacto_chat.create({
      data: {
        solicitante_guid: user.sub,
        receptor_guid: receptorGuid,
        curso_guid: cursoGuid,
        estado: estadoInicial,
      },
    });

    if (!esExaminador) {
      const solicitante = await this.prisma.usuarios.findUnique({
        where: { guid: user.sub },
        select: { nombre: true, apellido: true },
      });
      await this.notificaciones.crear({
        usuario_guid: receptorGuid,
        pais: user.pais,
        tipo: 'MENSAJE_NUEVO',
        titulo: 'Solicitud de conversación',
        mensaje: `${solicitante?.nombre} ${solicitante?.apellido} quiere iniciar una conversación contigo.`,
        url_accion: '/dashboard/mensajes',
      });
    }

    return contacto;
  }

  /** Acepta o rechaza una solicitud recibida. */
  async responderSolicitud(contactoId: number, aceptar: boolean, user: JwtPayload) {
    const contacto = await this.prisma.lms_contacto_chat.findFirst({
      where: { id: contactoId, receptor_guid: user.sub, estado: 'PENDIENTE' },
    });
    if (!contacto) throw new NotFoundException('Solicitud no encontrada.');

    const actualizado = await this.prisma.lms_contacto_chat.update({
      where: { id: contactoId },
      data: { estado: aceptar ? 'ACEPTADO' : 'RECHAZADO' },
    });

    if (aceptar) {
      const receptor = await this.prisma.usuarios.findUnique({
        where: { guid: user.sub },
        select: { nombre: true, apellido: true },
      });
      await this.notificaciones.crear({
        usuario_guid: contacto.solicitante_guid,
        pais: user.pais,
        tipo: 'MENSAJE_NUEVO',
        titulo: 'Solicitud aceptada',
        mensaje: `${receptor?.nombre} ${receptor?.apellido} aceptó tu solicitud. Ya podéis conversar.`,
        url_accion: '/dashboard/mensajes',
      });
    }

    return actualizado;
  }

  /** Solicitudes recibidas pendientes de respuesta. */
  async getSolicitudesPendientes(user: JwtPayload) {
    const solicitudes = await this.prisma.lms_contacto_chat.findMany({
      where: { receptor_guid: user.sub, estado: 'PENDIENTE' },
      orderBy: { created_at: 'desc' },
    });
    if (solicitudes.length === 0) return [];

    const usuarios = await this.prisma.usuarios.findMany({
      where: { guid: { in: solicitudes.map((s) => s.solicitante_guid) } },
      select: { guid: true, nombre: true, apellido: true, email: true, rol: true },
    });
    const porGuid = new Map(usuarios.map((u) => [u.guid, u]));

    return solicitudes.map((solicitud) => ({
      id: solicitud.id,
      curso_guid: solicitud.curso_guid,
      created_at: solicitud.created_at,
      solicitante: porGuid.get(solicitud.solicitante_guid) ?? null,
    }));
  }

  /** Contactos aceptados con su último mensaje y los pendientes de leer. */
  async getContactos(user: JwtPayload) {
    const relaciones = await this.prisma.lms_contacto_chat.findMany({
      where: { estado: 'ACEPTADO', OR: [{ solicitante_guid: user.sub }, { receptor_guid: user.sub }] },
      select: { solicitante_guid: true, receptor_guid: true },
    });

    const guids = [
      ...new Set(relaciones.map((r) => (r.solicitante_guid === user.sub ? r.receptor_guid : r.solicitante_guid))),
    ];
    if (guids.length === 0) return [];

    const [usuarios, mensajes, noLeidos] = await Promise.all([
      this.prisma.usuarios.findMany({
        where: { guid: { in: guids } },
        select: { guid: true, nombre: true, apellido: true, rol: true, foto_url: true },
      }),
      this.prisma.lms_mensajes.findMany({
        where: {
          OR: [
            { remitente_guid: user.sub, destinatario_guid: { in: guids } },
            { remitente_guid: { in: guids }, destinatario_guid: user.sub },
          ],
        },
        orderBy: { created_at: 'desc' },
        select: { remitente_guid: true, destinatario_guid: true, contenido: true, created_at: true },
      }),
      this.prisma.lms_mensajes.groupBy({
        by: ['remitente_guid'],
        where: { remitente_guid: { in: guids }, destinatario_guid: user.sub, leido: false },
        _count: { id: true },
      }),
    ]);

    const sinLeerPor = new Map(noLeidos.map((n) => [n.remitente_guid, n._count.id]));

    // Los mensajes llegan ordenados de más reciente a más antiguo, así que el primero de
    // cada contacto es el último de la conversación.
    const ultimoPor = new Map<string, { contenido: string; created_at: Date }>();
    for (const mensaje of mensajes) {
      const contacto = mensaje.remitente_guid === user.sub ? mensaje.destinatario_guid : mensaje.remitente_guid;
      if (!ultimoPor.has(contacto)) {
        ultimoPor.set(contacto, { contenido: mensaje.contenido, created_at: mensaje.created_at });
      }
    }

    return usuarios
      .map((usuario) => ({
        guid: usuario.guid,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        rol: usuario.rol,
        foto_url: usuario.foto_url,
        ultimo_mensaje: ultimoPor.get(usuario.guid)?.contenido ?? '',
        ultimo_mensaje_fecha: ultimoPor.get(usuario.guid)?.created_at ?? null,
        no_leidos: sinLeerPor.get(usuario.guid) ?? 0,
      }))
      .sort((a, b) => (b.ultimo_mensaje_fecha?.getTime() ?? 0) - (a.ultimo_mensaje_fecha?.getTime() ?? 0));
  }

  // ── Comprobaciones ───────────────────────────────────────────────────────

  /**
   * Exige que exista un contacto aceptado entre ambos.
   * De paso devuelve la sede del destinatario, necesaria para dirigirle los avisos en
   * tiempo real.
   */
  private async asegurarContactoAceptado(user: JwtPayload, otroGuid: string) {
    const destinatario = await this.prisma.usuarios.findFirst({
      where: { guid: otroGuid, pais: user.pais, activo: true },
      select: { guid: true, pais: true },
    });
    if (!destinatario) throw new NotFoundException('Usuario no encontrado.');

    const contacto = await this.prisma.lms_contacto_chat.findFirst({
      where: {
        estado: 'ACEPTADO',
        OR: [
          { solicitante_guid: user.sub, receptor_guid: otroGuid },
          { solicitante_guid: otroGuid, receptor_guid: user.sub },
        ],
      },
      select: { id: true },
    });
    if (!contacto) {
      throw new ForbiddenException('Necesitáis aceptar la solicitud de contacto antes de poder escribiros.');
    }

    return destinatario;
  }

  /** Cursos en los que el usuario participa, como alumno o como responsable. */
  private async cursosDelUsuario(user: JwtPayload): Promise<string[]> {
    const [matriculas, impartidos] = await Promise.all([
      this.prisma.lms_matriculas.findMany({
        where: { usuario_guid: user.sub, activa: true },
        select: { curso_guid: true },
      }),
      this.prisma.lms_cursos.findMany({
        where: { profesor_guid: user.sub, pais: user.pais },
        select: { guid: true },
      }),
    ]);

    return [...new Set([...matriculas.map((m) => m.curso_guid), ...impartidos.map((c) => c.guid)])];
  }

  /** Comprueba que ambas personas participan en el curso indicado. */
  private async compartenCurso(unoGuid: string, otroGuid: string, cursoGuid: string): Promise<boolean> {
    const participantes = await this.prisma.lms_cursos.findFirst({
      where: {
        guid: cursoGuid,
        OR: [
          { profesor_guid: { in: [unoGuid, otroGuid] } },
          { matriculas: { some: { usuario_guid: { in: [unoGuid, otroGuid] }, activa: true } } },
        ],
      },
      select: {
        profesor_guid: true,
        matriculas: {
          where: { usuario_guid: { in: [unoGuid, otroGuid] }, activa: true },
          select: { usuario_guid: true },
        },
      },
    });
    if (!participantes) return false;

    const dentro = new Set([participantes.profesor_guid, ...participantes.matriculas.map((m) => m.usuario_guid)]);
    return dentro.has(unoGuid) && dentro.has(otroGuid);
  }
}
