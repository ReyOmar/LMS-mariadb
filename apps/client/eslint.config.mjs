import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * Reglas de análisis estático del cliente.
 *
 * `FlatCompat` hace de puente porque `eslint-config-next` todavía se publica en el formato
 * antiguo de configuración.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Un `any` suelto esconde justo los errores que el tipado debería atrapar.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Un nombre que tapa a otro del ámbito exterior invita a usar el que no es.
      '@typescript-eslint/no-shadow': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-self-compare': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Las imágenes salen del almacenamiento de la API: dominio configurable por despliegue
      // y enlaces firmados que caducan. El optimizador de Next no aporta nada con ellas.
      '@next/next/no-img-element': 'off',
    },
  },
  {
    // `prod/` es la copia del build autónomo que se sube a cPanel, no código fuente.
    ignores: ['.next/**', 'prod/**', 'node_modules/**', 'next-env.d.ts', 'pre-build.js', 'post-build.js', 'public/**'],
  },
];

export default config;
