import { BadRequestException } from '@nestjs/common';

/**
 * Configuración de un cuestionario.
 *
 * Se guarda serializada en `lms_recursos.quiz_config` y **contiene las respuestas
 * correctas**. Ese detalle es lo que hacía que el sistema de evaluación no sirviera de
 * nada: la API devolvía el curso entero, con esta estructura tal cual, a cualquier usuario
 * autenticado. Un alumno veía las respuestas en la pestaña Red del navegador antes de
 * contestar.
 *
 * Desde aquí se controlan las dos formas de esta estructura:
 *  - `ConfiguracionQuiz`: la completa, sólo para quien edita el curso.
 *  - `ConfiguracionQuizParaAlumno`: sin `es_correcta`, la única que sale hacia un alumno.
 */

export interface OpcionQuiz {
  id: string;
  texto: string;
  es_correcta: boolean;
}

export interface PreguntaQuiz {
  id: string;
  enunciado: string;
  opciones: OpcionQuiz[];
}

export interface ConfiguracionQuiz {
  /** 0 = intentos ilimitados. */
  intentos_permitidos: number;
  /** 0 = sin límite de tiempo. */
  tiempo_minutos: number;
  preguntas: PreguntaQuiz[];
}

export type OpcionParaAlumno = Omit<OpcionQuiz, 'es_correcta'>;
export type PreguntaParaAlumno = Omit<PreguntaQuiz, 'opciones'> & { opciones: OpcionParaAlumno[] };
export type ConfiguracionQuizParaAlumno = Omit<ConfiguracionQuiz, 'preguntas'> & {
  preguntas: PreguntaParaAlumno[];
};

/** Máximos que evitan que un cuestionario mal construido degrade el servicio. */
const MAX_PREGUNTAS = 200;
const MAX_OPCIONES = 10;

/**
 * Interpreta la configuración almacenada.
 *
 * @throws BadRequestException si el JSON está corrupto o no tiene la forma esperada. Antes
 *         un `catch` vacío dejaba pasar `null` y el alumno acababa con un cuestionario de
 *         cero preguntas y nota 0 sin entender por qué.
 */
export function parsearConfiguracionQuiz(crudo: string | null): ConfiguracionQuiz {
  if (!crudo) {
    throw new BadRequestException('Este recurso no tiene un cuestionario configurado.');
  }

  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    throw new BadRequestException(
      'La configuración de este cuestionario está dañada. Avisa al administrador del curso.',
    );
  }

  return validarConfiguracion(datos);
}

/**
 * Valida una configuración recibida del editor de cursos antes de guardarla.
 * Se comprueba aquí y no sólo en el navegador: el editor podría enviarla por otra vía.
 */
export function validarConfiguracionQuiz(crudo: string): ConfiguracionQuiz {
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    throw new BadRequestException('La configuración del cuestionario no es un JSON válido.');
  }
  return validarConfiguracion(datos);
}

function validarConfiguracion(datos: unknown): ConfiguracionQuiz {
  if (!esObjeto(datos)) {
    throw new BadRequestException('La configuración del cuestionario no tiene el formato esperado.');
  }

  const preguntasCrudas = datos.preguntas;
  if (!Array.isArray(preguntasCrudas) || preguntasCrudas.length === 0) {
    throw new BadRequestException('El cuestionario debe tener al menos una pregunta.');
  }
  if (preguntasCrudas.length > MAX_PREGUNTAS) {
    throw new BadRequestException(`Un cuestionario no puede superar las ${MAX_PREGUNTAS} preguntas.`);
  }

  const preguntas = preguntasCrudas.map((pregunta, indice) => validarPregunta(pregunta, indice));

  return {
    intentos_permitidos: enteroNoNegativo(datos.intentos_permitidos),
    tiempo_minutos: enteroNoNegativo(datos.tiempo_minutos),
    preguntas,
  };
}

function validarPregunta(pregunta: unknown, indice: number): PreguntaQuiz {
  const posicion = indice + 1;
  if (!esObjeto(pregunta) || typeof pregunta.id !== 'string' || !pregunta.id) {
    throw new BadRequestException(`La pregunta ${posicion} no tiene identificador.`);
  }
  if (typeof pregunta.enunciado !== 'string' || !pregunta.enunciado.trim()) {
    throw new BadRequestException(`La pregunta ${posicion} no tiene enunciado.`);
  }

  const opcionesCrudas = pregunta.opciones;
  if (!Array.isArray(opcionesCrudas) || opcionesCrudas.length < 2) {
    throw new BadRequestException(`La pregunta ${posicion} debe tener al menos dos opciones.`);
  }
  if (opcionesCrudas.length > MAX_OPCIONES) {
    throw new BadRequestException(`La pregunta ${posicion} no puede tener más de ${MAX_OPCIONES} opciones.`);
  }

  const opciones: OpcionQuiz[] = opcionesCrudas.map((opcion, i) => {
    if (!esObjeto(opcion) || typeof opcion.id !== 'string' || !opcion.id) {
      throw new BadRequestException(`La opción ${i + 1} de la pregunta ${posicion} no tiene identificador.`);
    }
    if (typeof opcion.texto !== 'string' || !opcion.texto.trim()) {
      throw new BadRequestException(`La opción ${i + 1} de la pregunta ${posicion} está vacía.`);
    }
    return { id: opcion.id, texto: opcion.texto, es_correcta: opcion.es_correcta === true };
  });

  const correctas = opciones.filter((o) => o.es_correcta).length;
  if (correctas !== 1) {
    throw new BadRequestException(
      `La pregunta ${posicion} debe tener exactamente una opción correcta (tiene ${correctas}).`,
    );
  }

  return { id: pregunta.id, enunciado: pregunta.enunciado, opciones };
}

/**
 * Versión que puede viajar al navegador de un alumno.
 * Es la única forma admitida de exponer un cuestionario fuera del editor de cursos.
 */
export function sinRespuestas(config: ConfiguracionQuiz): ConfiguracionQuizParaAlumno {
  return {
    intentos_permitidos: config.intentos_permitidos,
    tiempo_minutos: config.tiempo_minutos,
    preguntas: config.preguntas.map((pregunta) => ({
      id: pregunta.id,
      enunciado: pregunta.enunciado,
      opciones: pregunta.opciones.map(({ id, texto }) => ({ id, texto })),
    })),
  };
}

/** Identificador de la opción correcta de cada pregunta. Sólo se usa al calificar. */
export function respuestasCorrectas(config: ConfiguracionQuiz): Map<string, string> {
  const correctas = new Map<string, string>();
  for (const pregunta of config.preguntas) {
    const opcion = pregunta.opciones.find((o) => o.es_correcta);
    if (opcion) correctas.set(pregunta.id, opcion.id);
  }
  return correctas;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function enteroNoNegativo(valor: unknown): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 ? numero : 0;
}
