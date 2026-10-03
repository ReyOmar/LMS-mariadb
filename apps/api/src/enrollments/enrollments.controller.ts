import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CandidatesQueryDto, EnrolledStudentsQueryDto, EnrollStudentDto } from './dto/enrollments.dto';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Roles('ADMIN', 'TEACHER')
  @Get('/:courseGuid')
  getEnrolledStudents(
    @CurrentUser() user: JwtPayload,
    @Param('courseGuid') courseGuid: string,
    @Query() query: EnrolledStudentsQueryDto,
  ) {
    return this.enrollments.getEnrolledStudents(courseGuid, user, query.cursor);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('/:courseGuid/candidates')
  getCandidates(
    @CurrentUser() user: JwtPayload,
    @Param('courseGuid') courseGuid: string,
    @Query() query: CandidatesQueryDto,
  ) {
    return this.enrollments.getCandidates(courseGuid, user, query.search);
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('/:courseGuid')
  enroll(@CurrentUser() user: JwtPayload, @Param('courseGuid') courseGuid: string, @Body() dto: EnrollStudentDto) {
    return this.enrollments.enroll(courseGuid, dto.userGuid, user, dto.confirmRestart === true);
  }

  @Roles('ADMIN', 'TEACHER')
  @Delete('/:courseGuid/:userGuid')
  unenroll(
    @CurrentUser() user: JwtPayload,
    @Param('courseGuid') courseGuid: string,
    @Param('userGuid') userGuid: string,
  ) {
    return this.enrollments.unenroll(courseGuid, userGuid, user);
  }
}
