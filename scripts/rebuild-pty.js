'use strict';
/* Rebuilds node-pty against the installed Electron version.
   Also removes the Spectre-mitigation requirement (error MSB8040)
   so a stock VS 2022 C++ toolchain can compile it. */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PTY_DIR = path.join(ROOT, 'node_modules', 'node-pty');

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

function stripSpectre() {
  const re = /(['"])SpectreMitigation\1(\s*:\s*)(['"])Spectre\3/g;
  let patched = 0;
  for (const f of listGypFiles(PTY_DIR)) {
    const src = fs.readFileSync(f, 'utf8');
    const out = src.replace(re, '$1SpectreMitigation$1$2$3false$3');
    if (out !== src) {
      fs.writeFileSync(f, out);
      patched++;
      console.log('patched:', path.relative(PTY_DIR, f));
    }
  }
  console.log(patched ? `Spectre requirement removed from ${patched} file(s).`
                      : 'No Spectre requirements found (already patched).');
}

const electronVer = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')
).version;

console.log(`Rebuilding node-pty for Electron ${electronVer}...`);
stripSpectre();

const res = spawnSync('npx', ['node-gyp', 'rebuild',
  '--runtime=electron',
  `--target=${electronVer}`,
  '--disturl=https://electronjs.org/headers',
  `--directory=${PTY_DIR}`
], { stdio: 'inherit', shell: process.platform === 'win32' });

process.exit(res.status || 0);