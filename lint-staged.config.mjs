/**
 * Prettier sobre los archivos preparados para el commit, en tandas: en Windows la línea de
 * órdenes no admite más de unos 8000 caracteres y un commit grande la supera de una vez.
 */
const PER_BATCH = 25;

function prettier(files) {
  const batches = [];
  for (let i = 0; i < files.length; i += PER_BATCH) {
    const paths = files.slice(i, i + PER_BATCH).map((file) => JSON.stringify(file));
    batches.push(`prettier --write ${paths.join(' ')}`);
  }
  return batches;
}

export default {
  'apps/api/{src,prisma}/**/*.ts': prettier,
  'apps/client/src/**/*.{ts,tsx,css}': prettier,
};
