import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Pais } from '../common/domain/pais';
import { cifrar, coincide, validarFortaleza } from '../common/domain/password';
import { RolUsuario } from '../common/interfaces/jwt-payload.interface';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Campos que se devuelven al listar o consultar una cuenta. Nunca incluyen el hash. */
const CAMPOS_PUBLICOS = {
  guid: true,
  email: true,
  nombre: true,
  apellido: true,
  rol: true,
  pais: true,
  activo: true,
  created_at: true,
  updated_at: true,
  ultimo_acceso: true,
  usa_clave_defecto: true,
  foto_url: true,
} as const;

/**
 * Gestión de cuentas ya creadas: listado, perfil, foto, alta directa y baja.
 * Todas las operaciones están acotadas a una sede: el `pais` que reciben procede siempre
 * de la sesión del administrador, nunca del cliente.
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── Consulta ─────────────────────────────────────────────────────────────

  /** Cuentas de la sede, con el recuento de cursos y matrículas que impide borrarlas sin más. */
  async getAllUsers(pais: Pais) {
    const usuarios = await this.prisma.usuarios.findMany({
      where: { pais },
      orderBy: { created_at: 'desc' },
      select: {
        ...CAMPOS_PUBLICOS,
        _count: { select: { cursos_impartidos: true, matriculas: true } },
      },
    });

    return usuarios.map(({ _count, ...usuario }) => ({
      ...usuario,
      cursos_impartidos: _count.cursos_impartidos,
      matriculas: _count.matriculas,
    }));
  }

  /** Perfil de una cuenta concreta de la sede. */
  async getUserProfile(guid: string, pais: Pais) {
    const usuario = await this.prisma.usuarios.findFirst({
      where: { guid, pais },
      select: CAMPOS_PUBLICOS,
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    return usuario;
  }

  /** Resumen de solicitudes aceptadas en la sede, para el panel de administración. */
  async getAdminStats(pais: Pais) {
    const [cuentasAprobadas, solicitudesPendientes] = await Promise.all([
      this.prisma.lms_solicitudes_acceso.count({ where: { estado: 'ACEPTADA', pais } }),
      this.prisma.lms_solicitudes_acceso.count({ where: { estado: 'PENDIENTE', pais } }),
    ]);
    return { cuentasAprobadas, solicitudesPendientes };
  }

  // ── Alta ─────────────────────────────────────────────────────────────────

  /**
   * Crea una cuenta directamente, sin pasar por la solicitud de acceso.
   * Hereda la sede del administrador que la crea: no hay forma de dar de alta a alguien
   * en la otra sede.
   */
  async createUser(dto: CrearUsuarioDto, pais: Pais) {
    validarFortaleza(dto.contrasena_temporal);

    const existente = await this.prisma.usuarios.findUnique({ where: { email: dto.email }, select: { guid: true } });
    if (existente) {
      throw new ConflictException('Ya existe una cuenta con ese correo electrónico.');
    }

    const usuario = await this.prisma.usuarios.create({
      data: {
        email: dto.email,
        nombre: dto.nombre,
        apellido: dto.apellido,
        rol: dto.rol,
        pais,
        contrasena: await cifrar(dto.contrasena_temporal),
        usa_clave_defecto: true,
      },
      select: CAMPOS_PUBLICOS,
    });

    this.realtime.emitirARol('user:created', { guid: usuario.guid }, pais, 'ADMINISTRADOR');
    this.logger.log(`Cuenta creada por un administrador: ${dto.email} (${dto.rol}, ${pais})`);

    return {
      message: `Cuenta de ${dto.nombre} ${dto.apellido} creada con contraseña temporal.`,
      user: usuario,
    };
  }

  // ── Perfil propio ────────────────────────────────────────────────────────

  /**
   * Actualiza nombre, apellido y contraseña del propio usuario.
   * Cambiar la contraseña revoca todas sus sesiones salvo aquella desde la que se cambió,
   * que se renueva en el cliente: si alguien tenía la cuenta comprometida, queda fuera.
   */
  async updateProfile(guid: string, dto: UpdateProfileDto) {
    const usuario = await this.prisma.usuarios.findUnique({ where: { guid } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    const datos: { nombre?: string; apellido?: string; contrasena?: string; usa_clave_defecto?: boolean } = {};
    if (dto.nombre !== undefined) datos.nombre = dto.nombre;
    if (dto.apellido !== undefined) datos.apellido = dto.apellido;

    const cambiaContrasena = Boolean(dto.nueva_contrasena);
    if (cambiaContrasena) {
      if (!dto.contrasena_actual) {
        throw new BadRequestException('Escribe tu contraseña actual para poder cambiarla.');
      }
      if (!(await coincide(dto.contrasena_actual, usuario.contrasena))) {
        throw new BadRequestException('La contraseña actual no es correcta.');
      }
      validarFortaleza(dto.nueva_contrasena!);
      datos.contrasena = await cifrar(dto.nueva_contrasena!);
      datos.usa_clave_defecto = false;
    }

    if (Object.keys(datos).length === 0) {
      throw new BadRequestException('No hay ningún cambio que guardar.');
    }

    const actualizado = await this.prisma.usuarios.update({
      where: { guid },
      data: datos,
      select: CAMPOS_PUBLICOS,
    });

    if (cambiaContrasena) {
      await this.tokenBlacklist.revocarUsuario(guid);
      this.realtime.revocarSesion(guid, 'password_changed');
    }

    this.realtime.emitirARol('user:updated', { guid }, actualizado.pais, 'ADMINISTRADOR');

    return { message: 'Perfil actualizado correctamente.', user: actualizado };
  }

  // ── Foto de perfil ───────────────────────────────────────────────────────

  /** Sustituye la foto de perfil y borra la anterior del almacenamiento. */
  async uploadProfilePhoto(guid: string, contenido: Buffer, nombreOriginal: string) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { guid },
      select: { foto_url: true, pais: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    // Se sube antes de borrar la anterior: si la subida falla, el usuario conserva su foto.
    const clave = await this.storage.uploadFromBuffer(contenido, nombreOriginal, 'avatars');

    await this.prisma.usuarios.update({ where: { guid }, data: { foto_url: clave } });

    if (usuario.foto_url) {
      await this.storage
        .deleteFile(usuario.foto_url)
        .catch((error) => this.logger.warn(`No se pudo borrar la foto anterior ${usuario.foto_url}`, error));
    }

    this.realtime.emitirAUsuarios('user:updated', { guid }, usuario.pais, [guid]);
    return { message: 'Foto de perfil actualizada.', foto_url: clave };
  }

  /** Elimina la foto de perfil. */
  async deleteProfilePhoto(guid: string) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { guid },
      select: { foto_url: true, pais: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (!usuario.foto_url) throw new BadRequestException('No tienes foto de perfil.');

    await this.prisma.usuarios.update({ where: { guid }, data: { foto_url: null } });
    await this.storage
      .deleteFile(usuario.foto_url)
      .catch((error) => this.logger.warn(`No se pudo borrar la foto ${usuario.foto_url}`, error));

    this.realtime.emitirAUsuarios('user:updated', { guid }, usuario.pais, [guid]);
    return { message: 'Foto de perfil eliminada.' };
  }

  // ── Baja ─────────────────────────────────────────────────────────────────

  /**
   * Desactiva una cuenta sin borrar su historial.
   *
   * Es la operación recomendada frente al borrado: conserva entregas, calificaciones y
   * certificados —que son el registro documental de la capacitación— pero impide el
   * acceso de inmediato.
   */
  async setUserActive(guid: string, activo: boolean, pais: Pais, adminGuid: string) {
    if (guid === adminGuid && !activo) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta.');
    }

    const usuario = await this.prisma.usuarios.findFirst({ where: { guid, pais }, select: { guid: true } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    await this.prisma.usuarios.update({ where: { guid }, data: { activo } });

    if (!activo) {
      await this.tokenBlacklist.revocarUsuario(guid);
      this.realtime.revocarSesion(guid, 'account_disabled');
    }

    this.realtime.emitirARol('user:updated', { guid, activo }, pais, 'ADMINISTRADOR');
    return { message: activo ? 'Cuenta reactivada.' : 'Cuenta desactivada.' };
  }

  /**
   * Borra una cuenta y todo lo que cuelga de ella.
   *
   * Un profesor con cursos asignados no se puede borrar sin decir a quién pasan: antes se
   * buscaba «algún administrador» y, si no había ninguno, se seguía adelante y la cascada
   * de la base de datos se llevaba por delante los cursos con sus módulos, recursos,
   * matrículas y entregas. Ahora la relación es `Restrict` y el traspaso es explícito.
   *
   * @param destinoCursosGuid Profesor o administrador que hereda los cursos. Obligatorio
   *        si la cuenta tiene cursos asignados.
   */
  async deleteUser(guid: string, pais: Pais, adminGuid: string, destinoCursosGuid?: string) {
    if (guid === adminGuid) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta.');
    }

    const usuario = await this.prisma.usuarios.findFirst({
      where: { guid, pais },
      select: { guid: true, rol: true, foto_url: true, firma_url: true, _count: { select: { cursos_impartidos: true } } },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    if (usuario._count.cursos_impartidos > 0) {
      await this.traspasarCursos(guid, usuario._count.cursos_impartidos, pais, destinoCursosGuid);
    }

    // Los certificados guardan el PDF en el almacenamiento; se recogen antes de borrar
    // las filas para no dejar archivos sin dueño.
    const certificados = await this.prisma.lms_certificados.findMany({
      where: { usuario_guid: guid },
      select: { archivo_pdf: true },
    });
    const entregas = await this.prisma.lms_entregas.findMany({
      where: { usuario_guid: guid, url_archivo_adjunto: { not: null } },
      select: { url_archivo_adjunto: true },
    });

    // Las relaciones con `onDelete: Cascade` las resuelve la base de datos; basta con
    // borrar la fila del usuario dentro de una transacción.
    await this.prisma.usuarios.delete({ where: { guid } });

    await this.tokenBlacklist.revocarUsuario(guid);
    this.realtime.revocarSesion(guid, 'account_deleted');
    this.realtime.emitirARol('user:deleted', { guid }, pais, 'ADMINISTRADOR');

    void this.limpiarArchivos([
      usuario.foto_url,
      usuario.firma_url,
      ...certificados.map((c) => c.archivo_pdf),
      ...entregas.map((e) => e.url_archivo_adjunto),
    ]);

    return { message: 'Cuenta eliminada correctamente.', deletedGuid: guid };
  }

  /** Reasigna los cursos de una cuenta que se va a borrar. */
  private async traspasarCursos(
    guid: string,
    cuantos: number,
    pais: Pais,
    destinoGuid: string | undefined,
  ): Promise<void> {
    if (!destinoGuid) {
      throw new BadRequestException(
        `Esta cuenta tiene ${cuantos} curso(s) asignado(s). Indica a qué profesor o administrador deben pasar antes de eliminarla.`,
      );
    }
    if (destinoGuid === guid) {
      throw new BadRequestException('El destino de los cursos debe ser una cuenta distinta.');
    }

    const destino = await this.prisma.usuarios.findFirst({
      where: { guid: destinoGuid, pais, activo: true, rol: { in: ['ADMINISTRADOR', 'PROFESOR'] } },
      select: { guid: true },
    });
    if (!destino) {
      throw new BadRequestException(
        'El destino de los cursos debe ser un profesor o administrador activo de la misma sede.',
      );
    }

    await this.prisma.lms_cursos.updateMany({
      where: { profesor_guid: guid },
      data: { profesor_guid: destinoGuid },
    });
    this.logger.log(`Traspasados ${cuantos} curso(s) de ${guid} a ${destinoGuid}`);
  }

  /** Borra archivos sueltos sin interrumpir la operación principal si alguno falla. */
  private async limpiarArchivos(claves: (string | null)[]): Promise<void> {
    for (const clave of claves) {
      if (!clave) continue;
      await this.storage
        .deleteFile(clave)
        .catch((error) => this.logger.warn(`No se pudo borrar el archivo ${clave}`, error));
    }
  }

  /** Candidatos válidos para heredar los cursos de una cuenta que se va a eliminar. */
  getPosiblesDestinosDeCursos(pais: Pais, excluirGuid: string) {
    return this.prisma.usuarios.findMany({
      where: { pais, activo: true, rol: { in: ['ADMINISTRADOR', 'PROFESOR'] }, guid: { not: excluirGuid } },
      select: { guid: true, nombre: true, apellido: true, email: true, rol: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /** Usuarios de la sede con un rol concreto. Base de los selectores del panel. */
  getUsuariosPorRol(pais: Pais, rol: RolUsuario) {
    return this.prisma.usuarios.findMany({
      where: { pais, rol, activo: true },
      select: { guid: true, nombre: true, apellido: true, email: true },
      orderBy: [{ nombre: 'asc' }, { apellido: 'asc' }],
    });
  }
}
