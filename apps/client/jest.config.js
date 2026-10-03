/**
 * Pruebas del cliente.
 *
 * Sólo cubren **módulos puros**: las reglas que se pueden comprobar sin montar React ni
 * abrir un navegador —qué hay detrás de un enlace, qué cuenta cae en una pestaña, por
 * dónde sigue un alumno, cómo se redondea una nota—. Es donde viven las decisiones que se
 * equivocan en silencio, y montarlas aquí cuesta segundos en lugar de minutos.
 *
 * Las pantallas se siguen comprobando ejecutando la aplicación; esto no pretende
 * sustituirlo.
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  // El mismo alias que usa la aplicación, para que las pruebas importen igual que el código.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
