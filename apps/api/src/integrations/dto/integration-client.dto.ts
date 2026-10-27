import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validation/transforms';

export class CreateIntegrationClientDto {
  /** Cómo se llama el sistema que se conecta, para reconocerlo en el panel: «Software PESV». */
  @IsString()
  @IsNotEmpty({ message: 'Escribe el nombre del sistema que se conecta.' })
  @MaxLength(100)
  @Trim()
  name: string;
}
