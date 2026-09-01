'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, powerMonitor } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = require('fs/promises');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const { LiveServer } = require('./server');

/* --------------------- GPU / performance switches --------------------- */
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

/* ------------------------------- window ------------------------------- */
let win = null;
let splash = null;
let splashFailsafe = null;
let workspaceRoot = null;
let devtoolsFocused = false;
let forceClose = false;
let quitGuard = null;

const winBuild = parseInt((os.release().split('.')[2] || '0'), 10);
const supportsMica = process.platform === 'win32' && winBuild >= 22621 && !process.env.WEBFORGE_NO_MICA;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function closeSplash() {
  if (splashFailsafe) { clearTimeout(splashFailsafe); splashFailsafe = null; }
  if (splash && !splash.isDestroyed()) splash.close();
  splash = null;
}

function splashProgress(percent, text) {
  if (!splash || splash.isDestroyed()) return;
  const safeText = JSON.stringify(String(text || ''));
  splash.webContents.executeJavaScript(`window.setBootProgress && window.setBootProgress(${Number(percent)||0}, ${safeText})`, true).catch(() => {});
}

function createSplash() {
  splash = new BrowserWindow({
    width: 680, height: 430, minWidth: 520, minHeight: 340,
    frame: false, resizable: false, movable: true,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false,
    transparent: false,
    backgroundColor: '#090b11',
    roundedCorners: true,
    webPreferences: { spellcheck: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  splash.once('ready-to-show', () => {
    if (splash && !splash.isDestroyed()) {
      splash.show();
      splashProgress(8, 'Starting SleepCoding…');
    }
  });
  splash.webContents.on('did-finish-load', () => splashProgress(14, 'Preparing workspace…'));
  splash.loadFile(path.join(__dirname, 'src', 'splash.html'));
}

ipcMain.on('boot:progress', (_e, payload = {}) => {
  splashProgress(Number(payload.percent) || 0, payload.text || 'Loading…');
});
ipcMain.on('boot:complete', () => {
  splashProgress(100, 'Ready');
  setTimeout(() => {
    closeSplash();
    if (win && !win.isDestroyed()) win.show();
  }, 260);
});
ipcMain.on('boot:error', (_e, payload = {}) => {
  splashProgress(100, 'Startup recovery');
  setTimeout(() => {
    closeSplash();
    if (win && !win.isDestroyed()) win.show();
  }, 850);
});


function createWindow() {
  const isMac = process.platform === 'darwin';
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  const opts = {
    width: 1680, height: 980, minWidth: 960, minHeight: 600,
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    backgroundColor: '#16181d',
    ...(isMac ? { trafficLightPosition: { x: 14, y: 11 } } : {}),
    ...(!isMac && fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, spellcheck: false
    }
  };
  if (supportsMica) { opts.backgroundColor = '#00000000'; opts.backgroundMaterial = 'mica'; }
  else if (isMac)   { opts.backgroundColor = '#00000000'; opts.vibrancy = 'under-window'; }

  win = new BrowserWindow(opts);

  win.once('ready-to-show', () => {
    splashProgress(34, 'Workbench window ready…');
    // Do not reveal the workbench yet. The renderer will signal boot:complete
    // after Monaco and the IDE feature layer are initialized.
  });
  win.webContents.on('did-fail-load', () => closeSplash());

  win.webContents.on('did-finish-load', () => {
    splashProgress(55, 'Loading workspace services…');
    /* fresh renderer (first load or Ctrl+R) → drop orphaned terminal sessions */
    for (const [, s] of ptys) { try { s.proc.kill(); } catch {} }
    ptys.clear();
    for (const [, t] of terminals) { try { t.proc && t.proc.kill(); } catch {} }
    terminals.clear();

    send('win:mica', { mode: supportsMica ? 'mica' : (isMac ? 'vibrancy' : 'solid') });
    send('power:state', { onBattery: powerMonitor.isOnBatteryPower() });
  });

  const wc = win.webContents;
  wc.on('devtools-focused', () => { devtoolsFocused = true; send('win:focus'); });
  wc.on('devtools-closed',  () => { devtoolsFocused = false; });
  win.on('blur',  () => { if (!devtoolsFocused) send('win:blur'); });
  win.on('focus', () => send('win:focus'));
  win.on('maximize',   () => send('win:maximized', true));
  win.on('unmaximize', () => send('win:maximized', false));

  win.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    send('app:ask-quit');
    if (!quitGuard) quitGuard = setTimeout(() => {
      quitGuard = null; forceClose = true;
      try { if (win) win.close(); } catch {}
    }, 4000);
  });
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }
    ] }
  ]));
}

/* ------------------------------ file system --------------------------- */
const IGNORED = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out',
  'coverage', '.cache', '.idea', '.vs', '.DS_Store', 'Thumbs.db']);

async function* walk(dir) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (IGNORED.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

let watcher = null;
function startWatcher(folder) {
  if (watcher) { watcher.close().catch(() => {}); watcher = null; }
  watcher = chokidar.watch(folder, {
    ignoreInitial: true,
    ignored: /(^|[/\\])(node_modules|\.git)([/\\]|$)/,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  });
  const sendFs = (type, p) => send('fs:event', { type, path: p });
  watcher
    .on('add',       p => sendFs('add', p))
    .on('change',    p => sendFs('change', p))
    .on('unlink',    p => sendFs('unlink', p))
    .on('addDir',    p => sendFs('addDir', p))
    .on('unlinkDir', p => sendFs('unlinkDir', p));
}

/* --------------------- fs operation helpers (safe) -------------------- */
async function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const dir = path.dirname(p), e = path.extname(p), b = path.basename(p, e);
  for (let i = 2; ; i++) {
    const cand = path.join(dir, `${b} (${i})${e}`);
    if (!fs.existsSync(cand)) return cand;
  }
}
async function movePath(src, dst) {
  try { await fsp.rename(src, dst); }
  catch (err) {
    if (err.code === 'EXDEV') {
      await fsp.cp(src, dst, { recursive: true });
      await fsp.rm(src, { recursive: true, force: true });
    } else throw err;
  }
}

/* ------------------------------- dialogs ------------------------------ */
ipcMain.handle('dialog:openFolder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Open Folder' });
  if (res.canceled || !res.filePaths.length) return null;
  workspaceRoot = res.filePaths[0];
  startWatcher(workspaceRoot);
  return workspaceRoot;
});

ipcMain.handle('dialog:openPath', async (_e, p) => {
  try {
    const st = await fsp.stat(p);
    if (!st.isDirectory()) return { error: 'Not a folder' };
    workspaceRoot = p;
    startWatcher(p);
    return p;
  } catch { return { error: 'Folder is unavailable' }; }
});

ipcMain.handle('dialog:saveAs', async (_e, { defaultPath, content }) => {
  const res = await dialog.showSaveDialog(win, { defaultPath: defaultPath || 'untitled.txt', title: 'Save As' });
  if (res.canceled || !res.filePath) return null;
  await fsp.writeFile(res.filePath, content, 'utf8');
  return res.filePath;
});

/* --------------------------------- fs --------------------------------- */
ipcMain.handle('fs:readDir', async (_e, dirPath) => {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    if (IGNORED.has(ent.name)) continue;
    out.push({ name: ent.name, path: path.join(dirPath, ent.name), isDir: ent.isDirectory() });
  }
  out.sort((a, b) => a.isDir !== b.isDir ? (a.isDir ? -1 : 1)
    : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
});

ipcMain.handle('fs:readFile', async (_e, p) => {
  const stat = await fsp.stat(p);
  if (stat.size > 8 * 1024 * 1024) throw new Error('File too large (>8 MB)');
  const buf = await fsp.readFile(p);
  if (buf.includes(0)) return { binary: true, size: stat.size };
  return { binary: false, content: buf.toString('utf8'), size: stat.size };
});

ipcMain.handle('fs:readFileDataUrl', async (_e, p) => {
  const buf = await fsp.readFile(p);
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp' }[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
});

ipcMain.handle('fs:writeFile', async (_e, p, content) => {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, content, 'utf8');
  return true;
});

ipcMain.handle('fs:createFile', async (_e, dir, name) => {
  const p = path.join(dir, name);
  if (fs.existsSync(p)) throw new Error(`"${name}" already exists`);
  await fsp.writeFile(p, '', 'utf8');
  return p;
});

ipcMain.handle('fs:createDir', async (_e, dir, name) => {
  const p = path.join(dir, name);
  if (fs.existsSync(p)) throw new Error(`"${name}" already exists`);
  await fsp.mkdir(p, { recursive: true });
  return p;
});

ipcMain.handle('fs:rename', async (_e, target, newName) => {
  const to = path.join(path.dirname(target), newName);
  if (fs.existsSync(to)) throw new Error(`"${newName}" already exists`);
  await fsp.rename(target, to);
  return to;
});

ipcMain.handle('fs:move', async (_e, src, dstDir) => {
  if (!src || !fs.existsSync(src)) throw new Error('Source not found');
  const st = await fsp.stat(src);
  if (st.isDirectory() && (dstDir === src || dstDir.startsWith(src + path.sep)))
    throw new Error('Cannot move a folder into itself');
  if (path.dirname(src) === dstDir) return src;
  const dest = await uniquePath(path.join(dstDir, path.basename(src)));
  await movePath(src, dest);
  return dest;
});

ipcMain.handle('fs:duplicate', async (_e, src) => {
  if (!fs.existsSync(src)) throw new Error('Source not found');
  const dir = path.dirname(src), b = path.basename(src), e = path.extname(b);
  const dest = await uniquePath(path.join(dir, b.slice(0, b.length - e.length) + ' copy' + e));
  await fsp.cp(src, dest, { recursive: true });
  return dest;
});

ipcMain.handle('fs:paste', async (_e, { dstDir, mode, paths }) => {
  const out = [];
  for (const src of paths || []) {
    if (!src || !fs.existsSync(src)) continue;
    let st; try { st = await fsp.stat(src); } catch { continue; }
    if (st.isDirectory() && (dstDir === src || dstDir.startsWith(src + path.sep))) continue;
    if (mode === 'cut' && path.dirname(src) === dstDir) continue;
    const dest = await uniquePath(path.join(dstDir, path.basename(src)));
    if (mode === 'cut') await movePath(src, dest);
    else await fsp.cp(src, dest, { recursive: true });
    out.push(dest);
  }
  return out;
});

ipcMain.handle('fs:copyInto', async (_e, src, dstDir) => {
  if (!src || !fs.existsSync(src)) throw new Error('Source not found');
  const st = await fsp.stat(src);
  if (st.isDirectory() && (dstDir === src || dstDir.startsWith(src + path.sep)))
    throw new Error('Cannot copy a folder into itself');
  if (path.dirname(src) === dstDir) return path.join(dstDir, path.basename(src));
  const dest = await uniquePath(path.join(dstDir, path.basename(src)));
  await fsp.cp(src, dest, { recursive: true });
  return dest;
});

ipcMain.handle('fs:remove', async (_e, p) => { await fsp.rm(p, { recursive: true, force: true }); return true; });

ipcMain.handle('fs:allFiles', async (_e, root) => {
  const files = [];
  for await (const f of walk(root)) { files.push(f); if (files.length >= 8000) break; }
  return files;
});

ipcMain.handle('fs:reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('shell:openExternal', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

/* -------------------------------- search ------------------------------ */
const searchSessions = new Map();
let searchSeq = 0;

ipcMain.handle('fs:search', async (_e, { root, query, isRegex, caseSensitive, maxResults = 1000 }) => {
  searchSessions.clear();
  const id = ++searchSeq;
  searchSessions.set(id, true);
  const cancelled = () => !searchSessions.has(id);
  if (!query) return { results: [] };
  let re;
  try {
    re = new RegExp(isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  } catch { return { error: 'Invalid regular expression' }; }

  const results = [];
  for await (const file of walk(root)) {
    if (cancelled() || results.length >= maxResults) break;
    let stat; try { stat = await fsp.stat(file); } catch { continue; }
    if (stat.size > 2 * 1024 * 1024) continue;
    let text; try { text = await fsp.readFile(file, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue;
    const lines = text.split('\n');
    const matches = [];
    for (let i = 0; i < lines.length && matches.length < 50; i++) {
      re.lastIndex = 0;
      const m = re.exec(lines[i]);
      if (m) matches.push({ line: i + 1, col: m.index, len: m[0].length, text: lines[i].slice(0, 300) });
    }
    if (matches.length) results.push({ file, matches });
  }
  return { results };
});

/* --------------------------- terminal (pty + legacy) ------------------- */
let pty = null;
try { pty = require('node-pty'); }
catch (err) { console.warn('[sleepcoding] node-pty unavailable, legacy terminal mode:', err.message); }

const ptys = new Map();
const terminals = new Map();
let sessSeq = 0;

function shellFor() {
  if (process.platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] };
  return { file: process.env.SHELL || '/bin/bash', args: ['-l'] };
}

ipcMain.handle('pty:create', (_e, cwd) => {
  const dir = cwd || workspaceRoot || os.homedir();
  if (!pty) {
    const id = 't' + (++sessSeq);
    terminals.set(id, { cwd: dir, proc: null });
    return { id, pty: false };
  }
  const id = 'p' + (++sessSeq);
  const { file, args } = shellFor();
  const env = { ...process.env, TERM: 'xterm-256color' };
  const proc = pty.spawn(file, args, { name: 'xterm-256color', cols: 80, rows: 24, cwd: dir, env });
  proc.onData(d => send('pty:data', { id, data: d }));
  proc.onExit(({ exitCode }) => { send('pty:exit', { id, exitCode }); ptys.delete(id); });
  ptys.set(id, { proc, cwd: dir });
  return { id, pty: true };
});

ipcMain.handle('pty:input',  (_e, { id, data }) => { const s = ptys.get(id); if (s) s.proc.write(data); });
ipcMain.handle('pty:resize', (_e, { id, cols, rows }) => {
  const s = ptys.get(id);
  if (s) { try { s.proc.resize(Math.max(2, cols | 0), Math.max(2, rows | 0)); } catch {} }
});
ipcMain.handle('pty:dispose', (_e, id) => {
  const s = ptys.get(id);
  if (s) { try { s.proc.kill(); } catch {} ptys.delete(id); }
});

/* legacy fallback terminal */
ipcMain.handle('terminal:create', (_e, root) => {
  const id = 't' + (++sessSeq);
  const t = { cwd: root || workspaceRoot || os.homedir(), proc: null };
  terminals.set(id, t);
  return { id, cwd: t.cwd };
});

ipcMain.handle('terminal:run', (e, { id, cmd }) => {
  const t = terminals.get(id);
  if (!t) return { error: 'no terminal' };
  const sendTerm = (data) => send('terminal:data', { id, data });
  const trimmed = cmd.trim();

  if (trimmed === 'clear' || trimmed === 'cls') return { builtin: 'clear' };

  if (/^cd(\s|$)/.test(trimmed)) {
    const target = trimmed.slice(2).trim().replace(/^["']|["']$/g, '') || os.homedir();
    const p = path.resolve(t.cwd, target);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) { t.cwd = p; return { cwd: p }; }
    sendTerm(`cd: no such directory: ${target}\r\n`);
    return { code: 1 };
  }

  const isWin = process.platform === 'win32';
  const proc = spawn(isWin ? 'cmd.exe' : (process.env.SHELL || 'bash'),
    isWin ? ['/d', '/s', '/c', trimmed] : ['-lc', trimmed],
    { cwd: t.cwd, env: { ...process.env, FORCE_COLOR: '0' } });
  t.proc = proc;
  proc.stdout.on('data', d => sendTerm(d.toString()));
  proc.stderr.on('data', d => sendTerm(d.toString()));
  return new Promise((resolve) => {
    proc.on('close', code => { t.proc = null; resolve({ code }); });
    proc.on('error', err => { sendTerm(err.message + '\r\n'); t.proc = null; resolve({ code: 1 }); });
  });
});

/* ------------------------------- runner ------------------------------- */
let pyCmdCache = null;

function tryCmd(cmd, args) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    let proc;
    try {
      proc = spawn(cmd, args, { windowsHide: true, shell: process.platform === 'win32' });
    } catch { return fin(false); }
    proc.on('error', () => fin(false));
    proc.stdout?.on('data', () => fin(true));
    proc.stderr?.on('data', () => fin(true));   // old Python prints --version to stderr
    proc.on('close', () => fin(true));
    setTimeout(() => { try { proc.kill(); } catch {} fin(false); }, 4000);
  });
}

ipcMain.handle('run:pythonCmd', async () => {
  if (pyCmdCache) return { cmd: pyCmdCache };
  const candidates = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  for (const c of candidates) {
    if (await tryCmd(c, ['--version'])) { pyCmdCache = c; return { cmd: c }; }
  }
  return { cmd: null };
});



/* -------------------------- run/debug manager ------------------------- */
const runProcesses = new Map();
const debugSessions = new Map();
let runSeq = 0;

function emitDebug(id, event, payload = {}) { send('debug:event', { id, event, ...payload }); }
function makeDebuggerSession(rec) {
  let ws = null, seq = 0;
  const pending = new Map();
  const session = { rec, ready: false, endpoint: null, send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('Debugger is not connected'));
      const id = ++seq; pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`Debugger timeout: ${method}`)); } }, 8000);
    });
  },
  close() { try { ws?.close(); } catch {} ws = null; session.ready = false; },
  connect(endpoint) {
    session.endpoint = endpoint;
    try { ws = new WebSocket(endpoint); } catch (e) { emitDebug(rec.id, 'error', { message: e.message }); return; }
    ws.on('open', async () => {
      session.ready = true; emitDebug(rec.id, 'connected', { endpoint });
      try {
        await session.send('Runtime.enable');
        await session.send('Debugger.enable');
        await session.send('Debugger.setPauseOnExceptions', { state: 'uncaught' });
        emitDebug(rec.id, 'ready');
      } catch (e) { emitDebug(rec.id, 'error', { message: e.message }); }
    });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); return m.error ? q.reject(new Error(m.error.message || 'Debugger error')) : q.resolve(m.result || {}); }
      if (m.method === 'Debugger.paused') emitDebug(rec.id, 'paused', { params: m.params });
      else if (m.method === 'Debugger.resumed') emitDebug(rec.id, 'resumed');
      else if (m.method === 'Debugger.scriptParsed') emitDebug(rec.id, 'scriptParsed', { params: m.params });
      else if (m.method === 'Runtime.consoleAPICalled') emitDebug(rec.id, 'console', { params: m.params });
      else if (m.method === 'Runtime.exceptionThrown') emitDebug(rec.id, 'exception', { params: m.params });
    });
    ws.on('close', () => { session.ready = false; emitDebug(rec.id, 'disconnected'); });
    ws.on('error', e => emitDebug(rec.id, 'error', { message: e.message }));
  } };
  return session;
}

function attachInspectorFromText(rec, text) {
  const m = String(text).match(/Debugger listening on (ws:\/\/[^\s]+)/);
  if (!m || rec.debuggerAttached) return;
  rec.debuggerAttached = true;
  const ds = makeDebuggerSession(rec); debugSessions.set(rec.id, ds); ds.connect(m[1]);
}

function runSpawnCommand(kind, file, root, debug = false) {
  if (kind === 'python') return { cmd: process.platform === 'win32' ? 'python' : 'python3', args: [file], debug: false };
  if (kind === 'node') return debug
    ? { cmd: process.platform === 'win32' ? 'node.exe' : 'node', args: ['--inspect-brk=0', file], debug: true }
    : { cmd: process.execPath, args: [file], debug: false };
  return null;
}

ipcMain.handle('run:start', async (_e, { root, file, kind, debug = false }) => {
  if (!root || !file || !kind) throw new Error('Invalid run configuration');
  for (const [id, r] of runProcesses) {
    if (r.root === root && r.running) {
      try { r.proc.kill(); } catch {}
      runProcesses.delete(id);
    }
  }
  const cfg = runSpawnCommand(kind, file, root, debug);
  if (!cfg) throw new Error('Unsupported run type');
  const id = 'run' + (++runSeq);
  const env = { ...process.env, FORCE_COLOR: '1' };
  const proc = spawn(cfg.cmd, cfg.args, { cwd: root, env, windowsHide: true, shell: false });
  const rec = { id, proc, root, file, kind, debug: !!cfg.debug, running: true, startedAt: Date.now() };
  runProcesses.set(id, rec);
  const emit = (channel, data) => send(channel, { id, ...data });
  proc.stdout?.on('data', d => { const text = d.toString(); emit('run:data', { stream: 'stdout', data: text }); });
  proc.stderr?.on('data', d => { const text = d.toString(); attachInspectorFromText(rec, text); emit('run:data', { stream: 'stderr', data: text }); });
  proc.on('error', err => emit('run:data', { stream: 'stderr', data: `${err.message}\r\n` }));
  proc.on('close', code => {
    rec.running = false;
    debugSessions.get(id)?.close(); debugSessions.delete(id);
    emit('run:exit', { code, duration: Date.now() - rec.startedAt });
    runProcesses.delete(id);
  });
  return { id, pid: proc.pid, debug: rec.debug, command: [cfg.cmd, ...cfg.args] };
});

ipcMain.handle('run:stop', async (_e, id) => {
  const rec = runProcesses.get(id);
  if (!rec) return false;
  try { rec.proc.kill(); } catch {}
  return true;
});

ipcMain.handle('run:stopAll', async () => {
  for (const rec of runProcesses.values()) { try { rec.proc.kill(); } catch {} }
  runProcesses.clear();
  return true;
});

ipcMain.handle('run:list', () => [...runProcesses.values()].map(r => ({ id: r.id, pid: r.proc.pid, file: r.file, kind: r.kind, debug: r.debug, running: r.running })));
ipcMain.handle('debug:status', (_e, id) => { const d = debugSessions.get(id); return d ? { connected: d.ready, endpoint: d.endpoint } : { connected: false }; });
ipcMain.handle('debug:resume', async (_e, id) => { const d=debugSessions.get(id); if(!d) throw new Error('Debugger not connected'); await d.send('Debugger.resume'); return true; });
ipcMain.handle('debug:pause', async (_e, id) => { const d=debugSessions.get(id); if(!d) throw new Error('Debugger not connected'); await d.send('Debugger.pause'); return true; });
ipcMain.handle('debug:stepOver', async (_e, id) => { const d=debugSessions.get(id); if(!d) throw new Error('Debugger not connected'); await d.send('Debugger.stepOver'); return true; });
ipcMain.handle('debug:stepInto', async (_e, id) => { const d=debugSessions.get(id); if(!d) throw new Error('Debugger not connected'); await d.send('Debugger.stepInto'); return true; });
ipcMain.handle('debug:stepOut', async (_e, id) => { const d=debugSessions.get(id); if(!d) throw new Error('Debugger not connected'); await d.send('Debugger.stepOut'); return true; });
ipcMain.handle('debug:breakpoint', async (_e, { id, lineNumber, file }) => { const d=debugSessions.get(id); if(!d) throw new Error('Debugger not connected'); const url=pathToFileURL(file).href; const r=await d.send('Debugger.setBreakpointByUrl',{lineNumber:Math.max(0,(lineNumber||1)-1),url}); return r; });
ipcMain.handle('debug:removeBreakpoints', async (_e, { id, breakpointIds=[] }) => { const d=debugSessions.get(id); if(!d) return true; for(const breakpointId of breakpointIds){ try{await d.send('Debugger.removeBreakpoint',{breakpointId});}catch{} } return true; });
ipcMain.handle('debug:evaluate', async (_e, { id, expression, callFrameId }) => { const d=debugSessions.get(id); if(!d) throw new Error('Debugger not connected'); const r = callFrameId ? await d.send('Debugger.evaluateOnCallFrame',{callFrameId,expression,returnByValue:true}) : await d.send('Runtime.evaluate',{expression,returnByValue:true}); return r.result || r; });


/* ------------------------------- preview ------------------------------ */
const liveServer = new LiveServer();

ipcMain.handle('preview:start', async (_e, { root, port }) => {
  if (!root) return { error: 'No folder open' };
  try { const p = await liveServer.start(root, port || 3000); return { port: p }; }
  catch (err) { return { error: err.message }; }
});
ipcMain.handle('preview:stop', async () => { await liveServer.stop(); return true; });

/* --------------------------------- git -------------------------------- */
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0' };

function gitExec(root, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd: root, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
      env: { ...process.env, ...GIT_ENV, ...extraEnv }
    }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT')
          return reject(new Error('Git is not installed — download it from git-scm.com'));
        return reject(new Error((stderr && stderr.toString().trim()) || err.message));
      }
      resolve(stdout.toString());
    });
  });
}
const sanitize = (str, token) => token ? String(str).split(token).join('***') : String(str);
const relTo = (root, p) => {
  const r = path.relative(root, p);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error('Path is outside the workspace');
  return r.split(path.sep).join('/');
};

function parseStatus(out) {
  const toks = out.split('\0');
  let branch = '', upstream = '', ahead = 0, behind = 0, noCommits = false, i = 0;
  if (toks[0] && toks[0].startsWith('## ')) {
    const h = toks[0].slice(3);
    const nm = h.match(/^No commits yet on (.+)$/);
    if (nm) { noCommits = true; branch = nm[1].trim(); }
    else {
      const [bp, tail] = h.split(' [');
      const [b, u] = bp.split('...');
      branch = (b || '').trim(); upstream = (u || '').trim();
      if (tail) {
        const a = tail.match(/ahead (\d+)/), be = tail.match(/behind (\d+)/);
        ahead = a ? +a[1] : 0; behind = be ? +be[1] : 0;
      }
    }
    i = 1;
  }
  const changes = [];
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (!t || t.length < 4) continue;
    const x = t[0], y = t[1];
    const p = t.slice(3);
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') i++;
    changes.push({ x, y, path: p });
  }
  return { branch, upstream, ahead, behind, noCommits, changes };
}

async function ghApi(pathname, token, opts = {}) {
  const r = await fetch('https://api.github.com' + pathname, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'SleepCoding-IDE',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    let m = j.message || ('HTTP ' + r.status);
    if (Array.isArray(j.errors) && j.errors[0] && j.errors[0].message) m += ' — ' + j.errors[0].message;
    const e = new Error(m); e.status = r.status; throw e;
  }
  return j;
}

const GITIGNORE_TPL = '# dependencies\nnode_modules/\n\n# builds\ndist/\nbuild/\nout/\n\n# env & logs\n.env\n*.log\nnpm-debug.log*\n\n# OS\n.DS_Store\nThumbs.db\n';

ipcMain.handle('git:status', async (_e, root) => {
  try {
    await gitExec(root, ['rev-parse', '--is-inside-work-tree']);
    const out = await gitExec(root, ['status', '--porcelain=v1', '-b', '--untracked-files=all', '-z']);
    const st = parseStatus(out);
    st.repo = true;
    return st;
  } catch (err) {
    if (/not a git repository/i.test(err.message)) return { repo: false };
    return { repo: false, error: err.message };
  }
});

ipcMain.handle('git:stage', async (_e, { root, paths }) => {
  await gitExec(root, ['add', '--', ...paths.map(p => relTo(root, p))]);
  return true;
});
ipcMain.handle('git:stageAll', async (_e, root) => { await gitExec(root, ['add', '-A']); return true; });

ipcMain.handle('git:unstage', async (_e, { root, paths }) => {
  for (const p of paths.map(x => relTo(root, x))) {
    try { await gitExec(root, ['restore', '--staged', '--', p]); }
    catch { try { await gitExec(root, ['rm', '--cached', '--', p]); } catch {} }
  }
  return true;
});

ipcMain.handle('git:discard', async (_e, { root, paths }) => {
  const { changes } = parseStatus(await gitExec(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  const map = new Map(changes.map(c => [c.path, c]));
  for (const p of paths.map(x => relTo(root, x))) {
    const c = map.get(p);
    if (!c) continue;
    if (c.x === '?' && c.y === '?') {
      await fsp.rm(path.join(root, p), { recursive: true, force: true });
    } else {
      await gitExec(root, ['checkout', '--', p]).catch(async () => {
        await gitExec(root, ['checkout', 'HEAD', '--', p]);
      });
    }
  }
  return true;
});

ipcMain.handle('git:commit', async (_e, { root, message }) => {
  if (!message || !message.trim()) throw new Error('Commit message is empty');
  try {
    await gitExec(root, ['commit', '-m', message.trim()]);
  } catch (err) {
    if (/nothing to commit/.test(err.message)) throw new Error('Nothing to commit — all changes are already committed');
    if (/please tell me who you are/i.test(err.message))
      throw new Error('Git identity not set. Run in terminal:  git config --global user.name "You"  and  user.email "you@mail.com"  — or use Publish to GitHub (sets it automatically)');
    throw err;
  }
  return true;
});

ipcMain.handle('git:branches', async (_e, root) => {
  const list = (await gitExec(root, ['branch', '--format=%(refname:short)']))
    .split('\n').map(s => s.trim()).filter(Boolean);
  return { list };
});

ipcMain.handle('git:checkout', async (_e, { root, branch, create }) => {
  await gitExec(root, create ? ['checkout', '-b', branch] : ['checkout', branch]);
  return true;
});

ipcMain.handle('git:pull', async (_e, root) => {
  const out = await gitExec(root, ['pull', '--no-edit']);
  return { out };
});

ipcMain.handle('git:push', async (_e, { root, token }) => {
  let branch = (await gitExec(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  if (branch === 'HEAD') branch = 'main';
  const url = (await gitExec(root, ['remote', 'get-url', 'origin']).catch(() => '')).trim();
  let args = ['push', '-u', 'origin', branch];
  if (token) {
    const m = url.match(/github\.com[/:](.+?)(?:\.git)?\/?$/);
    const full = m ? m[1].replace(/\.git$/, '') : null;
    if (full) args = ['push', `https://x-access-token:${token}@github.com/${full}.git`, `${branch}:${branch}`];
  }
  try { await gitExec(root, args); return { ok: true }; }
  catch (err) {
    const msg = sanitize(err.message, token);
    if (/Authentication failed|could not read Username|403/i.test(msg))
      throw new Error('GitHub authentication failed — use "Publish" and provide a valid Personal Access Token (repo scope)');
    throw new Error(msg);
  }
});

ipcMain.handle('git:show', async (_e, { root, p }) => {
  try { return await gitExec(root, ['show', `HEAD:${relTo(root, p)}`]); }
  catch { return ''; }
});

ipcMain.handle('git:init', async (_e, root) => {
  try { await gitExec(root, ['init', '-b', 'main']); }
  catch {
    await gitExec(root, ['init']);
    await gitExec(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']).catch(() => {});
  }
  return true;
});

ipcMain.handle('git:publish', async (_e, { root, token, name, description, isPrivate }) => {
  if (!token || !token.trim()) throw new Error('Personal Access Token is required (repo scope)');
  if (!name || !name.trim()) throw new Error('Repository name is required');
  if (!/^[A-Za-z0-9_.-]+$/.test(name.trim())) throw new Error('Repository name contains invalid characters');
  const repoName = name.trim();
  const cred = (s) => sanitize(s, token);

  try {
    const user = await ghApi('/user', token);

    let isRepo = true;
    try { await gitExec(root, ['rev-parse', '--is-inside-work-tree']); }
    catch { isRepo = false; }

    if (!isRepo) {
      try { await gitExec(root, ['init', '-b', 'main']); }
      catch { await gitExec(root, ['init']); await gitExec(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']); }
    }

    let hasCommit = true;
    try { await gitExec(root, ['rev-parse', '--verify', 'HEAD']); }
    catch { hasCommit = false; }

    if (!fs.existsSync(path.join(root, '.gitignore')))
      await fsp.writeFile(path.join(root, '.gitignore'), GITIGNORE_TPL, 'utf8');

    if (!hasCommit) {
      await gitExec(root, ['add', '-A']);
      let st = await gitExec(root, ['status', '--porcelain']);
      if (!st.trim()) {
        await fsp.writeFile(path.join(root, 'README.md'), `# ${repoName}\n`, 'utf8');
        await gitExec(root, ['add', '-A']);
        st = await gitExec(root, ['status', '--porcelain']);
      }
      if (st.trim()) {
        await gitExec(root, ['-c', `user.name=${user.login}`,
          '-c', `user.email=${user.login}@users.noreply.github.com`,
          'commit', '-m', 'Initial commit']);
      }
    }

    const email = (await gitExec(root, ['config', 'user.email']).catch(() => '')).trim();
    if (!email) {
      await gitExec(root, ['config', 'user.name', user.login]).catch(() => {});
      await gitExec(root, ['config', 'user.email', `${user.login}@users.noreply.github.com`]).catch(() => {});
    }

    const hasHead = await gitExec(root, ['rev-parse', '--verify', 'HEAD'])
      .then(() => true).catch(() => false);
    const cur = (await gitExec(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'main')).trim();
    if (cur !== 'main') {
      if (hasHead) await gitExec(root, ['branch', '-M', 'main']);
      else await gitExec(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']).catch(() => {});
    }

    let full;
    try {
      const created = await ghApi('/user/repos', token, {
        method: 'POST',
        body: JSON.stringify({ name: repoName, description: description || '', private: !!isPrivate, auto_init: false })
      });
      full = created.full_name;
    } catch (err) {
      if (err.status === 422 && /already exists/i.test(err.message))
        throw new Error(`A repository named "${repoName}" already exists on your GitHub account — pick another name`);
      throw err;
    }

    const cleanUrl = `https://github.com/${full}.git`;
    const hasOrigin = await gitExec(root, ['remote']).then(o => o.split('\n').includes('origin')).catch(() => false);
    if (hasOrigin) await gitExec(root, ['remote', 'set-url', 'origin', cleanUrl]);
    else await gitExec(root, ['remote', 'add', 'origin', cleanUrl]);

    try { await gitExec(root, ['push', '-u', `https://x-access-token:${token}@github.com/${full}.git`, 'main']); }
    catch (err) {
      const msg = cred(err.message);
      if (/Authentication failed|403/i.test(msg))
        throw new Error('Repo created, but push failed: token lacks the "repo" scope');
      throw new Error('Repo created, but push failed: ' + msg);
    }

    return { url: `https://github.com/${full}`, full };
  } catch (err) {
    throw new Error(cred(err.message));
  }
});

/* ------------------------------- collab ------------------------------- */
ipcMain.handle('collab:dir', async (_e, room8) => {
  const safe = String(room8 || 'session').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'session';
  const dir = path.join(app.getPath('home'), 'SleepCoding', 'session-' + safe);
  await fsp.mkdir(dir, { recursive: true });
  return { dir };
});

ipcMain.handle('fs:readFileRaw', async (_e, p) => {
  const buf = await fsp.readFile(p);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
});

ipcMain.handle('fs:writeFileRaw', async (_e, p, u8) => {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, Buffer.from(u8));
  return true;
});

/* ------------------------------- window ------------------------------- */
ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:maximize', () => win?.isMaximized() ? win.unmaximize() : win?.maximize());
ipcMain.on('win:close', () => win?.close());
ipcMain.on('win:devtools', () => win?.webContents.toggleDevTools());
ipcMain.on('app:quit', () => {
  if (quitGuard) { clearTimeout(quitGuard); quitGuard = null; }
  forceClose = true;
  if (win) win.close();
});
ipcMain.on('app:cancel-quit', () => { if (quitGuard) { clearTimeout(quitGuard); quitGuard = null; } });
ipcMain.handle('win:isMaximized', () => win?.isMaximized());
ipcMain.handle('app:versions', () => ({ electron: process.versions.electron, node: process.versions.node, chrome: process.versions.chrome }));

/* ------------------------------ lifecycle ----------------------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    buildMenu();
    createSplash();     // instant visual feedback
    createWindow();
    /* failsafe: if the main window never becomes ready, don't hang on splash */
    splashFailsafe = setTimeout(() => {
      if (win && !win.isVisible()) {
        splashProgress(100, 'Starting in recovery mode…');
        closeSplash();
        try { win.show(); } catch {}
      }
    }, 20000);
    powerMonitor.on('on-battery', () => send('power:state', { onBattery: true }));
    powerMonitor.on('on-ac',      () => send('power:state', { onBattery: false }));
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (!win) createWindow(); });
}