import { IsNotEmpty, IsString } from 'class-validator';

export class MatricularEstudianteDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el estudiante que quieres matricular.' })
  usuario_guid: string;
}
