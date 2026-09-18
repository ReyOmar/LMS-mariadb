import { IsObject } from 'class-validator';

export class SubmitQuizDto {
  /**
   * Mapa `id_pregunta → id_opción` con lo que respondió el alumno.
   * Las preguntas sin responder simplemente no aparecen y cuentan como fallo; enviar un
   * identificador inexistente tampoco suma, porque la corrección compara contra las
   * opciones correctas guardadas en el servidor.
   */
  @IsObject({ message: 'El formato de las respuestas no es válido.' })
  respuestas: Record<string, string>;
}
