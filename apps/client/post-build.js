const fs = require('fs');
const path = require('path');

const clientDir = __dirname;
const standaloneDir = path.join(clientDir, '.next', 'standalone');
const targetClientDir = path.join(standaloneDir, 'apps', 'client');

console.log('Running post-build script to copy static assets for cPanel standalone deployment...');

// 1. Copy public folder
const publicSrc = path.join(clientDir, 'public');
const publicDest = path.join(targetClientDir, 'public');
if (fs.existsSync(publicSrc)) {
  fs.mkdirSync(publicDest, { recursive: true });
  fs.cpSync(publicSrc, publicDest, { recursive: true });
  console.log('✓ Copied public/ to standalone client');
} else {
  console.log('⚠ public/ folder not found');
}

// 2. Copy .next/static folder
const staticSrc = path.join(clientDir, '.next', 'static');
const staticDest = path.join(targetClientDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(staticDest, { recursive: true });
  fs.cpSync(staticSrc, staticDest, { recursive: true });
  console.log('✓ Copied .next/static/ to standalone client');
} else {
  console.log('⚠ .next/static/ folder not found');
}
