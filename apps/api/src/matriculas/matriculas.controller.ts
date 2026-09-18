import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { MatriculasService } from './matriculas.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { MatricularEstudianteDto } from './dto/matricular.dto';

@Controller('matriculas')
export class MatriculasController {
  constructor(private readonly matriculas: MatriculasService) {}

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/:curso_guid')
  getMatriculados(@CurrentUser() user: JwtPayload, @Param('curso_guid') cursoGuid: string) {
    return this.matriculas.getMatriculados(cursoGuid, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Get('/:curso_guid/candidatos')
  getCandidatos(@CurrentUser() user: JwtPayload, @Param('curso_guid') cursoGuid: string) {
    return this.matriculas.getCandidatos(cursoGuid, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Post('/:curso_guid')
  matricular(
    @CurrentUser() user: JwtPayload,
    @Param('curso_guid') cursoGuid: string,
    @Body() dto: MatricularEstudianteDto,
  ) {
    return this.matriculas.matricular(cursoGuid, dto.usuario_guid, user);
  }

  @Roles('ADMINISTRADOR', 'PROFESOR')
  @Delete('/:curso_guid/:usuario_guid')
  darDeBaja(
    @CurrentUser() user: JwtPayload,
    @Param('curso_guid') cursoGuid: string,
    @Param('usuario_guid') usuarioGuid: string,
  ) {
    return this.matriculas.darDeBaja(cursoGuid, usuarioGuid, user);
  }
}
