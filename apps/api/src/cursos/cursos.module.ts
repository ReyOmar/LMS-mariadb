import { Module } from '@nestjs/common';
import { CursosController } from './cursos.controller';
import { CursosService } from './cursos.service';
import { BloqueService } from './bloque.service';
import { QuizService } from './quiz.service';
import { CursoAccesoService } from './curso-acceso.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [CursosController],
  providers: [CursosService, BloqueService, QuizService, CursoAccesoService],
  // `CursoAccesoService` lo usan evaluaciones, estudiantes, certificados y dashboards
  // para no repetir las comprobaciones de sede, propiedad y matrícula.
  exports: [CursoAccesoService, QuizService],
})
export class CursosModule {}
