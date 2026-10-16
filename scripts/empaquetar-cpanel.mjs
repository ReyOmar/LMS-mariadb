#!/usr/bin/env node
/**
 * Compila la API y el cliente y deja en `despliegue/lms-cpanel.zip` un único paquete con la
 * misma estructura que la carpeta del proyecto en el servidor, para extraerlo en su raíz:
 *
 *   apps/api/          dist/, prisma/, prisma.config.ts, tsconfig.json (para la siembra), package.json, package-lock.json
 *   apps/client/prod/  el servidor standalone de Next, con sus dependencias
 *
 * Uso:
 *   npm run package:cpanel
 *   npm run package:cpanel -- --api-url https://api-lms.tu-dominio.com/api
 *
 * Sin `--api-url`, el cliente deduce la dirección de la API de su propio dominio
 * (`lms.` → `api-lms.`, `campus.` → `api-campus.`, si no `api.<dominio>`; ver
 * apps/client/src/lib/env.ts). Con ella, la dirección queda fija en el paquete.
 *
 * Ver docs/DESPLIEGUE-CPANEL.md.
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'despliegue');
const API = path.join(ROOT, 'apps', 'api');
const CLIENT_PROD = path.join(ROOT, 'apps', 'client', 'prod');

/** Con este valor el cliente deduce la API de su propio dominio (apps/client/src/lib/env.ts). */
const INFER_FROM_DOMAIN = 'http://localhost:3200/api';

/** Lo que necesita la API en el servidor; las dependencias se instalan allí. */
const API_FILES = ['dist', 'prisma', 'prisma.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json'];

function argument(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, env = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
}

/**
 * El `tar` de Windows y de macOS (bsdtar) crea .zip; en Linux se recurre a `zip`. En Windows se
 * usa el del sistema por su ruta: el de Git Bash, que va antes en el PATH, es GNU tar y no sabe.
 */
function bsdtar() {
  const windowsTar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const candidate = process.platform === 'win32' && fs.existsSync(windowsTar) ? windowsTar : 'tar';
  try {
    return execFileSync(candidate, ['--version'], { encoding: 'utf8' }).includes('bsdtar') ? candidate : null;
  } catch {
    return null;
  }
}

function zipFolder(sourceDir, target) {
  fs.rmSync(target, { force: true });
  const tar = bsdtar();
  if (tar) {
    execFileSync(tar, ['-a', '-c', '-f', target, '-C', sourceDir, '.'], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-qr', target, '.'], { cwd: sourceDir, stdio: 'inherit' });
  }
}

function megabytes(file) {
  return `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB`;
}

const apiUrl = argument('--api-url');
if (apiUrl && !/^https:\/\/[^/]+\/api$/.test(apiUrl)) {
  console.error(
    '--api-url debe ser la dirección pública de la API terminada en /api, p. ej. https://api-lms.tu-dominio.com/api',
  );
  process.exit(1);
}

run('npm run build:api');
// Next incrusta `NEXT_PUBLIC_API_URL` al compilar. Se fija siempre aquí para que no se cuele la del
// `.env` de desarrollo (un túnel o una IP local): sin `--api-url`, el valor de localhost activa la
// deducción por dominio en el navegador. Una variable ya definida prevalece sobre el `.env`.
run('npm run build:client', { NEXT_PUBLIC_API_URL: apiUrl ?? INFER_FROM_DOMAIN });

const stage = path.join(OUT, 'lms-cpanel');
fs.rmSync(stage, { recursive: true, force: true });
const apiStage = path.join(stage, 'apps', 'api');
fs.mkdirSync(apiStage, { recursive: true });
for (const entry of API_FILES) {
  const source = path.join(API, entry);
  if (!fs.existsSync(source)) {
    console.error(`Falta ${source}: la compilación no terminó bien.`);
    process.exit(1);
  }
  fs.cpSync(source, path.join(apiStage, entry), { recursive: true });
}

if (!fs.existsSync(path.join(CLIENT_PROD, 'apps', 'client', 'server.js'))) {
  console.error('Falta apps/client/prod/apps/client/server.js: la compilación del cliente no terminó bien.');
  process.exit(1);
}
fs.cpSync(CLIENT_PROD, path.join(stage, 'apps', 'client', 'prod'), { recursive: true });

const zip = path.join(OUT, 'lms-cpanel.zip');
zipFolder(stage, zip);
fs.rmSync(stage, { recursive: true, force: true });

console.log(`\nPaquete listo: ${path.relative(ROOT, zip)} (${megabytes(zip)})`);
console.log('  Se extrae en la carpeta del proyecto: deja apps/api y apps/client/prod.');
console.log(`  API: ${apiUrl ?? 'deducida del dominio del cliente'}`);
console.log('\nSigue docs/DESPLIEGUE-CPANEL.md.');
