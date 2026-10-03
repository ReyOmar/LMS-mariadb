import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class EnrollStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el estudiante que quieres matricular.' })
  userGuid: string;
}

export class EnrolledStudentsQueryDto {
  /** Marca de la última fila recibida. Se devuelve tal cual llegó en la página anterior. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class CandidatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
