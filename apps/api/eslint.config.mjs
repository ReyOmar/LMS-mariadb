// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Reglas de análisis estático de la API. */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'prisma/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // Nest declara el tipo de retorno en el decorador; exigirlo aquí no aporta.
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Un nombre que tapa a otro del ámbito exterior invita a usar el que no es.
      '@typescript-eslint/no-shadow': 'error',

      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      // `x == null` es la forma legible de «nulo o indefinido»; el resto exige estricto.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-duplicate-imports': 'error',
      'no-self-compare': 'error',
    },
  },
  {
    files: ['**/*.spec.ts', 'src/common/testing/**/*.ts', 'prisma/**/*.ts'],
    rules: {
      // Los dobles de prueba imitan tipos generados que no conviene reproducir enteros.
      '@typescript-eslint/no-explicit-any': 'off',
      // La siembra y las pruebas informan por consola de lo que hacen.
      'no-console': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'jest.config.js'],
  },
);
