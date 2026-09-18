import { Injectable, NotFoundException } from '@nestjs/common';
import { lms_tipo_notificacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Pais } from '../common/domain/pais';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

/** Notificaciones que se devuelven por defecto en el centro de avisos. */
const LIMITE_POR_DEFECTO = 30;
const LIMITE_MAXIMO = 100;

/** Datos para crear un aviso en la aplicación. */
export interface NuevaNotificacion {
  usuario_guid: string;
  pais: Pais;
  tipo: lms_tipo_notificacion;
  titulo: string;
  mensaje: string;
  url_accion?: string;
  ref_tipo?: string;
  ref_guid?: string;
}

/**
 * Avisos dentro de la aplicación.
 *
 * Toda lectura y escritura está acotada al destinatario: antes, marcar una notificación
 * como leída se hacía por identificador numérico sin comprobar de quién era, así que
 * cualquier usuario podía marcar las de otro.
 */
@Injectable()
export class NotificacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Crea el aviso y lo empuja en tiempo real a su destinatario. */
  async crear(datos: NuevaNotificacion) {
    const { pais, ...campos } = datos;
    const notificacion = await this.prisma.lms_notificaciones.create({ data: campos });

    this.realtime.emitirAUsuarios(
      'notification:new',
      {
        id: notificacion.id,
        tipo: notificacion.tipo,
        titulo: notificacion.titulo,
        mensaje: notificacion.mensaje,
        url_accion: notificacion.url_accion,
        leida: false,
        created_at: notificacion.created_at,
      },
      pais,
      [datos.usuario_guid],
    );

    return notificacion;
  }

  /** Últimos avisos del usuario en sesión. */
  getDelUsuario(user: JwtPayload, limite = LIMITE_POR_DEFECTO) {
    return this.prisma.lms_notificaciones.findMany({
      where: { usuario_guid: user.sub },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(limite, 1), LIMITE_MAXIMO),
    });
  }

  async contarNoLeidas(user: JwtPayload) {
    const total = await this.prisma.lms_notificaciones.count({
      where: { usuario_guid: user.sub, leida: false },
    });
    return { total };
  }

  /**
   * Marca un aviso como leído.
   * El filtro incluye al usuario, de modo que un identificador ajeno no encuentra nada en
   * lugar de modificar el aviso de otra persona.
   */
  async marcarLeida(id: number, user: JwtPayload) {
    const actualizadas = await this.prisma.lms_notificaciones.updateMany({
      where: { id, usuario_guid: user.sub },
      data: { leida: true },
    });
    if (actualizadas.count === 0) throw new NotFoundException('Notificación no encontrada.');
    return { message: 'Notificación marcada como leída.' };
  }

  async marcarTodasLeidas(user: JwtPayload) {
    const { count } = await this.prisma.lms_notificaciones.updateMany({
      where: { usuario_guid: user.sub, leida: false },
      data: { leida: true },
    });
    return { message: `${count} notificación(es) marcadas como leídas.` };
  }

  async limpiar(user: JwtPayload) {
    const { count } = await this.prisma.lms_notificaciones.deleteMany({ where: { usuario_guid: user.sub } });
    return { message: `${count} notificación(es) eliminadas.` };
  }
}
