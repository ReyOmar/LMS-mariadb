import { IsNotEmpty, IsString } from 'class-validator';

export class EmitirCertificadoDto {
  @IsString()
  @IsNotEmpty({ message: 'Indica el curso del que quieres obtener el certificado.' })
  curso_guid: string;
}
