'use strict';
/* Converts build/icon.png → build/icon.ico (multi-size, installer-ready). */
const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const src = path.join(__dirname, '..', 'build', 'icon.png');
if (!fs.existsSync(src)) {
  console.error('build/icon.png not found — run: node scripts/make-icon.js');
  process.exit(1);
}
const png = fs.readFileSync(src);
const ico = png2icons.createICO(png, png2icons.BILINEAR, 0, true, true);
fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.ico'), ico);
console.log('build/icon.ico written');