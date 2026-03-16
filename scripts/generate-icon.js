// Generate app icon from source PNG
// Usage: node scripts/generate-icon.js [source.png]
// If no source provided, looks for build/icon.png

const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

async function main() {
  const source = process.argv[2] || path.join(__dirname, '..', 'build', 'icon.png');

  if (!fs.existsSync(source)) {
    console.error(`Source file not found: ${source}`);
    console.log('Please save your icon as build/icon.png (256x256 or larger PNG)');
    process.exit(1);
  }

  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  // Convert PNG to ICO
  const buf = await pngToIco(source);
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(icoPath, buf);
  console.log(`Created: ${icoPath}`);

  // Copy PNG as well
  const pngDest = path.join(buildDir, 'icon.png');
  if (source !== pngDest) {
    fs.copyFileSync(source, pngDest);
    console.log(`Copied: ${pngDest}`);
  }

  console.log('Done! Icon files ready for electron-builder.');
}

main().catch(err => { console.error(err); process.exit(1); });
