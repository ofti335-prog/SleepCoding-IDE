'use strict';
/* Removes the Spectre-mitigation requirement (MSB8040) from node-pty's build
   files so a stock VS 2022 C++ toolchain can compile it. Idempotent. */
const fs = require('fs');
const path = require('path');

const PTY_DIR = path.join(__dirname, '..', 'node_modules', 'node-pty');

function listGypFiles(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listGypFiles(full, out);
    else if (e.name.endsWith('.gyp') || e.name.endsWith('.gypi')) out.push(full);
  }
  return out;
}

const re = /(['"])SpectreMitigation\1(\s*:\s*)(['"])Spectre\3/g;
let patched = 0;
for (const f of listGypFiles(PTY_DIR)) {
  const src = fs.readFileSync(f, 'utf8');
  const out = src.replace(re, '$1SpectreMitigation$1$2$3false$3');
  if (out !== src) { fs.writeFileSync(f, out); patched++; console.log('patched:', path.relative(PTY_DIR, f)); }
}
console.log(patched ? `Spectre requirement removed from ${patched} file(s).` : 'Already patched ✓');