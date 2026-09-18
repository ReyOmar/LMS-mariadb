import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { EsPais } from '../../common/dto/pais.validator';
import { Pais } from '../../common/domain/pais';
import { RolUsuario } from '../../common/interfaces/jwt-payload.interface';

/** Roles que un visitante puede pedir por sí mismo. ADMINISTRADOR sólo lo crea otro admin. */
const ROLES_SOLICITABLES: RolUsuario[] = ['ESTUDIANTE', 'PROFESOR'];

export class SolicitarAccesoDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  apellido: string;

  @IsIn(ROLES_SOLICITABLES, { message: 'Sólo puedes solicitar acceso como estudiante o profesor.' })
  rol_pedido: RolUsuario;

  /** Sede a la que pertenecerá la cuenta. No se puede cambiar después. */
  @EsPais()
  pais: Pais;
}
