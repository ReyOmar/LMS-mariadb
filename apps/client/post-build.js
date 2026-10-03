const fs = require('fs');
const path = require('path');

/**
 * Reúne la compilación `standalone` de Next en `prod/`, lista para subir al hosting.
 *
 * `standalone` trae el servidor y sus dependencias, pero no los archivos estáticos: la
 * carpeta `public/` y `.next/static` hay que copiarlos al lado para que se sirvan.
 * Se usa `prod/` y no `.next/` porque el administrador de archivos de cPanel oculta las
 * carpetas que empiezan por punto.
 */
const clientDir = __dirname;
const buildDir = path.join(clientDir, '.next');
const standaloneDir = path.join(buildDir, 'standalone');
const prodDir = path.join(clientDir, 'prod');
const prodClientDir = path.join(prodDir, 'apps', 'client');

function copy(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  return true;
}

if (!fs.existsSync(standaloneDir)) {
  console.error('No se encontró .next/standalone: revisa que `output: "standalone"` siga en next.config.mjs.');
  process.exit(1);
}

fs.rmSync(prodDir, { recursive: true, force: true });
copy(standaloneDir, prodDir);
console.log('✓ Servidor standalone copiado a prod/');

if (copy(path.join(clientDir, 'public'), path.join(prodClientDir, 'public'))) {
  console.log('✓ public/ copiado a prod/apps/client/public');
}
if (copy(path.join(buildDir, 'static'), path.join(prodClientDir, '.next', 'static'))) {
  console.log('✓ .next/static copiado a prod/apps/client/.next/static');
}
