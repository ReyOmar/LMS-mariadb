import { BadRequestException, Controller, Delete, Get, Header, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BeforeConsent } from '../common/decorators/before-consent.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessService } from '../courses/course-access.service';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  /**
   * Lo que ha pasado desde `after` y le toca a quien pregunta (ver `RealtimeService`). Cada
   * pestaña pregunta cada pocos segundos, así que no cuenta para el límite de peticiones; y
   * también mientras se decide sobre la política de datos, que es cuando puede cambiar.
   */
  @SkipThrottle()
  @BeforeConsent()
  @Get('events')
  @Header('Cache-Control', 'no-store')
  events(@CurrentUser() user: JwtPayload, @Query('after', new ParseIntPipe({ optional: true })) after?: number) {
    return this.realtime.poll(user, after ?? null);
  }

  /**
   * Toma el aviso de "curso en edición" para que otro editor no lo abra en paralelo. Sólo
   * sobre un curso que quien lo pide puede editar: de su sede y, si es profesor, suyo.
   */
  @Roles('ADMIN', 'TEACHER')
  @Post('courses/:courseGuid/lock')
  async acquireLock(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string) {
    const course = await this.access.managedCourse(courseGuid, user);

    const profile = await this.prisma.user.findUnique({
      where: { guid: user.sub },
      select: { firstName: true, lastName: true },
    });
    if (!profile) throw new BadRequestException('Sesión no válida.');

    const editor = this.realtime.acquireCourseEdit(courseGuid, course.teacherGuid, {
      guid: user.sub,
      name: `${profile.firstName} ${profile.lastName}`,
      role: user.role,
      country: user.country,
    });

    return { editor, isMine: editor.guid === user.sub };
  }

  /** Libera el aviso de edición. Sólo surte efecto si lo tenía quien lo pide. */
  @Roles('ADMIN', 'TEACHER')
  @Delete('courses/:courseGuid/lock')
  releaseLock(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string) {
    this.realtime.releaseCourseLock(courseGuid, user.sub);
    return { released: true };
  }
}
