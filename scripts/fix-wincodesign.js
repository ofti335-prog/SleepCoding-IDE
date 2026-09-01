'use strict';
/* Works around the Windows symlink-permission failure when electron-builder
   extracts winCodeSign ("Cannot create symbolic link"). The two failing
   symlinks are macOS-only and irrelevant for Windows builds. Extracts the
   archive ignoring those errors and caches it where electron-builder
   expects it — no admin rights required. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cacheDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'electron-builder', 'Cache', 'winCodeSign');
const FINAL = path.join(cacheDir, 'winCodeSign-2.6.0');
const ARCHIVE_URL = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';
const sevenZip = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

if (fs.existsSync(FINAL)) { console.log('winCodeSign cache OK ✓'); process.exit(0); }
fs.mkdirSync(cacheDir, { recursive: true });

let archive = fs.readdirSync(cacheDir).find(f => f.endsWith('.7z'));
if (!archive) {
  const dest = path.join(cacheDir, 'winCodeSign-2.6.0.7z');
  console.log('Downloading winCodeSign-2.6.0.7z …');
  execFileSync('powershell', ['-NoProfile', '-Command',
    `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;` +
    `Invoke-WebRequest -Uri '${ARCHIVE_URL}' -OutFile '${dest}'`], { stdio: 'inherit' });
  archive = dest;
} else {
  archive = path.join(cacheDir, archive);
}

const tmp = path.join(cacheDir, 'extract-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
console.log('Extracting (darwin symlink errors are expected & harmless) …');
try { execFileSync(sevenZip, ['x', '-y', archive, '-o' + tmp], { stdio: 'inherit' }); }
catch { /* exit code 2 = the two darwin symlinks — fine */ }

const entries = fs.readdirSync(tmp).map(f => path.join(tmp, f));
const srcDir = entries.length === 1 && fs.statSync(entries[0]).isDirectory() ? entries[0] : tmp;
fs.renameSync(srcDir, FINAL);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Cached ✓ — build can proceed');