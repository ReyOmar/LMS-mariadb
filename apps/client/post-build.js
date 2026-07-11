const fs = require('fs');
const path = require('path');

const clientDir = __dirname;
const standaloneDir = path.join(clientDir, '.next', 'standalone');
const prodDir = path.join(clientDir, 'prod');

console.log('Running post-build script to copy Next.js standalone and static assets into non-hidden "prod" directory...');

// 1. Clean previous prod folder
if (fs.existsSync(prodDir)) {
  fs.rmSync(prodDir, { recursive: true, force: true });
}

// 2. Copy the entire standalone folder to prod/
if (fs.existsSync(standaloneDir)) {
  fs.mkdirSync(prodDir, { recursive: true });
  fs.cpSync(standaloneDir, prodDir, { recursive: true });
  console.log('✓ Copied standalone build to prod/');
} else {
  console.log('❌ standalone build folder not found!');
  process.exit(1);
}

// 3. Copy public folder to prod/apps/client/public
const publicSrc = path.join(clientDir, 'public');
const publicDest = path.join(prodDir, 'apps', 'client', 'public');
if (fs.existsSync(publicSrc)) {
  fs.mkdirSync(publicDest, { recursive: true });
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log('✓ Copied public/ assets to prod/apps/client/public');
}

// 4. Copy .next/static folder to prod/apps/client/.next/static
const staticSrc = path.join(clientDir, '.next', 'static');
const staticDest = path.join(prodDir, 'apps', 'client', '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(staticDest, { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log('✓ Copied .next/static/ assets to prod/apps/client/.next/static');
}
