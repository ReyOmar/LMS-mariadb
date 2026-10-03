import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Country } from '../common/domain/country';
import { encodeCursor, rowsPerPage, decodeCursor } from '../common/domain/pagination';
import { hashPassword, passwordMatches, validateStrength } from '../common/domain/password';
import { CreateUserDto } from './dto/create-user.dto';
import { ListAccountsDto } from './dto/list-accounts.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { searchTerm } from '../common/domain/search';
import { UserRole } from '../common/interfaces/jwt-payload.interface';
import { SettingsService } from '../settings/settings.service';

/** Campos que se devuelven al listar o consultar una cuenta. Nunca incluyen el hash. */
const PUBLIC_FIELDS = {
  guid: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  country: true,
  createdAt: true,
  updatedAt: true,
  lastAccessAt: true,
  usesDefaultPassword: true,
  photoUrl: true,
} as const;

/** Una foto de perfil se enseña en todas las pantallas: no hace falta más. */
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

/**
 * Gestión de cuentas ya creadas: listado, perfil, foto, alta directa y baja.
 * Todas las operaciones están acotadas a una sede: el `country` que reciben procede siempre
 * de la sesión, nunca del cliente.
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
  ) {}

  // ── Consulta ─────────────────────────────────────────────────────────────

  /**
   * Cuentas de la sede, por página y filtradas en el servidor.
   *
   * La página avanza con una marca de la última cuenta entregada, no con un número de
   * filas a saltar: saltando, la base lee y descarta todo lo anterior y cada página cuesta
   * más que la previa. Ver `common/domain/pagination`.
   *
   * Los recuentos sólo se calculan en la primera página —recorren la sede entera— y la
   * pantalla los conserva mientras trae el resto.
   */
  async getUsers(country: Country, filter: ListAccountsDto = {}) {
    const take = rowsPerPage(filter.limit);
    const search = searchTerm(filter.search);
    const cursor = decodeCursor(filter.cursor);

    const matchFilter: Prisma.UserWhereInput = {
      country,
      ...(filter.role ? { role: filter.role } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };

    // La marca va dentro de un `AND`: escrita como otro `OR` al mismo nivel pisaría al de
    // la búsqueda y el listado dejaría de filtrar por texto.
    const pageWhere: Prisma.UserWhereInput = cursor
      ? {
          AND: [
            matchFilter,
            { OR: [{ createdAt: { lt: cursor.date } }, { createdAt: cursor.date, guid: { lt: cursor.id } }] },
          ],
        }
      : matchFilter;

    const [rows, summary] = await Promise.all([
      this.prisma.user.findMany({
        where: pageWhere,
        // El identificador desempata: sin él, dos altas del mismo milisegundo podrían
        // repetirse o perderse al pasar de página.
        orderBy: [{ createdAt: 'desc' }, { guid: 'desc' }],
        take: take + 1, // uno de más: así se sabe si queda algo sin pedir otra página
        select: PUBLIC_FIELDS,
      }),
      cursor ? Promise.resolve(null) : this.summarizeAccounts(matchFilter, filter.role),
    ]);

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const last = page[page.length - 1];
    const counts = await this.pageCounts(page.map((user) => user.guid));

    return {
      ...(summary ?? {}),
      cursor: hasMore && last ? encodeCursor(last.createdAt, last.guid) : null,
      users: page.map((user) => ({
        ...user,
        taughtCourses: counts.taughtCourses.get(user.guid) ?? 0,
        enrollments: counts.enrollments.get(user.guid) ?? 0,
      })),
    };
  }

  /**
   * Cursos a cargo y matrículas de las cuentas de la página, y sólo de ellas.
   *
   * Pedidos como `_count` dentro del listado, Prisma los resuelve agrupando las tablas
   * enteras de cursos y matrículas en cada página: con cinco años de alumnos, la página de
   * estudiantes pasa de 3 ms a más de 400. Así cada recuento recorre el índice por
   * persona, con como mucho una página de claves.
   */
  private async pageCounts(guids: string[]) {
    if (guids.length === 0) {
      return { taughtCourses: new Map<string, number>(), enrollments: new Map<string, number>() };
    }

    const [courses, enrollments] = await Promise.all([
      this.prisma.course.groupBy({
        by: ['teacherGuid'],
        where: { teacherGuid: { in: guids } },
        _count: { _all: true },
      }),
      this.prisma.enrollment.groupBy({ by: ['userGuid'], where: { userGuid: { in: guids } }, _count: { _all: true } }),
    ]);

    return {
      taughtCourses: new Map(courses.map((row) => [row.teacherGuid, row._count._all])),
      enrollments: new Map(enrollments.map((row) => [row.userGuid, row._count._all])),
    };
  }

  /**
   * Cuántas cuentas hay en cada pestaña y cuántas coinciden en total.
   * El total sale de las pestañas —la del rol elegido o la suma de todas—, sin volver a
   * contar la sede.
   */
  private async summarizeAccounts(matchFilter: Prisma.UserWhereInput, role?: UserRole) {
    // Las pestañas cuentan sobre la búsqueda pero no sobre el rol elegido: si no, la
    // pestaña activa sería la única con número.
    const { role: _role, ...withoutRole } = matchFilter;

    const groups = await this.prisma.user.groupBy({ by: ['role'], where: withoutRole, _count: { _all: true } });
    const byRole: Record<UserRole, number> = {
      ADMIN: groups.find((g) => g.role === 'ADMIN')?._count._all ?? 0,
      TEACHER: groups.find((g) => g.role === 'TEACHER')?._count._all ?? 0,
      STUDENT: groups.find((g) => g.role === 'STUDENT')?._count._all ?? 0,
    };

    return { total: role ? byRole[role] : byRole.ADMIN + byRole.TEACHER + byRole.STUDENT, byRole };
  }

  /** Perfil de una cuenta concreta de la sede. */
  async getUserProfile(guid: string, country: Country) {
    const user = await this.prisma.user.findFirst({
      where: { guid, country },
      select: { ...PUBLIC_FIELDS, dataConsentVersion: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const { dataConsentVersion, ...profile } = user;
    return { ...profile, consentRequired: dataConsentVersion !== (await this.settings.legalVersion(country)) };
  }

  /**
   * Registra que la persona acepta la política de datos vigente de su sede. La fecha y la
   * versión quedan como prueba de la autorización.
   */
  async acceptDataPolicy(guid: string, country: Country) {
    await this.prisma.user.update({
      where: { guid },
      data: { dataConsentAt: new Date(), dataConsentVersion: await this.settings.legalVersion(country) },
    });
    return { consentRequired: false };
  }

  /** Solicitudes de acceso de la sede que esperan revisión. */
  async countPendingRequests(country: Country) {
    const count = await this.prisma.accessRequest.count({ where: { status: 'PENDING', country } });
    return { count };
  }

  // ── Alta ─────────────────────────────────────────────────────────────────

  /**
   * Crea una cuenta directamente, sin pasar por la solicitud de acceso.
   * Hereda la sede del administrador que la crea: no hay forma de dar de alta a alguien
   * en la otra sede.
   */
  async createUser(dto: CreateUserDto, country: Country) {
    validateStrength(dto.temporaryPassword);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { guid: true } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo electrónico.');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        country,
        password: await hashPassword(dto.temporaryPassword),
        usesDefaultPassword: true,
      },
      select: PUBLIC_FIELDS,
    });

    this.realtime.emitToRole('user:created', { guid: user.guid }, country, 'ADMIN');
    this.logger.log(`Cuenta creada por un administrador: ${dto.email} (${dto.role}, ${country})`);

    return {
      message: `Cuenta de ${dto.firstName} ${dto.lastName} creada con contraseña temporal.`,
      user,
    };
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  /**
   * Cierra la sesión indicada: sin sesión vigente, su token deja de valer.
   * El borrado se condiciona al `jti` para que un cierre tardío de una sesión ya desplazada
   * no eche al dispositivo que entró después.
   */
  async logout(guid: string, jti: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { guid, currentSessionJti: jti },
      data: { currentSessionJti: null },
    });
  }

  // ── Perfil propio ────────────────────────────────────────────────────────

  /**
   * Actualiza nombre, apellido y contraseña del propio usuario.
   * Cambiar la contraseña cierra todas sus sesiones, también la actual, que el cliente
   * vuelve a abrir con la clave nueva: si alguien tenía la cuenta comprometida, queda fuera.
   */
  async updateProfile(guid: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { guid }, select: { password: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;

    const { newPassword } = dto;
    if (newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Escribe tu contraseña actual para poder cambiarla.');
      }
      if (!(await passwordMatches(dto.currentPassword, user.password))) {
        throw new BadRequestException('La contraseña actual no es correcta.');
      }
      validateStrength(newPassword);
      data.password = await hashPassword(newPassword);
      data.usesDefaultPassword = false;
      data.currentSessionJti = null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No hay ningún cambio que guardar.');
    }

    const updated = await this.prisma.user.update({ where: { guid }, data, select: PUBLIC_FIELDS });

    if (newPassword) this.realtime.revokeSession(guid, 'password_changed');

    this.realtime.emitToRole('user:updated', { guid }, updated.country, 'ADMIN');

    return { message: 'Perfil actualizado correctamente.', user: updated };
  }

  // ── Foto de perfil ───────────────────────────────────────────────────────

  /** Sustituye la foto de perfil y borra la anterior del almacenamiento. */
  async uploadProfilePhoto(guid: string, filePath: string, originalName: string) {
    const user = await this.prisma.user.findUnique({
      where: { guid },
      select: { photoUrl: true, country: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    // Se sube antes de borrar la anterior: si la subida falla, el usuario conserva su foto.
    const key = await this.storage.uploadFromDisk(filePath, originalName, 'avatars', MAX_PHOTO_SIZE);

    try {
      await this.prisma.user.update({ where: { guid }, data: { photoUrl: key } });
    } catch (error) {
      // Sin fila que la referencie, la foto nueva sería un archivo huérfano.
      await this.storage.deleteFiles([key]);
      throw error;
    }

    if (user.photoUrl) {
      await this.storage
        .deleteFile(user.photoUrl)
        .catch((error) => this.logger.warn(`No se pudo borrar la foto anterior ${user.photoUrl}`, error));
    }

    this.realtime.emitToUsers('user:updated', { guid }, user.country, [guid]);
    return { message: 'Foto de perfil actualizada.', photoUrl: key };
  }

  /** Elimina la foto de perfil. */
  async deleteProfilePhoto(guid: string) {
    const user = await this.prisma.user.findUnique({
      where: { guid },
      select: { photoUrl: true, country: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!user.photoUrl) throw new BadRequestException('No tienes foto de perfil.');

    await this.prisma.user.update({ where: { guid }, data: { photoUrl: null } });
    await this.storage
      .deleteFile(user.photoUrl)
      .catch((error) => this.logger.warn(`No se pudo borrar la foto ${user.photoUrl}`, error));

    this.realtime.emitToUsers('user:updated', { guid }, user.country, [guid]);
    return { message: 'Foto de perfil eliminada.' };
  }

  // ── Baja ─────────────────────────────────────────────────────────────────

  /**
   * Borra una cuenta y todo lo que cuelga de ella.
   *
   * Un profesor con cursos asignados no se puede borrar sin decir a quién pasan: la relación
   * es `Restrict` para que la cascada no se lleve los cursos con sus módulos, recursos,
   * matrículas y entregas.
   *
   * @param courseTargetGuid Profesor o administrador que hereda los cursos. Obligatorio
   *        si la cuenta tiene cursos asignados.
   */
  async deleteUser(guid: string, country: Country, adminGuid: string, courseTargetGuid?: string) {
    if (guid === adminGuid) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta.');
    }

    const user = await this.prisma.user.findFirst({
      where: { guid, country },
      select: {
        guid: true,
        email: true,
        role: true,
        photoUrl: true,
        signatureUrl: true,
        _count: { select: { taughtCourses: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const courses = user._count.taughtCourses;
    if (courses > 0) {
      await this.checkCourseTransferTarget(guid, courses, country, courseTargetGuid);
    }

    // Los certificados y las entregas guardan archivos en el almacenamiento; se recogen
    // antes de borrar las filas para no dejar archivos sin dueño.
    const [certificates, submissions] = await Promise.all([
      this.prisma.certificate.findMany({ where: { userGuid: guid }, select: { pdfKey: true } }),
      this.prisma.submission.findMany({
        where: { userGuid: guid, attachmentKey: { not: null } },
        select: { attachmentKey: true },
      }),
    ]);

    // Sus secretos pendientes se van con él. Un enlace de recuperación se resuelve por
    // correo, así que si la cuenta se borra y alguien registra ese mismo correo, un enlace
    // antiguo todavía vigente serviría para entrar en la cuenta nueva.
    //
    // Todo va en una transacción, traspaso de cursos incluido: si el borrado fallara, los
    // cursos no pueden haber cambiado ya de dueño.
    await this.prisma.$transaction([
      ...(courses > 0
        ? [
            this.prisma.course.updateMany({
              where: { teacherGuid: guid },
              data: { teacherGuid: courseTargetGuid! },
            }),
          ]
        : []),
      this.prisma.passwordReset.deleteMany({ where: { email: user.email } }),
      this.prisma.emailVerification.deleteMany({ where: { email: user.email } }),
      // El resto de lo suyo —matrículas, entregas, progreso, certificados, mensajes,
      // contactos, notificaciones y métricas— cae por las relaciones en cascada. Lo que
      // creó como examinador no: sus cursos acaban de pasar a otra cuenta.
      this.prisma.user.delete({ where: { guid } }),
    ]);

    if (courses > 0) this.logger.log(`Traspasados ${courses} curso(s) de ${guid} a ${courseTargetGuid}`);

    this.realtime.revokeSession(guid, 'account_deleted');
    this.realtime.emitToRole('user:deleted', { guid }, country, 'ADMIN');

    void this.storage.deleteFiles([
      user.photoUrl,
      user.signatureUrl,
      ...certificates.map((certificate) => certificate.pdfKey),
      ...submissions.map((submission) => submission.attachmentKey),
    ]);

    return { message: 'Cuenta eliminada correctamente.', deletedGuid: guid };
  }

  /** Comprueba que los cursos de una cuenta que se va a borrar tienen a quién pasar. */
  private async checkCourseTransferTarget(
    guid: string,
    count: number,
    country: Country,
    targetGuid: string | undefined,
  ): Promise<void> {
    if (!targetGuid) {
      throw new BadRequestException(
        `Esta cuenta tiene ${count} curso(s) asignado(s). Indica a qué profesor o administrador deben pasar antes de eliminarla.`,
      );
    }
    if (targetGuid === guid) {
      throw new BadRequestException('El destino de los cursos debe ser una cuenta distinta.');
    }

    const target = await this.prisma.user.findFirst({
      where: { guid: targetGuid, country, role: { in: ['ADMIN', 'TEACHER'] } },
      select: { guid: true },
    });
    if (!target) {
      throw new BadRequestException('El destino de los cursos debe ser un profesor o administrador de la misma sede.');
    }
  }

  /** Candidatos válidos para heredar los cursos de una cuenta que se va a eliminar. */
  getPossibleCourseTransferTargets(country: Country, excludeGuid: string) {
    return this.prisma.user.findMany({
      where: { country, role: { in: ['ADMIN', 'TEACHER'] }, guid: { not: excludeGuid } },
      select: { guid: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: { firstName: 'asc' },
    });
  }
}
