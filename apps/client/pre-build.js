const fs = require('fs');
const path = require('path');

/**
 * Retira los artefactos de la compilación anterior, conservando la caché.
 *
 * `.next` acumula lo que dejan tanto `next dev` como `next build`. Con restos de una
 * compilación anterior, la siguiente puede fallar durante el prerenderizado con un error
 * que no menciona la causa:
 *
 *   «<Html> should not be imported outside of pages/_document»
 *
 * `.next/cache` se respeta: es la caché incremental y borrarla sólo haría más lenta cada
 * compilación.
 */
const buildDir = path.join(__dirname, '.next');
const CACHE_DIR = 'cache';

if (!fs.existsSync(buildDir)) {
  process.exit(0);
}

let removed = 0;
for (const entry of fs.readdirSync(buildDir)) {
  if (entry === CACHE_DIR) continue;
  fs.rmSync(path.join(buildDir, entry), { recursive: true, force: true });
  removed++;
}

console.log(`Compilación limpia: ${removed} artefacto(s) anterior(es) retirado(s) (la caché se conserva).`);
