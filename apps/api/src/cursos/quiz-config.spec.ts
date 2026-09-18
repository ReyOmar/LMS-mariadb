import { BadRequestException } from '@nestjs/common';
import {
  ConfiguracionQuiz,
  parsearConfiguracionQuiz,
  respuestasCorrectas,
  sinRespuestas,
  validarConfiguracionQuiz,
} from './quiz-config';

const CONFIG_VALIDA: ConfiguracionQuiz = {
  intentos_permitidos: 2,
  tiempo_minutos: 15,
  preguntas: [
    {
      id: 'p1',
      enunciado: '¿Velocidad máxima en zona escolar?',
      opciones: [
        { id: 'a', texto: '30 km/h', es_correcta: true },
        { id: 'b', texto: '60 km/h', es_correcta: false },
      ],
    },
    {
      id: 'p2',
      enunciado: '¿Qué hacer ante un semáforo en ámbar?',
      opciones: [
        { id: 'a', texto: 'Acelerar', es_correcta: false },
        { id: 'b', texto: 'Detenerse si es seguro', es_correcta: true },
      ],
    },
  ],
};

const serializada = JSON.stringify(CONFIG_VALIDA);

describe('configuración de cuestionarios', () => {
  describe('sinRespuestas', () => {
    it('elimina es_correcta de todas las opciones', () => {
      const paraAlumno = sinRespuestas(CONFIG_VALIDA);

      for (const pregunta of paraAlumno.preguntas) {
        for (const opcion of pregunta.opciones) {
          expect(opcion).not.toHaveProperty('es_correcta');
        }
      }
    });

    it('no deja rastro de la respuesta correcta al serializar', () => {
      // Es la comprobación que importa: lo que viaja al navegador es el JSON.
      expect(JSON.stringify(sinRespuestas(CONFIG_VALIDA))).not.toContain('es_correcta');
    });

    it('conserva enunciados, opciones y ajustes del intento', () => {
      const paraAlumno = sinRespuestas(CONFIG_VALIDA);

      expect(paraAlumno.intentos_permitidos).toBe(2);
      expect(paraAlumno.tiempo_minutos).toBe(15);
      expect(paraAlumno.preguntas).toHaveLength(2);
      expect(paraAlumno.preguntas[0].opciones.map((o) => o.texto)).toEqual(['30 km/h', '60 km/h']);
    });
  });

  describe('respuestasCorrectas', () => {
    it('devuelve la opción correcta de cada pregunta', () => {
      const correctas = respuestasCorrectas(CONFIG_VALIDA);

      expect(correctas.get('p1')).toBe('a');
      expect(correctas.get('p2')).toBe('b');
    });
  });

  describe('parsearConfiguracionQuiz', () => {
    it('interpreta una configuración válida', () => {
      expect(parsearConfiguracionQuiz(serializada).preguntas).toHaveLength(2);
    });

    it('avisa cuando el recurso no tiene cuestionario', () => {
      expect(() => parsearConfiguracionQuiz(null)).toThrow(BadRequestException);
    });

    it('avisa cuando el JSON está dañado en lugar de devolver un quiz vacío', () => {
      // Antes un catch vacío dejaba pasar null y el alumno sacaba 0 sin saber por qué.
      expect(() => parsearConfiguracionQuiz('{roto')).toThrow(/dañada/);
    });
  });

  describe('validarConfiguracionQuiz', () => {
    it('exige al menos una pregunta', () => {
      expect(() => validarConfiguracionQuiz(JSON.stringify({ preguntas: [] }))).toThrow(/al menos una pregunta/);
    });

    it('exige al menos dos opciones por pregunta', () => {
      const config = {
        preguntas: [{ id: 'p1', enunciado: 'x', opciones: [{ id: 'a', texto: 'sí', es_correcta: true }] }],
      };
      expect(() => validarConfiguracionQuiz(JSON.stringify(config))).toThrow(/dos opciones/);
    });

    it('exige exactamente una opción correcta', () => {
      const dosCorrectas = {
        preguntas: [
          {
            id: 'p1',
            enunciado: 'x',
            opciones: [
              { id: 'a', texto: 'sí', es_correcta: true },
              { id: 'b', texto: 'también', es_correcta: true },
            ],
          },
        ],
      };
      expect(() => validarConfiguracionQuiz(JSON.stringify(dosCorrectas))).toThrow(/exactamente una opción correcta/);

      const ninguna = {
        preguntas: [
          {
            id: 'p1',
            enunciado: 'x',
            opciones: [
              { id: 'a', texto: 'sí', es_correcta: false },
              { id: 'b', texto: 'no', es_correcta: false },
            ],
          },
        ],
      };
      expect(() => validarConfiguracionQuiz(JSON.stringify(ninguna))).toThrow(/exactamente una opción correcta/);
    });

    it('rechaza una opción sin texto', () => {
      const config = {
        preguntas: [
          {
            id: 'p1',
            enunciado: 'x',
            opciones: [
              { id: 'a', texto: '  ', es_correcta: true },
              { id: 'b', texto: 'no', es_correcta: false },
            ],
          },
        ],
      };
      expect(() => validarConfiguracionQuiz(JSON.stringify(config))).toThrow(/está vacía/);
    });

    it('normaliza los ajustes numéricos ausentes a 0 (sin límite)', () => {
      const config = { preguntas: CONFIG_VALIDA.preguntas };
      const validada = validarConfiguracionQuiz(JSON.stringify(config));

      expect(validada.intentos_permitidos).toBe(0);
      expect(validada.tiempo_minutos).toBe(0);
    });
  });
});
