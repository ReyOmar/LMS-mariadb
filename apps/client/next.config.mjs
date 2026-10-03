import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Raíz del monorepo. El build `standalone` copia lo necesario a partir de aquí, de modo que
 * `prod/` reproduce `apps/client/` dentro; ver `post-build.js`.
 */
const MONOREPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Rutas antiguas (en español) → rutas actuales.
 *
 * Siguen circulando en correos ya enviados, notificaciones guardadas y marcadores del
 * navegador, así que se redirigen de forma permanente en lugar de dar 404.
 */
const LEGACY_PAGES = [
  ['/cursos/:courseId', '/courses/:courseId'],
  [
    '/dashboard/constructor-cursos/:courseId/modulos/:moduleId/bloques/:resourceId',
    '/dashboard/course-builder/:courseId/modules/:moduleId/resources/:resourceId',
  ],
  ['/dashboard/constructor-cursos', '/dashboard/course-builder'],
  ['/dashboard/admin/asignacion-cursos', '/dashboard/admin/course-assignment'],
  ['/dashboard/admin/certificados-config', '/dashboard/admin/certificate-settings'],
  ['/dashboard/admin/correos', '/dashboard/admin/emails'],
  ['/dashboard/admin/landing-config', '/dashboard/admin/landing-settings'],
  ['/dashboard/admin/solicitudes', '/dashboard/admin/access-requests'],
  ['/dashboard/admin/tema', '/dashboard/admin/theme'],
  ['/dashboard/admin/usuarios', '/dashboard/admin/users'],
  ['/dashboard/examiner/calificaciones', '/dashboard/examiner/grading'],
  ['/dashboard/examiner/firma', '/dashboard/examiner/signature'],
  ['/dashboard/examiner/monitoreo', '/dashboard/examiner/monitoring'],
  ['/dashboard/examiner/pruebas', '/dashboard/examiner/quizzes'],
  ['/dashboard/mensajes', '/dashboard/messages'],
  ['/dashboard/student/certificados', '/dashboard/student/certificates'],
  ['/dashboard/student/cursos', '/dashboard/student/courses'],
  ['/recuperar-contrasena', '/forgot-password'],
  ['/restablecer-contrasena', '/reset-password'],
  ['/verificar', '/verify'],
];

/** Páginas que además recibían un parámetro con nombre en español. */
const LEGACY_QUERIES = [
  ['/verificar', 'codigo', '/verify?code=:value'],
  ['/dashboard/constructor-cursos', 'curso', '/dashboard/course-builder?course=:value'],
  ['/dashboard/admin/asignacion-cursos', 'curso', '/dashboard/admin/course-assignment?course=:value'],
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: MONOREPO_ROOT,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  reactStrictMode: true,
  experimental: {
    // Sólo se empaquetan los iconos que se importan, no la librería entera.
    optimizePackageImports: ['lucide-react'],
  },
  async redirects() {
    return [
      // Van primero: las reglas sin parámetro también casarían con estas rutas.
      ...LEGACY_QUERIES.map(([source, key, destination]) => ({
        source,
        has: [{ type: 'query', key, value: '(?<value>.*)' }],
        destination,
        permanent: true,
      })),
      ...LEGACY_PAGES.map(([source, destination]) => ({ source, destination, permanent: true })),
    ];
  },
};

export default nextConfig;
