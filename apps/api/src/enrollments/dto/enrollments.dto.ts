import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { StrictBoolean } from '../../common/validation/transforms';
import { Omittable } from '../../common/validation/omittable';

export class EnrollStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el estudiante que quieres matricular.' })
  userGuid: string;

  /** Confirma que quien ya terminó el curso empieza una vuelta nueva desde cero. */
  @Omittable()
  @StrictBoolean()
  @IsBoolean({ message: 'Indica si confirmas que el alumno vuelve a empezar el curso.' })
  confirmRestart?: boolean;
}

export class EnrolledStudentsQueryDto {
  /** Marca de la última fila recibida. Se devuelve tal cual llegó en la página anterior. */
  @Omittable()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class CandidatesQueryDto {
  @Omittable()
  @IsString()
  @MaxLength(100)
  search?: string;
}
