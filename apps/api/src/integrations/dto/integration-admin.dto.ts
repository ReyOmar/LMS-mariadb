import { IsNotEmpty, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { Trim } from '../../common/validation/transforms';

export class CreateIntegrationClientDto {
  /** Cómo se llama el sistema que se conecta, para reconocerlo en el panel: «Software PESV». */
  @IsString()
  @IsNotEmpty({ message: 'Escribe el nombre del sistema que se conecta.' })
  @MaxLength(100)
  @Trim()
  name: string;
}

export class InfractionCourseDto {
  /** El curso de la sede que atiende la infracción. */
  @IsString()
  @IsNotEmpty({ message: 'Elige el curso que atiende la infracción.' })
  courseGuid: string;
}

export class CallbackUrlDto {
  /**
   * Dirección https del otro sistema a la que avisar de los cambios en sus solicitudes, o `null` para
   * dejar de avisarle. Con nombre de dominio: ni direcciones IP ni `localhost`, que apuntarían a la
   * red del propio servidor.
   */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((dto: CallbackUrlDto) => dto.url !== null)
  @IsUrl(
    {
      protocols: ['https'],
      require_protocol: true,
      require_tld: true,
      disallow_auth: true,
      host_blacklist: [/^[\d.]+$/, /:/, /(^|\.)localhost(\.|$)/i],
    },
    { message: 'Escribe una dirección https completa, con nombre de dominio: ni una IP ni localhost.' },
  )
  @MaxLength(500)
  url: string | null;
}
