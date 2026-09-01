/* global ide, Terminal, FitAddon, monaco, Collab */
'use strict';

/* =============================== helpers =============================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const base = (p) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
const ext = (p) => { const b = base(p), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const rel = (p) => state.root && p.startsWith(state.root) ? p.slice(state.root.length + 1) : p;

const sep = (p) => (p || '').includes('\\') ? '\\' : '/';
const joinP = (dir, name) => { const s = sep(dir); return dir.endsWith(s) ? dir + name : dir + s + name; };
const dirnameP = (p) => {
  const s = sep(p), i = p.lastIndexOf(s);
  if (i <= 0) return p;
  if (s === '\\' && i === 2 && /^[A-Za-z]:/.test(p)) return p.slice(0, 3);
  return p.slice(0, i);
};
const isInsideP = (child, parent) => child.startsWith(parent + sep(parent));
const prettyErr = (err) => String((err && err.message) || err)
  .replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');

/* Collab fallback: if collab.js failed to load, run without collab */
if (typeof window.Collab === 'undefined') {
  window.Collab = {
    init() {}, onLocalEdit() {}, onSaved() {}, onDeleted() {}, onCursor() {},
    renderCursors() {}, markEcho() {}, suppress() {}, isActive: () => false
  };
  console.warn('[sleepcoding] collab.js not loaded — collaboration disabled');
}

/* ======================= diagnostics / error surface =================== */
let appReady = false;
function showBootError(title, lines) {
  const ov = $('#boot-error'); if (!ov) return;
  $('#be-title').textContent = title;
  $('#be-list').innerHTML = lines.filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('');
  ov.classList.remove('hidden');
}
function reportError(lines) {
  if (appReady) toast(lines.join(' — '));
  else showBootError('Startup problem', lines.concat('Press Ctrl+Shift+I to open DevTools for details.'));
}
window.addEventListener('error', e =>
  reportError([`${e.message}  (${(e.filename || '').split(/[\\/]/).pop()}:${e.lineno})`]));
window.addEventListener('unhandledrejection', e =>
  reportError([String((e.reason && e.reason.message) || e.reason)]));

/* ================================ icons ================================ */
const ICONS = {
  files:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3"/></svg>',
  search:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l4.2 4.2"/></svg>',
  git:     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="4.2" cy="3.4" r="1.7"/><circle cx="4.2" cy="12.6" r="1.7"/><circle cx="11.8" cy="3.4" r="1.7"/><path d="M4.2 5.1v5.8M11.8 5.1v1.2c0 1.6-1.3 2.9-2.9 2.9H6.4"/></svg>',
  collab:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="5.5" cy="5" r="2.2"/><circle cx="11" cy="6.5" r="1.8"/><path d="M2 13c0-2 1.6-3.4 3.5-3.4S9 11 9 13M8.7 11.2c.5-.9 1.4-1.4 2.3-1.4 1.7 0 3 1.2 3 3.2"/></svg>',
  preview: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c3 3.2 3 9.2 0 12.4-3-3.2-3-9.2 0-12.4z"/></svg>',
  settings:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="2.6"/><path d="M8 1.2v2.2M8 12.6v2.2M1.2 8h2.2M12.6 8h2.2M3.2 3.2l1.6 1.6M11.2 11.2l1.6 1.6M12.8 3.2l-1.6 1.6M4.8 11.2l-1.6 1.6"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4z"/></svg>',
  folder:  '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3h4.6l1.5 1.7h7v8.3h-13z"/></svg>',
  newFile: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3M8 8v4M6 10h4"/></svg>',
  newDir:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.5 3h4.6l1.5 1.7h7v8.3h-13z"/><path d="M8 7.5v4M6 9.5h4"/></svg>',
  refresh: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.8v2.7h-2.7"/></svg>'
};

const LANG = { js:'javascript', mjs:'javascript', cjs:'javascript', jsx:'javascript',
  ts:'typescript', tsx:'typescript', json:'json', html:'html', htm:'html', vue:'html',
  css:'css', scss:'scss', less:'less', md:'markdown', py:'python', php:'php', rb:'ruby',
  go:'go', rs:'rust', java:'java', c:'c', h:'c', cpp:'cpp', cs:'csharp', sql:'sql',
  xml:'xml', svg:'xml', yaml:'yaml', yml:'yaml', sh:'shell', bat:'bat', ini:'ini',
  lua:'lua', pl:'perl', swift:'swift' };

const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp']);

function fileBadge(name) {
  const m = { js:['JS','#e8d44d'], mjs:['JS','#e8d44d'], cjs:['JS','#e8d44d'], jsx:['JS','#e8d44d'],
    ts:['TS','#3178c6'], tsx:['TS','#3178c6'], json:['{}','#cbcb41'], html:['<>','#e37933'],
    htm:['<>','#e37933'], vue:['V','#41b883'], css:['#','#519aba'], scss:['#','#cd6799'],
    less:['#','#519aba'], md:['M↓','#519aba'], txt:['T','#9e9e9e'], py:['PY','#3572a5'],
    php:['P','#8892bf'], go:['GO','#00add8'], rs:['RS','#dea584'], java:['J','#b07219'],
    c:['C','#a8b9cc'], cpp:['C+','#f34b7d'], cs:['C#','#178600'], sql:['Q','#e38c00'],
    xml:['X','#0060ac'], svg:['S','#ffb13b'], yml:['Y','#cb171e'], yaml:['Y','#cb171e'],
    sh:['$>','#89e051'], bat:['B','#c1f12e'], png:['IMG','#a074c4'], jpg:['IMG','#a074c4'],
    jpeg:['IMG','#a074c4'], gif:['IMG','#a074c4'], webp:['IMG','#a074c4'], ico:['ICO','#a074c4'] };
  const b = m[ext(name)];
  return b ? { text: b[0], color: b[1] } : { text: '·', color: '#888' };
}

function fuzzy(query, text) {
  const q = query.toLowerCase(), t = text.toLowerCase();
  let i = 0, score = 0, last = -1; const hits = [];
  for (const ch of q) {
    const idx = t.indexOf(ch, i);
    if (idx === -1) return null;
    score += idx === last + 1 ? 3 : 1;
    if (idx === 0) score += 2;
    hits.push(idx); last = idx; i = idx + 1;
  }
  return { score, hits };
}

/* ================================ state ================================ */
const DEFAULTS = { autoSave: true, formatOnSave: false, wordWrap: false, minimap: true,
  fontSize: 14, tabSize: 2, fxMode: 'auto', theme: 'dark' };
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('wf-settings') || '{}');
    const merged = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    merged.fontSize = Math.min(28, Math.max(10, Number(merged.fontSize) || DEFAULTS.fontSize));
    merged.tabSize = Math.min(8, Math.max(2, Number(merged.tabSize) || DEFAULTS.tabSize));
    if (!['auto', 'high', 'balanced', 'perf'].includes(merged.fxMode)) merged.fxMode = DEFAULTS.fxMode;
    return merged;
  } catch {
    localStorage.removeItem('wf-settings');
    return { ...DEFAULTS };
  }
}
const state = {
  root: null, rootName: '',
  tabs: new Map(), tabOrder: [], activePath: null,
  expanded: new Set(), selectedPath: null,
  allFiles: null,
  clip: null,
  editing: false, pendingRender: false,
  terminal: { id: null, cwd: '', ready: false, pty: false, xterm: null, fit: null,
    history: [], hIndex: -1, forceLegacy: false, failCount: 0, openedAt: 0, pend: [] },
  previewPort: null,
  git: { repo: false, branch: '', upstream: '', ahead: 0, behind: 0, changes: [], errShown: false },
  gitMap: new Map(),
  fx: { detected: 'high', onBattery: false, focused: true },
  settings: loadSettings()
};
let editor = null;
let diffEditor = null;
let dragPath = null;
let dndData = null;
let dropMarkRow = null;
let pyCmd = null;
const saveTimers = new Map();

/* ------------------------- visual effects engine ----------------------- */
function detectTier() {
  const cores = navigator.hardwareConcurrency || 2;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 2 || mem <= 2) return 'perf';
  if (cores <= 4 || mem <= 4) return 'balanced';
  return 'high';
}
function effectiveTier() {
  const m = state.settings.fxMode;
  if (m && m !== 'auto') return m;
  if (state.fx.onBattery) return state.fx.detected === 'perf' ? 'perf' : 'balanced';
  return state.fx.detected;
}
function applyFx() {
  const tier = effectiveTier();
  document.body.classList.remove('fx-high', 'fx-balanced', 'fx-perf');
  document.body.classList.add('fx-' + tier);
  refreshEditorOptions();
}
function refreshEditorOptions() {
  if (!editor) return;
  const s = state.settings, tier = effectiveTier();
  const common = {
    wordWrap: s.wordWrap ? 'on' : 'off',
    fontSize: s.fontSize,
    minimap: { enabled: s.minimap && tier !== 'perf' }
  };
  let fx;
  if (tier === 'perf') fx = {
    smoothScrolling: false, cursorBlinking: 'solid', cursorSmoothCaretAnimation: 'off',
    renderWhitespace: 'none', occurrencesHighlight: 'off',
    bracketPairColorization: { enabled: false }, guides: { bracketPairs: false },
    stickyScroll: { enabled: false }
  };
  else if (tier === 'balanced') fx = {
    smoothScrolling: true, cursorBlinking: 'blink', cursorSmoothCaretAnimation: 'off',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true }, guides: { bracketPairs: false },
    stickyScroll: { enabled: false }
  };
  else fx = {
    smoothScrolling: true, cursorBlinking: 'smooth', cursorSmoothCaretAnimation: 'on',
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true }, guides: { bracketPairs: true },
    stickyScroll: { enabled: true }
  };
  editor.updateOptions({ ...common, ...fx });
}
let fpsProbed = false;
function fpsProbe() {
  if (fpsProbed || state.settings.fxMode !== 'auto' || state.fx.detected === 'perf') return;
  if (!document.hasFocus()) { setTimeout(fpsProbe, 3000); return; }
  fpsProbed = true;
  let frames = 0, t0 = 0;
  const step = (t) => {
    if (!t0) t0 = t;
    frames++;
    if (frames < 60) return requestAnimationFrame(step);
    const fps = frames / ((t - t0) / 1000);
    logOutput(`FPS probe: ${fps.toFixed(0)} (tier: ${state.fx.detected})`);
    if (fps < 40) {
      state.fx.detected = 'perf';
      applyFx();
      toast('Performance mode enabled — low FPS detected');
    }
  };
  requestAnimationFrame(step);
}

/* --------------------------- tab helpers ------------------------------- */
const tabIsDirty = (t) => (t.isImage || t.type === 'diff') ? false
  : (t.model ? t.model.getAlternativeVersionId() !== t.savedVersion : !!t.dirty);
const getTabText = (t) => t.model ? t.model.getValue() : (t.fallbackText ?? '');

function showPane(name) {
  $('#welcome').classList.toggle('hidden', name !== 'welcome');
  $('#media-view').classList.toggle('hidden', name !== 'media');
  $('#diff-container').classList.toggle('hidden', name !== 'diff');
  $('#fallback-editor').classList.toggle('hidden', name !== 'fallback');
}

/* ================================ toast ================================ */
let toastTimer, toastOutTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  clearTimeout(toastTimer); clearTimeout(toastOutTimer);
  t.classList.remove('hidden', 'out', 'anim');
  void t.offsetWidth;
  t.classList.add('anim');
  toastTimer = setTimeout(() => {
    t.classList.add('out');
    toastOutTimer = setTimeout(() => { t.classList.add('hidden'); t.classList.remove('out', 'anim'); }, 190);
  }, 3000);
}
function logOutput(msg) { $('#output-text').textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`; }

/* =============================== titlebar ============================== */
const MENUS = {
  file: [
    { label: 'New File', run: () => newInline(state.root, false) },
    { label: 'New Folder', run: () => newInline(state.root, true) },
    { sep: true },
    { label: 'Open Folder…', accel: 'Ctrl+O', run: () => openFolderDialog() },
    { sep: true },
    { label: 'Save', accel: 'Ctrl+S', run: () => saveActive() },
    { label: 'Save As…', accel: 'Ctrl+Shift+S', run: () => saveAsActive() },
    { label: 'Save All', run: () => saveAll() },
    { label: 'Revert File', run: () => revertActive() },
    { sep: true },
    { label: 'Close Tab', accel: 'Ctrl+W', run: () => closeActive() },
    { label: 'Exit', run: () => ide.winClose() },
  ],
  edit: [
    { label: 'Undo', accel: 'Ctrl+Z', run: () => editor?.trigger('menu', 'undo') },
    { label: 'Redo', accel: 'Ctrl+Y', run: () => editor?.trigger('menu', 'redo') },
    { sep: true },
    { label: 'Find', accel: 'Ctrl+F', run: () => editor?.trigger('menu', 'actions.find') },
    { label: 'Replace', accel: 'Ctrl+H', run: () => editor?.trigger('menu', 'editor.action.startFindReplaceAction') },
    { sep: true },
    { label: 'Format Document', accel: 'Shift+Alt+F', run: () => formatActive() },
  ],
  view: [
    { label: 'Command Palette…', accel: 'Ctrl+Shift+P', run: () => openPalette('command') },
    { label: 'Quick Open File…', accel: 'Ctrl+P', run: () => openPalette('file') },
    { sep: true },
    { label: 'Toggle Sidebar', accel: 'Ctrl+B', run: () => toggleSidebar() },
    { label: 'Toggle Terminal', accel: 'Ctrl+`', run: () => togglePanel() },
    { label: 'Toggle Word Wrap', run: () => setSettings({ wordWrap: !state.settings.wordWrap }) },
    { sep: true },
    { label: 'Toggle Performance Mode', run: () =>
      setSettings({ fxMode: state.settings.fxMode === 'perf' ? 'auto' : 'perf' }) },
    { sep: true },
    { label: 'Developer Tools', run: () => ide.toggleDevtools() },
  ],
  help: [
    { label: 'Welcome', run: () => { showPane('welcome'); renderRecents(); } },
    { label: 'About', run: () => toast('SleepCoding IDE 1.7 — Electron + Monaco + P2P Collab') },
  ]
};

let menuOpen = null;
function dismissPop(el) {
  if (el._closing) return;
  el._closing = true;
  el.classList.add('closing');
  setTimeout(() => el.remove(), 120);
}
function hideMenus() {
  $$('.dropdown').forEach(d => dismissPop(d));
  $$('.menu-btn').forEach(b => b.classList.remove('open'));
  menuOpen = null;
}
function toggleMenu(name, btn) {
  if (menuOpen === name) return hideMenus();
  hideMenus(); menuOpen = name; btn.classList.add('open');
  const d = document.createElement('div');
  d.className = 'dropdown';
  const items = [...MENUS[name]];
  if (name === 'file') {
    const rec = getRecents();
    if (rec.length) items.push({ sep: true }, { label: 'Open Recent', off: true },
      ...rec.slice(0, 5).map(p => ({ label: base(p), run: () => openPath(p) })));
  }
  for (const it of items) {
    if (it.sep) { const s = document.createElement('div'); s.className = 'ctx-sep'; d.appendChild(s); continue; }
    const b = document.createElement('button');
    b.className = 'ctx-item';
    if (it.off) b.disabled = true;
    b.innerHTML = `<span>${esc(it.label)}</span><span class="ctx-accel">${it.accel || ''}</span>`;
    b.onclick = () => { hideMenus(); it.run(); };
    d.appendChild(b);
  }
  const r = btn.getBoundingClientRect();
  d.style.left = r.left + 'px';
  d.style.top = (r.bottom + 4) + 'px';
  document.body.appendChild(d);
}

/* ============================ context menu ============================= */
function showCtx(x, y, items) {
  const m = $('#ctx-menu');
  m._closing = false;
  m.classList.remove('closing');
  m.innerHTML = '';
  for (const it of items) {
    if (it.sep) { const s = document.createElement('div'); s.className = 'ctx-sep'; m.appendChild(s); continue; }
    const b = document.createElement('button');
    b.className = 'ctx-item';
    b.innerHTML = `<span>${esc(it.label)}</span><span class="ctx-accel">${it.accel || ''}</span>`;
    b.onclick = () => { hideCtx(); it.run(); };
    m.appendChild(b);
  }
  m.classList.remove('hidden');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
function hideCtx() {
  const m = $('#ctx-menu');
  if (m.classList.contains('hidden') || m._closing) return;
  m._closing = true;
  m.classList.add('closing');
  setTimeout(() => { m.classList.add('hidden'); m.classList.remove('closing'); m._closing = false; }, 110);
}

/* ============================ recent folders =========================== */
function getRecents() { try { return JSON.parse(localStorage.getItem('wf-recent') || '[]'); } catch { return []; } }
function pushRecent(p) {
  const r = getRecents().filter(x => x.toLowerCase() !== String(p).toLowerCase());
  r.unshift(p);
  localStorage.setItem('wf-recent', JSON.stringify(r.slice(0, 8)));
}
function renderRecents() {
  const list = getRecents();
  const box = $('#welcome-recent'), wrap = $('#welcome-recent-list');
  if (!box) return;
  if (!list.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  wrap.innerHTML = '';
  for (const p of list.slice(0, 5)) {
    const b = document.createElement('button');
    b.className = 'recent-item';
    b.innerHTML = `<span class="badge" style="color:#519aba">DIR</span><span>${esc(base(p))}</span><span class="dim recent-path">${esc(p)}</span>`;
    b.onclick = () => openPath(p);
    wrap.appendChild(b);
  }
}

/* ============================== explorer =============================== */
async function openFolderDialog() {
  const p = await ide.openFolder();
  if (p) await setWorkspace(p);
}
async function openPath(p) {
  const res = await ide.openPath(p);
  if (!res) return;
  if (res.error) return toast(res.error);
  await setWorkspace(res);
}
async function setWorkspace(rootPath) {
  if (!rootPath) return false;

  // Switching projects must not leave tabs/models from the previous workspace behind.
  if (state.root && rootPath !== state.root) {
    const dirty = [...state.tabs.values()].filter(t => tabIsDirty(t));
    if (dirty.length) {
      const ok = confirm(`${dirty.length} unsaved file(s) in the current workspace.\n\nSave before opening another folder?`);
      if (!ok) return false;
      for (const t of dirty) await saveTab(t.path);
    }
    for (const p of [...state.tabOrder]) closeTab(p, true);
  }

  state.root = rootPath; state.rootName = base(rootPath);
  state.expanded = new Set([rootPath]);
  state.allFiles = null; state.selectedPath = null; state.clip = null;
  state.git = { repo: false, branch: '', upstream: '', ahead: 0, behind: 0, changes: [], errShown: false };
  state.gitMap = new Map();
  pushRecent(rootPath);
  $('#tb-title').textContent = `${state.rootName} — SleepCoding`;
  $('#btn-open-folder').classList.add('hidden');
  $('#welcome').classList.add('hidden');
  if (state.terminal.id) ide.ptyDispose(state.terminal.id);
  state.terminal = { id: null, cwd: rootPath, ready: false, pty: false, xterm: null, fit: null,
    history: state.terminal.history, hIndex: 0, forceLegacy: false, failCount: 0, openedAt: 0, pend: [] };
  $('#term-output').textContent = '';
  /* terminal is lazy now — created when first shown (faster startup, less idle load) */
  await renderTree();
  refreshGit();
  updateStatus();
  saveSessionSoon();
  logOutput(`Workspace: ${rootPath}`);
  if (typeof renderPackages === 'function') renderPackages();
  return true;
}

async function renderTree() {
  const tree = $('#filetree');
  const sc = tree.scrollTop;
  tree.innerHTML = '';
  if (!state.root) {
    $('#workspace-bar').hidden = true;
    tree.innerHTML = '<div class="tree-empty">Open a folder to start working.</div>';
    return;
  }
  $('#workspace-bar').hidden = false;
  $('#ws-label').textContent = state.rootName;
  const rootRow = treeRow({ name: state.rootName, path: state.root, isDir: true }, 0);
  tree.appendChild(rootRow);
  if (state.expanded.has(state.root)) await expandDir(state.root, rootRow);
  tree.scrollTop = sc;
}

const findRow = (p) => $$('#filetree .tree-row').find(r => r.dataset.path === p);

function treeRow(item, depth) {
  const row = document.createElement('div');
  row.className = 'tree-row';
  row.dataset.path = item.path; row.dataset.depth = depth;
  row.dataset.isDir = item.isDir ? '1' : '';
  if (state.selectedPath === item.path) row.classList.add('selected');
  row.style.paddingLeft = (8 + depth * 12) + 'px';
  const g = state.gitMap.get(item.path);
  const gitMark = (!item.isDir && g)
    ? `<span class="git-badge g-${esc(g)}">${esc(g)}</span>` : '';
  if (item.isDir) {
    row.innerHTML = `<span class="twistie ${state.expanded.has(item.path) ? 'open' : ''}">${ICONS.chevron}</span>
      <span class="badge">${ICONS.folder}</span><span class="label">${esc(item.name)}</span>${gitMark}`;
  } else {
    const b = fileBadge(item.name);
    row.innerHTML = `<span class="twistie leaf"></span>
      <span class="badge" style="color:${b.color}">${b.text}</span><span class="label">${esc(item.name)}</span>${gitMark}`;
  }
  row.addEventListener('click', (e) => {
    if (state.editing || e.target.tagName === 'INPUT') return;
    state.selectedPath = item.path;
    $$('#filetree .tree-row.selected').forEach(x => x.classList.remove('selected'));
    row.classList.add('selected');
    item.isDir ? toggleDir(item.path, row) : openFile(item.path);
  });
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    state.selectedPath = item.path;
    $$('#filetree .tree-row.selected').forEach(x => x.classList.remove('selected'));
    row.classList.add('selected');
    itemCtxMenu(e, item);
  });
  enableTreeDnD(row, item);
  return row;
}

function itemCtxMenu(e, item) {
  const dir = item.isDir ? item.path : dirnameP(item.path);
  showCtx(e.clientX, e.clientY, [
    ...(item.isDir ? [
      { label: 'New File…', run: () => newInline(item.path, false) },
      { label: 'New Folder…', run: () => newInline(item.path, true) },
      { sep: true },
    ] : [{ label: 'Open', run: () => openFile(item.path) }, { sep: true }]),
    { label: 'Copy', accel: 'Ctrl+C', run: () => clipCopy(false) },
    { label: 'Cut', accel: 'Ctrl+X', run: () => clipCopy(true) },
    { label: item.isDir ? 'Paste into folder' : 'Paste here', run: () => pasteInto(dir) },
    { label: 'Duplicate', run: () => duplicateItem(item.path) },
    { sep: true },
    { label: 'Rename…', accel: 'F2', run: () => beginRename(item.path) },
    { label: 'Delete', accel: 'Del', run: () => deleteItem(item.path) },
    { sep: true },
    { label: 'Copy Path', run: () => navigator.clipboard.writeText(item.path) },
    { label: 'Copy Relative Path', run: () => navigator.clipboard.writeText(rel(item.path)) },
    { label: 'Reveal in Explorer', run: () => ide.reveal(item.path) },
  ]);
}

async function duplicateItem(p) {
  try { await ide.duplicate(p); state.allFiles = null; await renderTree(); }
  catch (err) { toast(prettyErr(err)); }
}

function clipCopy(cut) {
  if (!state.selectedPath) return;
  state.clip = { mode: cut ? 'cut' : 'copy', paths: [state.selectedPath] };
  toast((cut ? 'Cut: ' : 'Copied: ') + base(state.selectedPath));
}
async function pasteInto(dir) {
  if (!dir) return;
  if (!state.clip || !state.clip.paths.length) return toast('Clipboard is empty');
  try {
    const res = await ide.paste({ dstDir: dir, mode: state.clip.mode, paths: state.clip.paths });
    if (state.clip.mode === 'cut') state.clip = null;
    state.allFiles = null;
    await renderTree(); refreshGit();
    if (res.length) logOutput(`Pasted ${res.length} item(s) → ${rel(dir) || state.rootName}`);
  } catch (err) { toast(prettyErr(err)); }
}
function selTargetDir() {
  const row = findRow(state.selectedPath);
  if (row && row.dataset.isDir === '1') return state.selectedPath;
  return dirnameP(state.selectedPath);
}
function collapseAll() {
  if (!state.root) return;
  state.expanded = new Set([state.root]);
  renderTree();
}

async function toggleDir(p, row) {
  if (state.editing) return;
  if (state.expanded.has(p)) {
    state.expanded.delete(p);
    row.querySelector('.twistie').classList.remove('open');
    const d = Number(row.dataset.depth);
    let n = row.nextElementSibling;
    while (n && Number(n.dataset.depth) > d) { const nx = n.nextElementSibling; n.remove(); n = nx; }
    saveSessionSoon();
  } else {
    state.expanded.add(p);
    row.querySelector('.twistie').classList.add('open');
    await expandDir(p, row);
    saveSessionSoon();
  }
}

async function expandDir(dirPath, afterRow) {
  let items;
  try { items = await ide.readDir(dirPath); } catch { return; }
  const depth = Number(afterRow.dataset.depth) + 1;
  let anchor = afterRow;
  for (const it of items) {
    const r = treeRow(it, depth);
    anchor.after(r); anchor = r;
    if (it.isDir && state.expanded.has(it.path)) await expandDir(it.path, r);
  }
}


/* -------------------------- inline create/rename ----------------------- */
function endEditing() {
  state.editing = false;
  if (state.pendingRender) {
    state.pendingRender = false;
    state.allFiles = null;
    renderTree(); refreshGit();
  }
}

async function newInline(parentPath, isDir) {
  if (!state.root) return toast('Open a folder first');
  if (state.editing) return;
  state.editing = true;
  try {
    if (!parentPath) parentPath = state.root;
    if (!state.expanded.has(parentPath)) {
      state.expanded.add(parentPath);
      const prow = findRow(parentPath);
      if (prow) await expandDir(parentPath, prow);
      else await renderTree();
    }
    let anchor = findRow(parentPath);
    if (!anchor) { await renderTree(); anchor = findRow(parentPath); }
    if (!anchor) { endEditing(); return; }

    const depth = Number(anchor.dataset.depth) + 1;
    const row = document.createElement('div');
    row.className = 'tree-row editing';
    row.dataset.depth = depth;
    row.style.paddingLeft = (8 + depth * 12) + 'px';
    row.innerHTML = `<span class="twistie leaf"></span><span class="badge" style="color:#888">${isDir ? '▸' : '·'}</span>`;
    const input = document.createElement('input');
    input.placeholder = isDir ? 'folder name…' : 'file name…';
    row.appendChild(input);
    anchor.after(row);
    input.focus();

    let finished = false;
    const finish = () => { if (finished) return; finished = true; row.remove(); endEditing(); };
    const commit = async () => {
      if (finished) return;
      const name = input.value.trim();
      finish();
      if (!name) return;
      if (/[\\/:*?"<>|]/.test(name)) return toast('Name contains invalid characters');
      try {
        const p = isDir ? await ide.createDir(parentPath, name)
                        : await ide.createFile(parentPath, name);
        state.allFiles = null;
        await renderTree(); refreshGit();
        if (!isDir) openFile(p);
      } catch (err) { toast(prettyErr(err)); }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(); }
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
    input.addEventListener('blur', () => commit());
  } catch (err) { endEditing(); toast(prettyErr(err)); }
}

function beginRename(p) {
  if (state.editing) return;
  const row = findRow(p);
  const label = row && row.querySelector('.label');
  if (!label) return;
  state.editing = true; state.selectedPath = p;
  const old = label.textContent;
  label.innerHTML = '';
  const input = document.createElement('input');
  input.value = old; label.appendChild(input);
  input.focus(); input.select();
  let finished = false;
  const finish = () => { if (finished) return; finished = true; label.textContent = old; endEditing(); };
  const commit = async () => {
    if (finished) return;
    const name = input.value.trim();
    if (!name || name === old) return finish();
    finished = true;
    if (/[\\/:*?"<>|]/.test(name)) { finish(); return toast('Name contains invalid characters'); }
    label.textContent = old;
    endEditing();
    try {
      const to = await ide.rename(p, name);
      retargetTabsPrefix(p, to);
      state.allFiles = null;
      await renderTree(); refreshGit();
      if (state.selectedPath === p) state.selectedPath = to;
    } catch (err) { toast(prettyErr(err)); label.textContent = old; }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(); }
  });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
  input.addEventListener('blur', () => commit());
}

async function deleteItem(p) {
  if (!p) return;
  if (state.selectedPath === p) state.selectedPath = null;
  if (!confirm(`Delete "${base(p)}"? This cannot be undone.`)) return;
  try { await ide.remove(p); Collab.onDeleted(p); } catch (err) { toast(prettyErr(err)); }
}

/* ======================= drag & drop (explorer) ======================== */
function clearDropMark() { if (dropMarkRow) { dropMarkRow.classList.remove('drop-into'); dropMarkRow = null; } }
function markDrop(row) { if (dropMarkRow !== row) { clearDropMark(); dropMarkRow = row; row.classList.add('drop-into'); } }

function enableTreeDnD(row, item) {
  row.draggable = true;
  row.addEventListener('dragstart', (e) => {
    dndData = { path: item.path, isDir: item.isDir };
    e.dataTransfer.effectAllowed = 'copyMove';
    try { e.dataTransfer.setData('text/plain', item.path); } catch {}
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => { row.classList.remove('dragging'); clearDropMark(); dndData = null; });
  row.addEventListener('dragover', (e) => {
    const extFiles = e.dataTransfer.types.includes('Files');
    if (!dndData && !extFiles) return;
    const dir = item.isDir ? item.path : dirnameP(item.path);
    if (dndData && (dndData.path === dir || isInsideP(dir, dndData.path) || dirnameP(dndData.path) === dir)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = dndData ? 'move' : 'copy';
    markDrop(row);
  });
  row.addEventListener('dragleave', () => { if (dropMarkRow === row) clearDropMark(); });
  row.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation();
    clearDropMark();
    const dir = item.isDir ? item.path : dirnameP(item.path);
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      await importExternalFiles([...e.dataTransfer.files], dir);
      dndData = null;
      return;
    }
    if (!dndData) return;
    const src = dndData.path; dndData = null;
    if (src === dir || isInsideP(dir, src) || dirnameP(src) === dir) return;
    await doMove(src, dir);
  });
}

async function doMove(src, dstDir) {
  try {
    const dest = await ide.move(src, dstDir);
    retargetTabsPrefix(src, dest);
    state.allFiles = null;
    await renderTree(); refreshGit();
    logOutput(`Moved: ${base(src)} → ${rel(dstDir) || state.rootName}`);
  } catch (err) { toast(prettyErr(err)); }
}

async function importExternalFiles(files, dstDir) {
  let n = 0;
  for (const f of files) {
    const src = f.path;
    if (!src) continue;
    try { await ide.copyInto(src, dstDir); n++; }
    catch (err) { toast(prettyErr(err)); }
  }
  if (n) {
    state.allFiles = null;
    await renderTree(); refreshGit();
    toast(`Imported ${n} item(s)`);
    logOutput(`Imported ${n} item(s) → ${rel(dstDir) || state.rootName}`);
  }
}

/* ============================ tabs + editor ============================ */
function langFor(p) { return LANG[ext(p)] || 'plaintext'; }

function makeTextTab(p, content) {
  const uri = monaco.Uri.file(p);
  let model = monaco.editor.getModel(uri);
  if (!model) model = monaco.editor.createModel(content, langFor(p), uri);
  model.updateOptions({ tabSize: state.settings.tabSize, insertSpaces: true });
  const tab = { path: p, name: base(p), model, savedVersion: model.getAlternativeVersionId(), viewState: null };
  model.onDidChangeContent(() => { updateDirtyMarker(p); if (state.settings.autoSave) scheduleAutoSave(p); Collab.onLocalEdit(p); });
  return tab;
}

function retargetTab(tab, np) {
  const oldP = tab.path;
  const wasDirty = tabIsDirty(tab);
  state.tabs.delete(oldP);
  tab.path = np; tab.name = base(np);
  if (tab.model) {
    const content = tab.model.getValue();
    const vs = (state.activePath === oldP && editor) ? editor.saveViewState() : tab.viewState;
    tab.model.dispose();
    const uri = monaco.Uri.file(np);
    tab.model = monaco.editor.getModel(uri) || monaco.editor.createModel(content, langFor(np), uri);
    tab.model.updateOptions({ tabSize: state.settings.tabSize, insertSpaces: true });
    tab.savedVersion = wasDirty ? -1 : tab.model.getAlternativeVersionId();
    tab.model.onDidChangeContent(() => { updateDirtyMarker(tab.path); if (state.settings.autoSave) scheduleAutoSave(tab.path); Collab.onLocalEdit(tab.path); });
    tab.viewState = vs;
    if (state.activePath === oldP) { state.activePath = np; if (editor) editor.setModel(tab.model); }
  } else {
    tab.dirty = wasDirty;
  }
  state.tabs.set(np, tab);
  state.tabOrder = state.tabOrder.map(x => x === oldP ? np : x);
  if (state.activePath === oldP) renderBreadcrumbs();
}

function retargetTabsPrefix(oldP, newP) {
  const s = sep(oldP);
  for (const [tp, tab] of Array.from(state.tabs)) {
    let np = null;
    if (tp === oldP) np = newP;
    else if (tp.startsWith(oldP + s)) np = newP + tp.slice(oldP.length);
    if (np) retargetTab(tab, np);
  }
  renderTabs();
}

async function openFile(p) {
  if (state.tabs.has(p)) return activateTab(p);
  try {
    const res = await ide.readFile(p);
    if (res.binary) {
      if (IMG_EXT.has(ext(p))) return openImage(p);
      return toast('Binary file — cannot open in editor');
    }
    let tab;
    if (typeof monaco !== 'undefined' && monaco.editor) {
      tab = makeTextTab(p, res.content);
    } else {
      tab = { path: p, name: base(p), fallbackText: res.content, dirty: false, viewState: null };
    }
    state.tabs.set(p, tab);
    state.tabOrder.push(p);
    renderTabs(); activateTab(p);
    saveSessionSoon();
  } catch (err) { toast('Cannot open: ' + prettyErr(err)); }
}

async function openImage(p) {
  if (!state.tabs.has(p)) {
    state.tabs.set(p, { path: p, name: base(p), isImage: true });
    state.tabOrder.push(p);
    renderTabs();
  }
  activateTab(p);
}

async function openDiff(filePath) {
  const key = 'diff:' + filePath;
  if (state.tabs.has(key)) return activateTab(key);
  try {
    const g = state.gitMap.get(filePath) || '';
    let orig = '';
    if (g && !g.startsWith('?')) {
      try { orig = await ide.gitShow(state.root, filePath); } catch {}
    }
    const res = await ide.readFile(filePath);
    if (res.binary) return toast('Binary file — no diff view');
    const lang = langFor(filePath);
    const mOrig = monaco.editor.createModel(orig, lang, monaco.Uri.file(filePath + ' ~head'));
    const mMod  = monaco.editor.createModel(res.content, lang, monaco.Uri.file(filePath + ' ~work'));
    const tab = { path: key, filePath, type: 'diff', name: base(filePath) + ' (diff)',
      models: { original: mOrig, modified: mMod } };
    state.tabs.set(key, tab);
    state.tabOrder.push(key);
    renderTabs(); activateTab(key);
  } catch (err) { toast(prettyErr(err)); }
}

function activateTab(p) {
  const tab = state.tabs.get(p);
  if (!tab) return;
  const cur = state.tabs.get(state.activePath);
  if (cur && cur.model && editor) cur.viewState = editor.saveViewState();
  state.activePath = p;

  if (tab.type === 'diff') {
    if (editor) editor.setModel(null);
    showPane('diff');
    if (!diffEditor) {
      diffEditor = monaco.editor.createDiffEditor($('#diff-container'), {
        theme: 'vs-dark', automaticLayout: true, readOnly: true,
        renderSideBySide: true, fontSize: state.settings.fontSize,
        fontFamily: 'Consolas, "Courier New", monospace', minimap: { enabled: false },
        scrollBeyondLastLine: false
      });
    }
    diffEditor.setModel({ original: tab.models.original, modified: tab.models.modified });
  } else if (tab.isImage) {
    if (editor) editor.setModel(null);
    showPane('media');
    if (!tab.dataUrl) ide.readFileDataUrl(p).then(u => { tab.dataUrl = u; $('#media-img').src = u; });
    else $('#media-img').src = tab.dataUrl;
  } else if (tab.model && editor) {
    diffEditor?.setModel(null);
    editor.setModel(tab.model);
    if (tab.viewState) editor.restoreViewState(tab.viewState);
    editor.focus();
    showPane('code');
  } else {
    $('#fallback-editor').value = getTabText(tab);
    showPane('fallback');
  }
  renderTabs(); renderBreadcrumbs(); updateStatus(); updateRunButton();
  Collab.renderCursors();
}

function renderTabs() {
  const bar = $('#tabs');
  bar.innerHTML = '';
  for (const p of state.tabOrder) {
    const t = state.tabs.get(p);
    if (!t) continue;
    const dirty = tabIsDirty(t);
    const el = document.createElement('div');
    el.className = 'tab' + (p === state.activePath ? ' active' : '');
    el.draggable = true;
    el.dataset.path = p;
    el.title = t.filePath || p;
    const b = t.isImage ? { text: 'IMG', color: '#a074c4' } : fileBadge(t.name);
    el.innerHTML = `<span class="badge" style="color:${b.color}">${b.text}</span>
      <span class="tab-name">${esc(t.name)}</span>
      <span class="tab-dirty ${dirty ? '' : 'hidden'}">●</span>
      <button class="tab-close" title="Close">✕</button>`;
    el.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(p); } });
    el.addEventListener('click', (e) => { if (!e.target.closest('.tab-close')) activateTab(p); });
    el.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(p); });
    el.addEventListener('dragstart', () => { dragPath = p; });
    el.addEventListener('dragover', (e) => {
      if (!dragPath || dragPath === p) return;
      e.preventDefault();
      if (renderTabs._last === p) return;
      renderTabs._last = p;
      const from = state.tabOrder.indexOf(dragPath), to = state.tabOrder.indexOf(p);
      if (from < 0 || to < 0) return;
      state.tabOrder.splice(to, 0, state.tabOrder.splice(from, 1)[0]);
      renderTabs();
    });
    el.addEventListener('dragend', () => { dragPath = null; renderTabs._last = null; });
    bar.appendChild(el);
  }
}
renderTabs._last = null;

function updateDirtyMarker(p) {
  const t = state.tabs.get(p); if (!t) return;
  const el = $$('#tabs .tab').find(x => x.dataset.path === p);
  if (!el) return;
  el.querySelector('.tab-dirty').classList.toggle('hidden', !tabIsDirty(t));
}

async function closeTab(p, force = false) {
  const tab = state.tabs.get(p);
  if (!tab) return;
  if (!force && tabIsDirty(tab)) {
    if (confirm(`Save changes to "${tab.name}"?\nOK = Save and close, Cancel = Close without saving`)) await saveTab(p);
  }
  clearTimeout(saveTimers.get(p)); saveTimers.delete(p);
  if (tab.model) tab.model.dispose();
  if (tab.models) { tab.models.original.dispose(); tab.models.modified.dispose(); }
  state.tabs.delete(p);
  state.tabOrder = state.tabOrder.filter(x => x !== p);
  if (state.activePath === p) {
    const next = state.tabOrder[state.tabOrder.length - 1];
    if (next) activateTab(next);
    else {
      state.activePath = null;
      if (editor) editor.setModel(null);
      diffEditor?.setModel(null);
      showPane('welcome');
      $('#breadcrumbs').innerHTML = '<span id="bc-spacer" class="bc-spacer"></span><button id="btn-run" class="run-btn hidden" title="Run (F5)">▶ Run</button>';
      $('#btn-run').onclick = runActive;
      renderTabs(); updateStatus(); updateRunButton();
    }
  } else renderTabs();
  saveSessionSoon();
}
const closeActive = () => state.activePath && closeTab(state.activePath);

function scheduleAutoSave(p) {
  clearTimeout(saveTimers.get(p));
  saveTimers.set(p, setTimeout(() => saveTab(p), 800));
}

async function saveTab(p) {
  const tab = state.tabs.get(p);
  if (!tab || tab.isImage || tab.type === 'diff') return;
  try {
    if (state.settings.formatOnSave && tab.model && editor && p === state.activePath)
      await editor.getAction('editor.action.formatDocument').run();
    const text = getTabText(tab);
    rememberSnapshot(p, text);
    await ide.writeFile(p, text);
    if (tab.model) tab.savedVersion = tab.model.getAlternativeVersionId();
    else tab.dirty = false;
    clearTimeout(saveTimers.get(p)); saveTimers.delete(p);
    updateDirtyMarker(p);
    Collab.onSaved(p, text);
    if (p === state.activePath) flashStatus('✓ Saved');
  } catch (err) { toast('Save failed: ' + prettyErr(err)); }
}
const saveActive = () => state.activePath && saveTab(state.activePath);

async function saveAsActive() {
  const p = state.activePath;
  const tab = p && state.tabs.get(p);
  if (!tab || tab.isImage || tab.type === 'diff') return;
  try {
    const suggested = tab.path || (state.root ? joinP(state.root, tab.name) : tab.name);
    const np = await ide.saveAs({ defaultPath: suggested, content: getTabText(tab) });
    if (!np) return;
    clearTimeout(saveTimers.get(tab.path));
    if (tab.path !== np) retargetTab(tab, np);
    else { if (tab.model) tab.savedVersion = tab.model.getAlternativeVersionId(); else tab.dirty = false; }
    renderTabs(); renderBreadcrumbs(); updateDirtyMarker(tab.path);
    flashStatus('✓ Saved');
  } catch (err) { toast(prettyErr(err)); }
}

async function saveAll() {
  const dirty = [...state.tabs.values()].filter(t => tabIsDirty(t));
  for (const t of dirty) await saveTab(t.path);
  if (dirty.length) flashStatus(`✓ Saved ${dirty.length}`);
}

async function revertActive() {
  const p = state.activePath;
  const tab = p && state.tabs.get(p);
  if (!tab || tab.isImage || tab.type === 'diff') return;
  try {
    const res = await ide.readFile(tab.path);
    if (res.binary) return;
    if (tab.model) {
      tab.model.pushEditOperations([], [{ range: tab.model.getFullModelRange(), text: res.content }], () => null);
      tab.savedVersion = tab.model.getAlternativeVersionId();
    } else {
      tab.fallbackText = res.content; tab.dirty = false;
      if (p === state.activePath) $('#fallback-editor').value = res.content;
    }
    clearTimeout(saveTimers.get(tab.path));
    updateDirtyMarker(tab.path);
    flashStatus('↺ Reverted');
  } catch (err) { toast(prettyErr(err)); }
}

async function formatActive() {
  if (editor && editor.getModel()) await editor.getAction('editor.action.formatDocument').run();
}

function renderBreadcrumbs() {
  const bc = $('#breadcrumbs');
  if (!bc.querySelector('#btn-run')) {
    bc.innerHTML = '<span id="bc-spacer" class="bc-spacer"></span><button id="btn-run" class="run-btn hidden" title="Run (F5)">▶ Run</button>';
    $('#btn-run').onclick = runActive;
  }
  const t = state.tabs.get(state.activePath);
  const crumb = bc.querySelector('.crumbs');
  const html = t ? (() => {
    const p = t.filePath || t.path;
    const parts = rel(p).split(/[\\/]/);
    return parts.map((s, i) =>
      `<span class="crumb">${esc(s)}</span>${i < parts.length - 1 ? '<span class="crumb-sep">›</span>' : ''}`).join('');
  })() : '';
  if (crumb) crumb.innerHTML = html;
  else bc.insertAdjacentHTML('afterbegin', `<span class="crumbs">${html}</span>`);
}

async function reloadIfClean(p) {
  const tab = state.tabs.get(p);
  if (!tab || tab.isImage || tab.type === 'diff' || tabIsDirty(tab)) return;
  const res = await ide.readFile(p);
  if (res.binary) return;
  if (tab.model) {
    if (tab.model.getValue() === res.content) return;
    tab.model.pushEditOperations([], [{ range: tab.model.getFullModelRange(), text: res.content }], () => null);
    tab.savedVersion = tab.model.getAlternativeVersionId();
  } else {
    tab.fallbackText = res.content;
    if (p === state.activePath) $('#fallback-editor').value = res.content;
  }
}

/* ============================== run system ============================= */
const RUN_EXT = { py: 'python', js: 'node', mjs: 'node', cjs: 'node', html: 'preview', htm: 'preview' };
function runKind(p) { return RUN_EXT[ext(p)] || null; }

function updateRunButton() {
  const btn = $('#btn-run');
  if (!btn) return;
  const tab = state.tabs.get(state.activePath);
  const p = tab && !tab.isImage && tab.type !== 'diff' ? (tab.filePath || tab.path) : null;
  const kind = p && runKind(p);
  if (!kind) { btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
  btn.textContent = kind === 'python' ? '▶ Run Python'
    : kind === 'node' ? '▶ Run Node' : '▶ Preview';
}

async function runActive() {
  const tab = state.tabs.get(state.activePath);
  if (!tab || tab.isImage || tab.type === 'diff') return toast('Open a runnable file first (.py / .js / .html)');
  const p = tab.filePath || tab.path;
  const kind = runKind(p);
  if (!kind) return toast('No run configuration for this file type');
  if (tabIsDirty(tab)) await saveTab(tab.path);
  togglePanel(true);
  if (kind === 'preview') return runHtml(p);
  if (kind === 'python') {
    if (!pyCmd) {
      try { pyCmd = (await ide.pythonCmd()).cmd; } catch { pyCmd = null; }
      if (!pyCmd) return toast('Python not found — install it from python.org, then reopen the IDE');
    }
    logOutput(`Run: ${pyCmd} "${p}"`);
    return execTerm(`${pyCmd} "${p}"`);
  }
  if (kind === 'node') {
    logOutput(`Run: node "${p}"`);
    return execTerm(`node "${p}"`);
  }
}

async function runHtml(p) {
  if (!state.previewPort) await startPreview();
  if (!state.previewPort) return;
  const relPath = rel(p).replace(/\\/g, '/');
  $('#preview-frame').src = `http://localhost:${state.previewPort}/${encodeURI(relPath)}`;
  $('#preview-pane').classList.remove('hidden');
}

/* ================================ search =============================== */
const runSearch = debounce(async () => {
  const q = $('#search-input').value.trim();
  const box = $('#search-results');
  if (!q || !state.root) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="search-info">Searching…</div>';
  const res = await ide.search({
    root: state.root, query: q,
    isRegex: $('#btn-search-regex').classList.contains('on'),
    caseSensitive: $('#btn-search-case').classList.contains('on'),
    maxResults: 1000
  });
  if (res.error) { box.innerHTML = `<div class="search-info">${esc(res.error)}</div>`; return; }
  box.innerHTML = '';
  let total = 0;
  for (const g of res.results) {
    total += g.matches.length;
    const h = document.createElement('div');
    h.className = 'search-file';
    const b = fileBadge(g.file);
    h.innerHTML = `<span class="badge" style="color:${b.color}">${b.text}</span> ${esc(base(g.file))} <span class="dim">(${g.matches.length})</span>`;
    box.appendChild(h);
    for (const m of g.matches) {
      const row = document.createElement('div');
      row.className = 'search-match';
      const before = m.text.slice(0, m.col), mid = m.text.slice(m.col, m.col + m.len), after = m.text.slice(m.col + m.len);
      row.innerHTML = `<span class="dim">${m.line}:</span> ${esc(before)}<mark>${esc(mid)}</mark>${esc(after)}`;
      row.addEventListener('click', async () => {
        await openFile(g.file);
        if (editor) {
          editor.setPosition({ lineNumber: m.line, column: m.col + 1 });
          editor.revealPositionInCenter({ lineNumber: m.line, column: m.col + 1 });
          editor.focus();
        }
      });
      box.appendChild(row);
    }
  }
  if (!res.results.length) box.innerHTML = '<div class="search-info">No results found.</div>';
  else box.prepend(Object.assign(document.createElement('div'), {
    className: 'search-info', textContent: `${total} results in ${res.results.length} files` }));
}, 350);

/* ============================ terminal (xterm) ========================= */
async function ensureTerminal() {
  if (state.terminal.ready) return;
  if (!state.terminal.cwd && state.root) state.terminal.cwd = state.root;
  if (state.terminal.forceLegacy) return createLegacy();
  try {
    const res = await ide.ptyCreate(state.terminal.cwd || null);
    state.terminal.id = res.id;
    state.terminal.pty = !!res.pty;
    state.terminal.ready = true;
    state.terminal.openedAt = Date.now();
    if (res.pty) initXterm();
    else initLegacyTerm(res);
  } catch (err) {
    logOutput(`PTY failed (${prettyErr(err)}) — switching to legacy terminal`);
    return createLegacy();
  }
}

async function createLegacy() {
  try {
    const res = await ide.termCreate(state.terminal.cwd || null);
    initLegacyTerm(res);
  } catch (err) { toast('Terminal unavailable: ' + prettyErr(err)); }
}

function initXterm() {
  const host = $('#xterm-host');
  $('#term-legacy').classList.add('hidden');
  host.classList.remove('hidden');
  host.innerHTML = '';
  const tier = effectiveTier();
  const term = new Terminal({
    fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
    fontSize: 13,
    cursorBlink: tier !== 'perf',
    scrollback: tier === 'perf' ? 500 : tier === 'balanced' ? 2000 : 5000,
    theme: {
      background: '#15171c', foreground: '#d4d4d4',
      cursor: '#38bdf8', cursorAccent: '#15171c',
      selectionBackground: '#264f78'
    }
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(host);
  state.terminal.xterm = term;
  state.terminal.fit = fit;
  /* flush output that arrived before the renderer was ready */
  for (const d of state.terminal.pend) term.write(d);
  state.terminal.pend = [];
  requestAnimationFrame(() => { try { fit.fit(); } catch {} });
  term.onData(d => ide.ptyInput(state.terminal.id, d));
  term.onResize(({ cols, rows }) => { if (state.terminal.id) ide.ptyResize(state.terminal.id, cols, rows); });
  if (!initXterm.ro) {
    initXterm.ro = new ResizeObserver(() => {
      if (!state.terminal.xterm || document.body.classList.contains('panel-hidden')) return;
      requestAnimationFrame(() => { try { state.terminal.fit.fit(); } catch {} });
    });
    initXterm.ro.observe(host);
  }
}

function initLegacyTerm(res) {
  $('#xterm-host').classList.add('hidden');
  $('#term-legacy').classList.remove('hidden');
  state.terminal.id = res.id;
  state.terminal.pty = false;
  state.terminal.ready = true;
  state.terminal.cwd = res.cwd || state.terminal.cwd;
  updatePrompt();
  printTerm(state.terminal.forceLegacy
    ? `SleepCoding terminal — legacy mode (PTY failed repeatedly)\n`
    : `SleepCoding terminal — legacy mode (install VS Build Tools + run "npm run rebuild" for the full PTY terminal)\n`);
}

function shortCwd(cwd) {
  if (state.root && (cwd === state.root || cwd.startsWith(state.root + '/') || cwd.startsWith(state.root + '\\'))) {
    const r = cwd.slice(state.root.length).replace(/^[\\/]/, '');
    return state.rootName + (r ? '/' + r : '');
  }
  return cwd;
}
function updatePrompt() {
  $('#term-prompt').textContent = `${ide.platform === 'win32' ? 'PS ' : ''}${shortCwd(state.terminal.cwd)} $`;
}
function printTerm(text) {
  const out = $('#term-output');
  out.textContent += text;
  if (out.textContent.length > 400000) out.textContent = out.textContent.slice(-300000);
  out.scrollTop = out.scrollHeight;
}
const termBuf = [];
let termFlushQueued = false;
function queueTerm(data) {
  termBuf.push(data);
  if (termFlushQueued) return;
  termFlushQueued = true;
  requestAnimationFrame(() => {
    termFlushQueued = false;
    printTerm(termBuf.join(''));
    termBuf.length = 0;
  });
}

async function execTerm(cmd) {
  await ensureTerminal();
  if (state.terminal.pty) { ide.ptyInput(state.terminal.id, cmd + '\r'); return; }
  printTerm(`\n${$('#term-prompt').textContent} ${cmd}\n`);
  state.terminal.history.push(cmd);
  state.terminal.hIndex = state.terminal.history.length;
  const res = await ide.termRun(state.terminal.id, cmd);
  if (res?.builtin === 'clear') $('#term-output').textContent = '';
  else if (res?.cwd) { state.terminal.cwd = res.cwd; updatePrompt(); }
}

/* ================================ git ================================== */
async function refreshGit() {
  if (!state.root) return;
  const st = await ide.gitStatus(state.root);
  if (st.error) {
    if (!state.git.errShown) { state.git.errShown = true; logOutput('Git: ' + st.error); }
    state.git.repo = false;
  } else {
    state.git = {
      repo: !!st.repo, branch: st.branch || '', upstream: st.upstream || '',
      ahead: st.ahead || 0, behind: st.behind || 0, noCommits: !!st.noCommits,
      changes: st.changes || [], errShown: false
    };
    state.gitMap = new Map((st.changes || []).map(c => {
      const code = (c.x !== ' ' && c.x !== '?') ? c.x : (c.y === '?' ? '?' : c.y);
      return [c.path, code];
    }));
  }
  await renderTree();
  renderGitView();
  updateStatus();
}

function gitCodeClass(c) { return c === '?' ? 'g-q' : 'g-' + c; }

function scRow(c, staged) {
  const row = document.createElement('div');
  row.className = 'sc-row';
  row.dataset.path = joinP(state.root, c.path);
  const code = staged ? (c.x === '?' ? 'A' : c.x) : ((c.x !== ' ' && c.x !== '?') ? c.x : (c.y === '?' ? '?' : c.y));
  const dir = dirnameP(c.path);
  row.innerHTML = `<span class="sc-st ${gitCodeClass(code)}">${esc(code)}</span>
    <span class="sc-name">${esc(base(c.path))}</span>
    <span class="sc-path">${esc(dir !== '.' ? dir : '')}</span>
    <span class="sc-acts"></span>`;
  const acts = row.querySelector('.sc-acts');
  const mk = (label, title, fn) => {
    const b = document.createElement('button');
    b.textContent = label; b.title = title;
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    return b;
  };
  if (staged) {
    acts.appendChild(mk('−', 'Unstage', () => gitUnstage([row.dataset.path])));
  } else {
    acts.appendChild(mk('+', 'Stage', () => gitStage([row.dataset.path])));
    acts.appendChild(mk('↺', 'Discard changes', () => gitDiscardConfirm([row.dataset.path])));
  }
  row.addEventListener('click', () => openDiff(row.dataset.path));
  return row;
}

function renderGitView() {
  const g = state.git;
  $('#btn-git-init').classList.toggle('hidden', g.repo);
  $('#btn-git-refresh').innerHTML = ICONS.refresh;

  const sel = $('#git-branch');
  if (!g.repo) {
    sel.innerHTML = '<option>no repository</option>';
    sel.disabled = true;
  } else {
    sel.disabled = false;
    const label = g.branch + (g.upstream ? '' : ' (no upstream)');
    sel.innerHTML = `<option value="__cur">${esc(label)}${g.ahead ? ' ↑' + g.ahead : ''}${g.behind ? ' ↓' + g.behind : ''}</option><option value="__new">➕ New branch…</option>`;
    ide.gitBranches(state.root).then(r => {
      for (const b of r.list.filter(x => x !== g.branch)) {
        const o = document.createElement('option');
        o.value = b; o.textContent = b;
        sel.appendChild(o);
      }
    }).catch(() => {});
  }

  const staged = g.changes.filter(c => c.x !== ' ' && c.x !== '?');
  const unstaged = g.changes.filter(c => c.x === ' ' || c.x === '?');

  $('#git-staged-title').classList.toggle('hidden', !g.repo || !staged.length);
  $('#git-changes-title').classList.toggle('hidden', !g.repo || !unstaged.length);
  $('#git-staged-n').textContent = staged.length ? `(${staged.length})` : '';
  $('#git-changes-n').textContent = unstaged.length ? `(${unstaged.length})` : '';
  $('#git-staged').innerHTML = '';
  $('#git-changes').innerHTML = '';
  staged.forEach(c => $('#git-staged').appendChild(scRow(c, true)));
  unstaged.forEach(c => $('#git-changes').appendChild(scRow(c, false)));

  const empty = $('#git-empty');
  if (!g.repo) empty.textContent = 'Not a git repository. Initialize one to start tracking changes.';
  else if (!g.changes.length) empty.textContent = g.noCommits ? 'Repository initialized — make changes and commit.' : 'Working tree clean ✓';
  else empty.textContent = '';
}

async function gitStage(paths) {
  try { await ide.gitStage(state.root, paths); await refreshGit(); }
  catch (err) { toast(prettyErr(err)); }
}
async function gitUnstage(paths) {
  try { await ide.gitUnstage(state.root, paths); await refreshGit(); }
  catch (err) { toast(prettyErr(err)); }
}
async function gitDiscardConfirm(paths) {
  if (!confirm(`Discard changes in ${paths.length} file(s)? This cannot be undone.`)) return;
  try { await ide.gitDiscard(state.root, paths); await refreshGit(); }
  catch (err) { toast(prettyErr(err)); }
}

async function gitCommit() {
  if (!state.git.repo) return toast('Not a git repository');
  const msg = $('#git-msg').value.trim();
  if (!msg) return toast('Enter a commit message');
  try {
    const staged = state.git.changes.filter(c => c.x !== ' ' && c.x !== '?');
    if (!staged.length) await ide.gitStageAll(state.root);
    await ide.gitCommit(state.root, msg);
    $('#git-msg').value = '';
    await refreshGit();
    flashStatus('✓ Committed');
    logOutput(`Committed: ${msg}`);
  } catch (err) { toast(prettyErr(err)); }
}

async function gitPushFlow() {
  if (!state.git.repo) return toast('Not a git repository');
  try {
    await ide.gitPush(state.root, null);
    await refreshGit();
    toast('Pushed ✓');
  } catch (err) {
    const m = prettyErr(err);
    if (/authentication|publish|token/i.test(m)) toast(m + ' — or use ⬢ Publish');
    else toast(m);
  }
}

async function gitPullFlow() {
  if (!state.git.repo) return toast('Not a git repository');
  try {
    const r = await ide.gitPull(state.root);
    logOutput('Pull: ' + (r.out || '').trim().split('\n')[0]);
    await refreshGit();
    toast('Pulled ✓');
  } catch (err) { toast(prettyErr(err)); }
}

async function gitBranchAction(val) {
  if (val === '__cur') return;
  try {
    if (val === '__new') {
      const name = prompt('New branch name:');
      if (!name || !/^[\w.\-/]+$/.test(name)) return;
      await ide.gitCheckout(state.root, name, true);
      toast(`Created & switched to ${name}`);
    } else {
      await ide.gitCheckout(state.root, val, false);
      toast(`Switched to ${val}`);
    }
    await refreshGit();
  } catch (err) { toast(prettyErr(err)); }
  renderGitView();
}

/* GitHub publish dialog */
function openPublishDialog() {
  if (!state.root) return toast('Open a folder first');
  $('#gp-name').value = state.rootName;
  $('#gp-desc').value = '';
  $('#gp-token').value = '';
  $('#gp-private').checked = false;
  $('#gp-err').classList.add('hidden');
  $('#git-dialog').classList.add('open');
  setTimeout(() => $('#gp-token').focus(), 220);
}
function closePublishDialog() { $('#git-dialog').classList.remove('open'); }

async function doPublish() {
  const btn = $('#gp-submit');
  const errBox = $('#gp-err');
  const show = (m) => { errBox.textContent = m; errBox.classList.remove('hidden'); };
  errBox.classList.add('hidden');
  btn.disabled = true; btn.textContent = 'Publishing…';
  try {
    const res = await ide.gitPublish({
      root: state.root,
      token: $('#gp-token').value.trim(),
      name: $('#gp-name').value.trim(),
      description: $('#gp-desc').value.trim(),
      isPrivate: $('#gp-private').checked
    });
    closePublishDialog();
    await refreshGit();
    toast(`Published → ${res.url}`);
    logOutput(`Published to GitHub: ${res.url}`);
    ide.openExternal(res.url);
  } catch (err) {
    show(prettyErr(err));
  } finally {
    btn.disabled = false; btn.textContent = 'Create & Push';
  }
}

/* =========================== session restore =========================== */
function saveSessionSoon() {
  clearTimeout(saveSessionSoon.t);
  saveSessionSoon.t = setTimeout(saveSession, 500);
}
function saveSession() {
  if (!state.root) return;
  try {
    localStorage.setItem('wf-session', JSON.stringify({
      root: state.root,
      tabs: state.tabOrder.filter(p => !String(p).startsWith('diff:')),
      active: state.activePath && !String(state.activePath).startsWith('diff:') ? state.activePath : null,
      expanded: [...state.expanded]
    }));
  } catch {}
}
async function restoreSession() {
  try {
    const d = JSON.parse(localStorage.getItem('wf-session') || 'null');
    if (!d || !d.root) return;
    const r = await ide.openPath(d.root);
    if (!r || r.error) { localStorage.removeItem('wf-session'); return; }
    await setWorkspace(r);
    state.expanded = new Set([d.root, ...((d.expanded || [])
      .filter(x => x === d.root || x.startsWith(d.root + sep(d.root))))]);
    await renderTree();
    for (const p of (d.tabs || [])) { try { await openFile(p); } catch {} }
    if (d.active && state.tabs.has(d.active)) activateTab(d.active);
    logOutput('Session restored.');
  } catch {}
}

/* =========================== problems / status ========================= */
function updateProblems() {
  if (typeof monaco === 'undefined' || !monaco.editor) return;
  const markers = monaco.editor.getModelMarkers({});
  const errors = markers.filter(m => m.severity === 8);
  const warns = markers.filter(m => m.severity === 4);
  $('#sb-errors').textContent = `✖ ${errors.length}`;
  $('#sb-warnings').textContent = `⚠ ${warns.length}`;
  const list = $('#problems');
  list.innerHTML = '';
  for (const m of [...errors, ...warns]) {
    const row = document.createElement('div');
    row.className = 'problem ' + (m.severity === 8 ? 'err' : 'warn');
    row.innerHTML = `<span>${m.severity === 8 ? '✖' : '⚠'}</span>
      <span>${esc(m.message)}</span><span class="p-file">${esc(base(m.resource.fsPath))}:${m.startLineNumber}</span>`;
    row.addEventListener('click', async () => {
      await openFile(m.resource.fsPath);
      if (editor) {
        editor.revealLineInCenter(m.startLineNumber);
        editor.setPosition({ lineNumber: m.startLineNumber, column: m.startColumn });
        editor.focus();
      }
    });
    list.appendChild(row);
  }
}

function updateStatus() {
  const t = state.tabs.get(state.activePath);
  $('#sb-folder').textContent = state.rootName || 'no folder';
  $('#sb-branch').textContent = state.git.repo ? `⎇ ${state.git.branch || 'main'}` : '';
  if (t && t.type === 'diff') {
    $('#sb-cursor').textContent = '';
    $('#sb-indent').textContent = '';
    $('#sb-lang').textContent = 'diff';
  } else if (t && !t.isImage && editor && editor.getModel()) {
    const pos = editor.getPosition();
    $('#sb-cursor').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
    $('#sb-lang').textContent = editor.getModel().getLanguageId();
    $('#sb-indent').textContent = `Spaces: ${state.settings.tabSize}`;
  } else {
    $('#sb-cursor').textContent = '';
    $('#sb-indent').textContent = '';
    $('#sb-lang').textContent = t?.isImage ? 'image' : (t ? 'plain text' : '');
  }
}

let statusFlash;
function flashStatus(msg) {
  const el = $('#sb-folder');
  clearTimeout(statusFlash);
  el.textContent = msg;
  statusFlash = setTimeout(updateStatus, 1200);
}

/* ============================ command palette ========================== */
let COMMANDS = () => [
  { label: 'Run: Run Active File (F5)', run: runActive },
  { label: 'File: New File', run: () => newInline(state.root, false) },
  { label: 'File: New Folder', run: () => newInline(state.root, true) },
  { label: 'File: Open Folder…', run: openFolderDialog },
  { label: 'File: Save', run: saveActive },
  { label: 'File: Save As…', run: saveAsActive },
  { label: 'File: Save All', run: saveAll },
  { label: 'File: Revert File', run: revertActive },
  { label: 'File: Close Tab', run: closeActive },
  { label: 'File: Format Document', run: formatActive },
  { label: 'Git: Commit', run: gitCommit },
  { label: 'Git: Push', run: gitPushFlow },
  { label: 'Git: Pull', run: gitPullFlow },
  { label: 'Git: Publish to GitHub…', run: openPublishDialog },
  { label: 'Git: Refresh', run: refreshGit },
  { label: 'View: Toggle Sidebar', run: toggleSidebar },
  { label: 'View: Toggle Terminal', run: togglePanel },
  { label: 'View: Toggle Word Wrap', run: () => setSettings({ wordWrap: !state.settings.wordWrap }) },
  { label: 'View: Toggle Minimap', run: () => setSettings({ minimap: !state.settings.minimap }) },
  { label: 'View: Toggle Performance Mode', run: () =>
    setSettings({ fxMode: state.settings.fxMode === 'perf' ? 'auto' : 'perf' }) },
  { label: 'Explorer: Collapse All', run: collapseAll },
  { label: 'Preview: Start Live Server', run: startPreview },
  { label: 'Preview: Stop Live Server', run: stopPreview },
  { label: 'Preview: Open in Browser', run: openPreviewExternal },
  { label: 'Editor: Go to Line…', run: () => editor?.trigger('pal', 'editor.action.gotoLine') },
  { label: 'Terminal: Run npm start', run: () => { togglePanel(true); execTerm('npm start'); } },
  { label: 'Terminal: Run npm install', run: () => { togglePanel(true); execTerm('npm install'); } },
];

let palItems = [], palIndex = 0;
function openPalette(mode) {
  $('#palette').classList.add('open');
  const inp = $('#palette-input');
  inp.value = mode === 'command' ? '>' : '';
  renderPalette();
  inp.focus();
}
function closePalette() { $('#palette').classList.remove('open'); }

async function renderPalette() {
  const q = $('#palette-input').value;
  const list = $('#palette-list');
  list.innerHTML = '';
  palItems = []; palIndex = 0;

  if (q.startsWith('>')) {
    const query = q.slice(1).trim();
    for (const c of COMMANDS()) {
      const f = fuzzy(query, c.label);
      if (f) palItems.push({ label: c.label, detail: '', run: c.run, hits: f.hits, offset: 0, score: f.score });
    }
    palItems.sort((a, b) => b.score - a.score);
  } else {
    if (!state.root) { list.innerHTML = '<div class="pal-item"><span class="pal-detail">Open a folder to use Quick Open</span></div>'; return; }
    if (!state.allFiles) state.allFiles = await ide.allFiles(state.root);
    for (const f of state.allFiles) {
      const r = rel(f);
      const m = fuzzy(q, r);
      if (m) palItems.push({
        label: base(f), detail: r, run: () => openFile(f),
        hits: m.hits, offset: r.length - base(f).length, score: m.score
      });
    }
    palItems.sort((a, b) => b.score - a.score);
    palItems = palItems.slice(0, 100);
  }

  palItems.forEach((it, i) => {
    const el = document.createElement('div');
    el.className = 'pal-item' + (i === 0 ? ' active' : '');
    const label = it.label.split('').map((ch, idx) =>
      it.hits && it.hits.includes(idx - it.offset) ? `<mark>${esc(ch)}</mark>` : esc(ch)).join('');
    el.innerHTML = `<span class="pal-label">${label}</span><span class="pal-detail">${esc(it.detail)}</span>`;
    el.addEventListener('click', () => { closePalette(); it.run(); });
    list.appendChild(el);
  });
}

function palMove(dir) {
  palIndex = Math.max(0, Math.min(palItems.length - 1, palIndex + dir));
  const items = $$('#palette-list .pal-item');
  items.forEach((el, i) => el.classList.toggle('active', i === palIndex));
  items[palIndex]?.scrollIntoView({ block: 'nearest' });
}

/* ================================ preview ============================== */
async function startPreview() {
  if (!state.root) return toast('Open a folder first');
  const res = await ide.previewStart({ root: state.root, port: 3000 });
  if (res.error) return toast('Preview: ' + res.error);
  state.previewPort = res.port;
  $('#preview-port-label').textContent = `Running → http://localhost:${res.port}`;
  $('#preview-url').value = `http://localhost:${res.port}`;
  $('#preview-frame').src = `http://localhost:${res.port}`;
  $('#preview-pane').classList.remove('hidden');
  $('#sb-port').textContent = `⚡ ${res.port}`;
  $('#btn-preview-toggle').textContent = '■ Stop Live Server';
  logOutput(`Live server started on port ${res.port}`);
}
async function stopPreview() {
  await ide.previewStop();
  state.previewPort = null;
  $('#sb-port').textContent = '';
  $('#btn-preview-toggle').textContent = '▶ Start Live Server';
  $('#preview-port-label').textContent = '';
  logOutput('Live server stopped.');
}
function openPreviewExternal() {
  if (!state.previewPort) return toast('Start the live server first');
  const t = state.tabs.get(state.activePath);
  const suffix = t && /\.html?$/.test(t.filePath || t.path) ? '/' + rel(t.filePath || t.path).replace(/\\/g, '/') : '/';
  ide.openExternal(`http://localhost:${state.previewPort}${suffix}`);
}

/* ================================ settings ============================= */
function setSettings(patch) {
  Object.assign(state.settings, patch);
  localStorage.setItem('wf-settings', JSON.stringify(state.settings));
  applyFx(); syncSettingsUI();
}
function syncSettingsUI() {
  const s = state.settings;
  $('#set-fx').value = s.fxMode || 'auto';
  $('#set-autosave').checked = s.autoSave;
  $('#set-format').checked = s.formatOnSave;
  $('#set-wrap').checked = s.wordWrap;
  $('#set-minimap').checked = s.minimap;
  $('#set-fontsize').value = s.fontSize;
  $('#set-tabsize').value = s.tabSize;
}

/* ============================ layout helpers =========================== */
function toggleSidebar() {
  document.body.classList.toggle('sb-collapsed');
}
function togglePanel(forceShow) {
  const hiddenNow = document.body.classList.contains('panel-hidden');
  const show = forceShow === true || hiddenNow;      /* ← FIXED: hidden ⇒ show */
  document.body.classList.toggle('panel-hidden', !show);
  if (show) {
    ensureTerminal().then(() => {
      requestAnimationFrame(() => { try { state.terminal.fit?.fit(); } catch {} });
      setTimeout(() => { try { state.terminal.fit?.fit(); } catch {} }, 300); /* after glide-in */
      if (state.terminal.pty) state.terminal.xterm?.focus();
      else $('#term-input')?.focus();
    });
  }
}
function setView(name, forceShow) {
  const btns = $$('.ab-btn');
  const target = btns.find(b => b.dataset.view === name);
  const wasActive = target.classList.contains('active');
  const collapse = wasActive && !forceShow;
  btns.forEach(b => b.classList.toggle('active', b.dataset.view === name && !collapse));
  $$('.view').forEach(v => v.classList.remove('active'));
  if (!collapse) $(`#view-${name}`).classList.add('active');
  document.body.classList.toggle('sb-collapsed', collapse);
  if (name === 'git' && !collapse) refreshGit();
  if (name === 'preview' && !collapse && !state.previewPort) startPreview();
}

/* ============================ Monaco bootstrap ========================= */
function ensureLoader(cb) {
  if (typeof require !== 'undefined' && typeof require.config === 'function') return cb();
  const s = document.createElement('script');
  s.src = new URL('../node_modules/monaco-editor/min/vs/loader.js', location.href).href;
  s.onload = cb;
  s.onerror = () => showBootError('Monaco loader.js failed to load', [
    'Expected file: ' + s.src,
    'Check that node_modules/monaco-editor exists — run: npm install'
  ]);
  document.head.appendChild(s);
}

function startMonaco() {
  if (typeof require === 'undefined' || typeof require.config !== 'function') {
    showBootError('Monaco loader not available', ['loader.js loaded but "require" is missing.', 'IDE runs in fallback plain-text mode.']);
    return;
  }
  const baseUrl = new URL('../node_modules/monaco-editor/min/', location.href).href;
  window.MonacoEnvironment = {
    getWorkerUrl: () => URL.createObjectURL(new Blob([
      `self.MonacoEnvironment={baseUrl:${JSON.stringify(baseUrl)}};` +
      `importScripts(${JSON.stringify(baseUrl + 'vs/base/worker/workerMain.js')});`
    ], { type: 'text/javascript' }))
  };
  require.config({ paths: { vs: baseUrl + 'vs' } });
  ide.bootProgress?.(38, 'Loading Monaco editor…');
  require(['vs/editor/editor.main'],
    () => {
      try {
        initEditor();
        ide.bootProgress?.(62, 'Editor engine ready…');
        initEnhancements();
        ide.bootProgress?.(82, 'Loading IDE features…');
        restoreSession();
        ide.bootProgress?.(96, 'Finalizing workspace…');
        setTimeout(() => ide.bootReady?.(), 120);
      } catch (err) {
        ide.bootError?.(String(err && err.message || err));
        showBootError('Editor init failed', [String(err && err.message || err)]);
      }
    },
    (err) => {
      ide.bootError?.(String((err && err.message) || err));
      showBootError('Monaco failed to load', [
        err && err.requireModules ? 'Modules: ' + err.requireModules.join(', ') : '',
        String((err && err.message) || err),
        'IDE runs in fallback plain-text mode.'
      ]);
    });
}

function initEditor() {
  editor = monaco.editor.create($('#editor-container'), {
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: state.settings.fontSize,
    fontFamily: 'Consolas, "Courier New", monospace',
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true },
    renderWhitespace: 'selection',
    padding: { top: 8 }
  });
  refreshEditorOptions();
  editor.onDidChangeCursorPosition(updateStatus);
  CollabBridge.editor = editor;
  editor.onDidChangeCursorSelection(() => Collab.onCursor());
  monaco.editor.onDidChangeMarkers(updateProblems);

  for (const [p, t] of Array.from(state.tabs)) {
    if (t.isImage || t.model || t.type === 'diff') continue;
    const uri = monaco.Uri.file(p);
    const model = monaco.editor.getModel(uri) || monaco.editor.createModel(t.fallbackText || '', langFor(p), uri);
    model.updateOptions({ tabSize: state.settings.tabSize, insertSpaces: true });
    t.model = model;
    t.savedVersion = model.getAlternativeVersionId();
    model.onDidChangeContent(() => { updateDirtyMarker(p); if (state.settings.autoSave) scheduleAutoSave(p); Collab.onLocalEdit(p); });
    if (p === state.activePath) { editor.setModel(model); editor.focus(); showPane('code'); }
  }

  updateProblems();
  tuneMonaco();
  applyTheme(state.settings.theme || 'dark');
  appReady = true;
  $('#boot-error').classList.add('hidden');
  logOutput(`Monaco loaded. Effects: ${effectiveTier()}.`);
}

/* ================================= boot ================================ */
function initUI() {
  /* popups are opacity-animated now; migrate away from .hidden */
  $('#palette').classList.remove('hidden');
  $('#git-dialog').classList.remove('hidden');
  $('#panel').classList.remove('hidden');          /* migrate old HTML too */
  document.body.classList.add('panel-hidden');     /* panel starts collapsed */
  if (ide.platform === 'darwin') document.body.classList.add('mac');

  /* titlebar */
  $$('.menu-btn').forEach(b => {
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(b.dataset.menu, b); });
    b.addEventListener('mouseenter', () => { if (menuOpen && menuOpen !== b.dataset.menu) toggleMenu(b.dataset.menu, b); });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown') && !e.target.closest('.menu-btn')) hideMenus();
    if (!e.target.closest('#ctx-menu')) hideCtx();
  });
  $('#btn-min').onclick = () => ide.winMinimize();
  $('#btn-max').onclick = () => ide.winMaximize();
  $('#btn-close').onclick = () => ide.winClose();
  ide.on('win:maximized', (m) => { $('#btn-max').title = m ? 'Restore' : 'Maximize'; });

  ide.on('win:blur',  () => { state.fx.focused = false; document.body.classList.add('inactive'); });
  ide.on('win:focus', () => { state.fx.focused = true;  document.body.classList.remove('inactive'); });
  ide.on('win:mica',  ({ mode }) => {
    if (mode === 'mica') document.body.classList.add('mica');
    if (mode === 'vibrancy') document.body.classList.add('vibrancy');
  });
  ide.on('power:state', ({ onBattery }) => {
    const before = effectiveTier();
    state.fx.onBattery = !!onBattery;
    if (effectiveTier() !== before) {
      applyFx();
      if (state.settings.fxMode === 'auto')
        toast(onBattery ? '🔋 On battery — balanced visuals' : '⚡ Plugged in — full visuals');
    }
  });

  /* safe quit */
  ide.on('app:ask-quit', async () => {
    const dirty = [...state.tabs.values()].filter(t => tabIsDirty(t));
    if (!dirty.length) return ide.quit();
    const ok = confirm(`${dirty.length} unsaved file(s):\n\n${dirty.map(t => '• ' + t.name).join('\n')}\n\nSave all and quit?`);
    if (ok) { for (const t of dirty) await saveTab(t.path); ide.quit(); }
    else ide.cancelQuit();
  });

  /* activity bar */
  $$('.ab-btn').forEach(b => {
    b.innerHTML = ICONS[b.dataset.view] || '';
    b.addEventListener('click', () => setView(b.dataset.view));
  });

  /* explorer */
  $('#btn-open-folder').onclick = openFolderDialog;
  $('#btn-welcome-open').onclick = openFolderDialog;
  $('#btn-refresh').innerHTML = ICONS.refresh;
  $('#btn-new-file').innerHTML = ICONS.newFile;
  $('#btn-new-folder').innerHTML = ICONS.newDir;
  $('#btn-refresh').onclick = () => { state.allFiles = null; renderTree(); };
  $('#btn-new-file').onclick = () => newInline(state.root, false);
  $('#btn-new-folder').onclick = () => newInline(state.root, true);

  const ft = $('#filetree');
  ft.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.tree-row') || !state.root) return;
    e.preventDefault();
    showCtx(e.clientX, e.clientY, [
      { label: 'New File…', run: () => newInline(state.root, false) },
      { label: 'New Folder…', run: () => newInline(state.root, true) },
      { sep: true },
      { label: 'Paste', run: () => pasteInto(state.root) },
      { sep: true },
      { label: 'Collapse All', run: collapseAll },
    ]);
  });
  ft.addEventListener('dragover', (e) => {
    if (e.target.closest('.tree-row')) return;
    if (!dndData && !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dndData ? 'move' : 'copy';
  });
  ft.addEventListener('drop', (e) => {
    if (e.target.closest('.tree-row')) return;
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length)
      return importExternalFiles([...e.dataTransfer.files], state.root);
    if (dndData) {
      const src = dndData.path; dndData = null; clearDropMark();
      if (dirnameP(src) !== state.root) doMove(src, state.root);
    }
  });

  /* search */
  $('#search-input').addEventListener('input', runSearch);
  $('#btn-search-case').onclick = (e) => { e.target.classList.toggle('on'); runSearch(); };
  $('#btn-search-regex').onclick = (e) => { e.target.classList.toggle('on'); runSearch(); };

  /* git view */
  $('#btn-git-refresh').onclick = refreshGit;
  $('#btn-git-init').onclick = async () => {
    try { await ide.gitInit(state.root); await refreshGit(); toast('Git repository initialized'); }
    catch (err) { toast(prettyErr(err)); }
  };
  $('#btn-git-commit').onclick = gitCommit;
  $('#btn-git-push').onclick = gitPushFlow;
  $('#btn-git-pull').onclick = gitPullFlow;
  $('#btn-git-publish').onclick = openPublishDialog;
  $('#git-branch').onchange = (e) => gitBranchAction(e.target.value);
  $('#git-msg').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); gitCommit(); }
  });
  $('#gp-cancel').onclick = closePublishDialog;
  $('#gp-submit').onclick = doPublish;
  $('#gp-token-link').onclick = () =>
    ide.openExternal('https://github.com/settings/tokens/new?scopes=repo&description=SleepCoding%20IDE');
  $('#git-dialog').addEventListener('mousedown', (e) => { if (e.target.id === 'git-dialog') closePublishDialog(); });

  /* preview */
  $('#btn-preview-toggle').onclick = () => state.previewPort ? stopPreview() : startPreview();
  $('#btn-preview-open-browser').onclick = openPreviewExternal;
  $('#btn-preview-reload').onclick = () => { $('#preview-frame').src = $('#preview-frame').src; };
  $('#btn-preview-external').onclick = openPreviewExternal;
  $('#btn-preview-close').onclick = () => $('#preview-pane').classList.add('hidden');

  /* run button */
  $('#btn-run').onclick = runActive;

  /* settings */
  syncSettingsUI();
  $('#set-fx').onchange = e => setSettings({ fxMode: e.target.value });
  $('#set-autosave').onchange = e => setSettings({ autoSave: e.target.checked });
  $('#set-format').onchange = e => setSettings({ formatOnSave: e.target.checked });
  $('#set-wrap').onchange = e => setSettings({ wordWrap: e.target.checked });
  $('#set-minimap').onchange = e => setSettings({ minimap: e.target.checked });
  $('#set-fontsize').onchange = e => setSettings({ fontSize: +e.target.value || 14 });
  $('#set-tabsize').onchange = e => setSettings({ tabSize: +e.target.value || 2 });
  $('#set-reset').onclick = () => setSettings({ ...DEFAULTS });

  /* panel tabs */
  $$('.panel-tab').forEach(t => t.onclick = () => {
    $$('.panel-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $$('.panel-page').forEach(p => p.classList.remove('active'));
    $(`#${t.dataset.panel}`).classList.add('active');
  });
  $('#btn-panel-close').onclick = () => togglePanel();

  /* terminal: legacy input */
  $('#term-input').addEventListener('keydown', async (e) => {
    const t = state.terminal;
    if (e.key === 'Enter') {
      const cmd = e.target.value.trim();
      e.target.value = '';
      if (cmd) await execTerm(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (t.hIndex > 0) e.target.value = t.history[--t.hIndex] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      t.hIndex = Math.min(t.history.length, t.hIndex + 1);
      e.target.value = t.history[t.hIndex] || '';
    }
  });

  /* terminal: pty streams (buffered until xterm is ready) */
  ide.on('pty:data', ({ id, data }) => {
    if (id !== state.terminal.id) return;
    if (!state.terminal.xterm) {
      if (state.terminal.pend.length < 4000) state.terminal.pend.push(data);
      return;
    }
    state.terminal.xterm.write(data);
  });
  ide.on('pty:exit', ({ id }) => {
    if (id !== state.terminal.id) return;
    state.terminal.ready = false; state.terminal.id = null; state.terminal.xterm = null;
    state.terminal.pend = [];
    const tooFast = Date.now() - (state.terminal.openedAt || 0) < 3000;
    state.terminal.failCount = tooFast ? (state.terminal.failCount || 0) + 1 : 0;
    logOutput('Terminal session ended.');
    if (state.terminal.failCount >= 3) {
      state.terminal.forceLegacy = true;
      logOutput('PTY keeps crashing — switched to legacy terminal.');
      if (!document.body.classList.contains('panel-hidden')) createLegacy();
      return;
    }
    if (!document.body.classList.contains('panel-hidden')) ensureTerminal();
  });
  ide.on('terminal:data', ({ id, data }) => { if (id === state.terminal.id) queueTerm(data); });

  /* fallback textarea */
  $('#fallback-editor').addEventListener('input', () => {
    const t = state.tabs.get(state.activePath);
    if (t && !t.model && !t.isImage && t.type !== 'diff') {
      t.fallbackText = $('#fallback-editor').value;
      t.dirty = true;
      updateDirtyMarker(state.activePath);
      if (state.settings.autoSave) scheduleAutoSave(state.activePath);
    }
  });

  /* palette */
  $('#palette-input').addEventListener('input', renderPalette);
  $('#palette-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palMove(-1); }
    else if (e.key === 'Enter') { const item = palItems[palIndex]; if (item) { closePalette(); item.run(); } }
    else if (e.key === 'Escape') closePalette();
  });
  $('#palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') closePalette(); });

  /* editor-zone dnd */
  const ez = $('#editor-zone');
  ez.addEventListener('dragover', (e) => {
    if (!dndData && !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  ez.addEventListener('drop', (e) => {
    if (dndData) {
      const d = dndData; dndData = null;
      if (!d.isDir) { e.preventDefault(); openFile(d.path); }
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      e.preventDefault();
      [...e.dataTransfer.files].slice(0, 5).forEach(f => { if (f.path) openFile(f.path); });
    }
  });
  document.addEventListener('dragend', () => { dragPath = null; renderTabs._last = null; });
  document.addEventListener('drop', () => { dragPath = null; renderTabs._last = null; });

  /* resizers */
  makeResizer($('#resizer-v'), 'col', $('#sidebar'), 'width', 'wf-sidebar');
  makeResizer($('#resizer-h'), 'row', $('#panel'), 'height', 'wf-panel');

  /* shortcuts — e.code based: works on ANY keyboard layout (RU/EN/…) */
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePalette(); hideCtx(); hideMenus(); closePublishDialog();
      return;
    }
    if (e.key === 'F5' && $('#palette').classList.contains('open') === false) {
      e.preventDefault(); runActive(); return;
    }
    const typing = !!(e.target && e.target.matches && e.target.matches('input, textarea, select'));
    const mod = e.ctrlKey || e.metaKey;
    const code = e.code;

    if (!typing && !state.editing && state.selectedPath) {
      if (e.key === 'F2') { e.preventDefault(); beginRename(state.selectedPath); return; }
      if (e.key === 'Delete') { e.preventDefault(); deleteItem(state.selectedPath); return; }
      if (mod && e.target === document.body) {
        if (code === 'KeyC') { e.preventDefault(); clipCopy(false); return; }
        if (code === 'KeyX') { e.preventDefault(); clipCopy(true); return; }
        if (code === 'KeyV') { e.preventDefault(); pasteInto(selTargetDir()); return; }
      }
    }
    if (!mod) return;
    if (code === 'KeyP') { e.preventDefault(); openPalette(e.shiftKey ? 'command' : 'file'); }
    else if (code === 'KeyS' && e.shiftKey) { e.preventDefault(); saveAsActive(); }
    else if (code === 'KeyS') { e.preventDefault(); saveActive(); }
    else if (code === 'KeyO') { e.preventDefault(); openFolderDialog(); }
    else if (code === 'KeyB') { e.preventDefault(); toggleSidebar(); }
    else if (code === 'KeyW') { e.preventDefault(); closeActive(); }
    else if (code === 'KeyF' && e.shiftKey) { e.preventDefault(); setView('search', true); $('#search-input').focus(); }
    else if (code === 'Backquote') { e.preventDefault(); togglePanel(); }
  });

  /* fs events → tree + git */
  ide.on('fs:event', debounce(({ type, path: p }) => {
    if (!p || !state.root) return;
    if (state.editing) { state.pendingRender = true; return; }
    state.allFiles = null;
    const isRemoved = type === 'unlink' || type === 'unlinkDir';
    const isTreeChange = type === 'add' || type === 'addDir' || isRemoved;
    if (isRemoved) {
      const s = p + sep(p);
      let closed = 0;
      for (const tp of [...state.tabs.keys()])
        if (tp === p || tp.startsWith(s) ||
            (state.tabs.get(tp)?.filePath || '').startsWith(s)) { closeTab(tp, true); closed++; }
      if (closed) toast(`${closed} tab(s) closed — removed on disk`);
      if (state.selectedPath && (state.selectedPath === p || state.selectedPath.startsWith(s)))
        state.selectedPath = null;
    }
    if (isTreeChange) renderTree();
    refreshGit();
    if (type === 'change') reloadIfClean(p);
  }, 150));

  renderTree();
  renderRecents();
  updateStatus();
  updateRunButton();
  applyFx();
  logOutput('SleepCoding 1.7 ready. Open a folder to begin.');
}

function makeResizer(el, axis, target, prop, key) {
  let dragging = false, start = 0, startSize = 0;
  el.addEventListener('mousedown', (e) => {
    dragging = true; start = axis === 'col' ? e.clientX : e.clientY;
    startSize = target.getBoundingClientRect()[prop];
    target.style.transition = 'none';
    document.body.classList.add('resizing');
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = axis === 'col' ? e.clientX - start : e.clientY - start;
    const size = Math.max(axis === 'col' ? 170 : 80, Math.min(axis === 'col' ? 600 : 560, startSize + delta));
    target.style[prop] = size + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      target.style.transition = '';
      document.body.classList.remove('resizing');
      localStorage.setItem(key, target.style[prop]);
    }
  });
  const saved = localStorage.getItem(key);
  if (saved) target.style[prop] = saved;
}



/* ============================== IDE Plus =============================== */
const enhancement = {
  split: { open: false, groups: [], activeGroup: 0 },
  run: { id: null, file: null, debug: false, running: false },
  debugger: { paused: false, callFrameId: null, breakpoints: new Map(), pausedDecorations: [], scripts: new Map() },
  snapshots: new Map(),
  outlineTimer: null,
  theme: 'dark'
};

function rememberSnapshot(p, text) {
  try {
    const key = 'wf-history:' + p;
    const old = JSON.parse(localStorage.getItem(key) || '[]');
    const next = [{ at: Date.now(), text: String(text).slice(0, 2_000_000) }, ...old.filter(x => x.text !== text)].slice(0, 12);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}
function previousSnapshot(p) {
  try {
    const a = JSON.parse(localStorage.getItem('wf-history:' + p) || '[]');
    return a[1] || a[0] || null;
  } catch { return null; }
}
async function restorePreviousSnapshot() {
  const p = state.activePath, tab = p && state.tabs.get(p);
  if (!tab || tab.isImage || tab.type === 'diff') return toast('Open a text file first');
  const snap = previousSnapshot(p);
  if (!snap) return toast('No saved snapshot for this file yet');
  if (!tab.model) return toast('Snapshot restore requires Monaco editor');
  const when = new Date(snap.at).toLocaleString();
  const ok = await confirmAsync(`Restore snapshot from ${when}? Current unsaved changes will be replaced.`);
  if (!ok) return;
  tab.model.pushEditOperations([], [{ range: tab.model.getFullModelRange(), text: snap.text }], () => null);
  updateDirtyMarker(p); editor?.focus();
  toast('Previous snapshot restored');
}
function confirmAsync(message) {
  return Promise.resolve(window.confirm(message));
}

function applyTheme(name) {
  const allowed = new Set(['dark','midnight','light']);
  if (!allowed.has(name)) name = 'dark';
  enhancement.theme = name;
  document.body.classList.remove('theme-dark','theme-midnight','theme-light');
  document.body.classList.add('theme-' + name);
  if (editor && typeof monaco !== 'undefined') {
    monaco.editor.setTheme(name === 'light' ? 'vs' : 'vs-dark');
  }
  if (editor && typeof monaco !== 'undefined') monaco.editor.setTheme(name === 'light' ? 'vs' : 'vs-dark');
}

function ensureEnhancementUI() {
  if (typeof monaco === 'undefined' || !monaco.editor) return;
  if ($('#enhancement-ui')) return;
  const style = document.createElement('style');
  style.id = 'enhancement-ui';
  style.textContent = `
    #editor-zone{position:relative;min-width:0;min-height:0}
    #editor-container{transition:width .18s ease}
    #split-editor-wrap{display:none;position:absolute;inset:0;background:var(--bg);z-index:3}
    #editor-zone.split-open #split-editor-wrap{display:grid;grid-template-columns:repeat(var(--split-count,2),minmax(0,1fr))}
    .sc-editor-group{display:flex;flex-direction:column;min-width:0;min-height:0;border-left:1px solid var(--border);background:var(--bg)}
    .sc-editor-group:first-child{border-left:0}
    .sc-group-tabs{height:34px;display:flex;align-items:center;gap:2px;padding:3px 6px;background:rgba(255,255,255,.025);border-bottom:1px solid var(--border);overflow:auto}
    .sc-group-tab{height:26px;border:1px solid transparent;background:transparent;color:var(--fg-dim);border-radius:6px;padding:0 8px;font:11px var(--ui-font);cursor:pointer;white-space:nowrap}
    .sc-group-tab.active{background:var(--surface-2);color:var(--fg);border-color:var(--border)}
    .sc-group-editor{flex:1;min-height:0}
    .sc-group-head{font-size:10px;color:var(--fg-dim);padding:0 4px;white-space:nowrap}
    .sc-split-tools{margin-left:auto;display:flex;gap:3px}
    .sc-split-tools button{border:1px solid var(--border);background:transparent;color:var(--fg-dim);border-radius:5px;cursor:pointer;padding:2px 6px}
    .sc-split-tools button:hover{color:var(--fg);background:var(--surface-2)}
    #editor-zone.split-open #tabs,#editor-zone.split-open #breadcrumbs,#editor-zone.split-open #editor-container{visibility:hidden}
    .debug-toolbar{display:flex;align-items:center;gap:5px;padding:7px 9px;border-bottom:1px solid var(--border);background:var(--surface)}
    .debug-toolbar button{border:1px solid var(--border);background:var(--surface-2);color:var(--fg);border-radius:6px;padding:5px 9px;cursor:pointer}
    .debug-toolbar button:hover{border-color:var(--accent);transform:translateY(-1px)}
    .debug-state{font-size:10px;color:var(--fg-dim);margin-left:4px}
    .debug-stack{padding:8px 10px;border-top:1px solid var(--border);font-size:11px;overflow:auto;max-height:130px}
    .debug-frame{padding:4px 0;color:var(--fg-dim)}
    .debug-frame b{color:var(--fg)}
    .debug-eval{display:flex;gap:6px;padding:7px 9px;border-top:1px solid var(--border)}
    .debug-eval input{flex:1;min-width:0;background:var(--input);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:6px 8px}
    .sc-breakpoint{background:#ff5c7a;border-radius:50%;width:8px!important;height:8px!important;margin-left:4px;margin-top:5px}.sc-paused-line{background:rgba(255,190,70,.10);border-left:2px solid #ffbe46}.debug-result{padding:6px 10px;color:var(--fg-dim);font:11px ui-monospace,Consolas,monospace;white-space:pre-wrap}
    .run-pill{display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:3px 7px;border-radius:999px;background:rgba(67,208,130,.10);border:1px solid rgba(67,208,130,.22);font-size:10px}
    .run-pill.debug{background:rgba(255,185,70,.10);border-color:rgba(255,185,70,.22)}
    .run-actions{display:inline-flex;gap:3px}.run-actions button{font-size:10px;padding:2px 5px;border:1px solid var(--border);border-radius:4px}
    .tool-card{margin:10px 12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
    .tool-card h3{font-size:12px;margin:0 0 8px}.tool-card p{font-size:11px;color:var(--fg-dim);margin:4px 0 10px;line-height:1.5}
    .tool-row{display:flex;gap:6px;flex-wrap:wrap}.tool-row .sc-btn{flex:1;min-width:90px}
    .pkg-item{padding:9px 12px;border-bottom:1px solid var(--border);font-size:11px;display:flex;justify-content:space-between;gap:8px}
    .pkg-name{font-weight:600}.pkg-ver{color:var(--fg-dim)}
    .outline-item{padding:5px 12px;font-size:11px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.outline-item:hover{background:rgba(255,255,255,.06)}
    body.theme-light{--bg:#f5f7fb;--fg:#1d2430;--fg-dim:#647084;--surface:rgba(255,255,255,.88);--surface-2:rgba(235,239,247,.95);--input:#fff;--border:rgba(29,36,48,.13);--accent:#0879f9;--accent-2:#7c4dff}
    body.theme-light .orb{opacity:.12}.theme-light #terminal,.theme-light #editor-container,.theme-light .sc-group-editor{background:#fff}
    body.theme-midnight{--bg:#080b16;--fg:#e7ecff;--fg-dim:#7e88a6;--surface:rgba(13,17,31,.82);--surface-2:rgba(23,29,50,.9);--input:#11172a;--border:rgba(148,163,255,.14);--accent:#7dd3fc;--accent-2:#a78bfa}
  `;
  document.head.appendChild(style);

  const ez = $('#editor-zone');
  if (ez && !$('#split-editor-wrap')) {
    const wrap = document.createElement('div');
    wrap.id='split-editor-wrap';
    ez.appendChild(wrap);
    wrap.addEventListener('dragover', e => { if (dndData) { e.preventDefault(); e.dataTransfer.dropEffect='move'; } });
    wrap.addEventListener('drop', e => { if (!dndData) return; e.preventDefault(); const d=dndData; dndData=null; if (d.path && !d.isDir) setSplitFile(d.path, enhancement.split.activeGroup); });
  }
  createSplitGroups(2, false);

  const pt = $('#panel-tabs');
  if (pt && !pt.querySelector('[data-panel="outline"]')) {
    const b=document.createElement('button'); b.className='panel-tab'; b.dataset.panel='outline'; b.textContent='OUTLINE'; pt.insertBefore(b, pt.querySelector('.panel-actions'));
    const page=document.createElement('div'); page.id='outline'; page.className='panel-page'; document.querySelector('#panel-body').appendChild(page);
    b.onclick=()=>{ $$('.panel-tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.panel-page').forEach(x=>x.classList.remove('active')); page.classList.add('active'); renderOutline(); };
  }
  if (pt && !pt.querySelector('[data-panel="debugger"]')) {
    const b=document.createElement('button'); b.className='panel-tab'; b.dataset.panel='debugger'; b.textContent='DEBUG'; pt.insertBefore(b, pt.querySelector('.panel-actions'));
    const page=document.createElement('div'); page.id='debugger'; page.className='panel-page'; page.innerHTML=`
      <div class="debug-toolbar"><button id="dbg-continue">▶ Continue</button><button id="dbg-pause">Ⅱ Pause</button><button id="dbg-over">↳ Over</button><button id="dbg-into">↘ Into</button><button id="dbg-out">↗ Out</button><span id="dbg-state" class="debug-state">Idle</span></div>
      <div id="dbg-stack" class="debug-stack">Start Node Debug to inspect the current process.</div>
      <div class="debug-eval"><input id="dbg-expr" placeholder="Evaluate expression…" spellcheck="false"><button id="dbg-eval" class="sc-btn">Evaluate</button></div><div id="dbg-result" class="debug-result"></div>`; document.querySelector('#panel-body').appendChild(page);
    b.onclick=()=>{ $$('.panel-tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $$('.panel-page').forEach(x=>x.classList.remove('active')); page.classList.add('active'); };
    $('#dbg-continue').onclick=()=>debugCommand('resume'); $('#dbg-pause').onclick=()=>debugCommand('pause'); $('#dbg-over').onclick=()=>debugCommand('stepOver'); $('#dbg-into').onclick=()=>debugCommand('stepInto'); $('#dbg-out').onclick=()=>debugCommand('stepOut'); $('#dbg-eval').onclick=debugEvaluateUI; $('#dbg-expr').addEventListener('keydown',e=>{if(e.key==='Enter')debugEvaluateUI();});
  }
  const act = $('#activitybar');
  if (act && !act.querySelector('[data-view="packages"]')) {
    const b=document.createElement('button'); b.className='ab-btn'; b.dataset.view='packages'; b.title='Packages'; b.innerHTML='📦'; act.insertBefore(b, act.querySelector('.ab-spacer'));
    const view=document.createElement('div'); view.className='view'; view.id='view-packages'; view.innerHTML=`<div class="view-header"><span>PACKAGES</span></div><div id="packages-body" class="view-body"></div>`; $('#sidebar').appendChild(view); b.onclick=()=>setView('packages', true);
  }
  if (act && !act.querySelector('[data-view="extensions"]')) {
    const b=document.createElement('button'); b.className='ab-btn'; b.dataset.view='extensions'; b.title='Extensions'; b.innerHTML='🧩'; act.insertBefore(b, act.querySelector('.ab-spacer'));
    const view=document.createElement('div'); view.className='view'; view.id='view-extensions'; view.innerHTML=`<div class="view-header"><span>EXTENSIONS</span></div><div id="extensions-body" class="view-body"></div>`; $('#sidebar').appendChild(view); b.onclick=()=>{ setView('extensions', true); renderExtensions(); };
  }
  const themeLabel=document.createElement('label'); themeLabel.id='theme-setting-row'; themeLabel.innerHTML='Theme <select id="set-theme"><option value="dark">SleepCoding Dark</option><option value="midnight">Midnight</option><option value="light">Light</option></select>';
  const sb=$('.settings-body'); if(sb && !$('#set-theme')) sb.insertBefore(themeLabel, sb.firstChild);
  if ($('#set-theme')) { $('#set-theme').value=state.settings.theme||'dark'; $('#set-theme').onchange=e=>setSettings({theme:e.target.value}); }
  const bc=$('#breadcrumbs');
  if (bc && !$('#run-tools')) { const holder=document.createElement('span'); holder.id='run-tools'; holder.innerHTML='<span id="run-pill" class="run-pill hidden"></span><span class="run-actions"><button id="run-stop" title="Stop running process">■</button><button id="run-restart" title="Restart running process">↻</button><button id="run-debug" title="Debug Node file">🐞</button><button id="split-2" title="Split into 2 groups">◫2</button><button id="split-3" title="Split into 3 groups">◫3</button></span>'; bc.insertBefore(holder, bc.firstChild); $('#run-stop').onclick=stopManagedRun; $('#run-restart').onclick=restartManagedRun; $('#run-debug').onclick=debugActive; $('#split-2').onclick=()=>setSplitCount(2); $('#split-3').onclick=()=>setSplitCount(3); }
  renderPackages(); renderExtensions(); applyTheme(state.settings.theme || 'dark');
}

function createSplitGroups(count = 2, open = true) {
  const wrap = $('#split-editor-wrap'); if (!wrap || !monaco?.editor) return;
  count = Math.max(1, Math.min(3, count));
  enhancement.split.groups?.forEach(g => { try { g.editor?.dispose(); } catch {} });
  wrap.innerHTML=''; enhancement.split.groups=[];
  wrap.style.setProperty('--split-count', count);
  for(let i=0;i<count;i++){
    const group=document.createElement('section'); group.className='sc-editor-group'; group.dataset.group=String(i);
    group.innerHTML=`<div class="sc-group-tabs"><span class="sc-group-head">GROUP ${i+1}</span><div class="sc-split-tools"><button data-act="add" title="Add group">＋</button><button data-act="remove" title="Remove group">−</button></div></div><div class="sc-group-editor"></div>`;
    wrap.appendChild(group);
    const ed=monaco.editor.create(group.querySelector('.sc-group-editor'), {automaticLayout:true,theme:state.settings.theme==='light'?'vs':'vs-dark',minimap:{enabled:state.settings.minimap},fontSize:state.settings.fontSize,fontFamily:'Consolas, "Courier New", monospace',smoothScrolling:true,cursorBlinking:'smooth',padding:{top:8},scrollBeyondLastLine:false});
    const g={element:group, editor:ed, path:null}; enhancement.split.groups.push(g);
    group.addEventListener('mousedown',()=>enhancement.split.activeGroup=i);
    group.addEventListener('click',e=>{ if(e.target.dataset.act==='add') setSplitCount(enhancement.split.groups.length+1); if(e.target.dataset.act==='remove') setSplitCount(enhancement.split.groups.length-1); });
    group.addEventListener('dragover',e=>{if(dragPath){e.preventDefault();e.dataTransfer.dropEffect='move';}});
    group.addEventListener('drop',e=>{if(!dragPath)return;e.preventDefault();const p=dragPath;dragPath=null;setSplitFile(p,i);});
    ed.onDidChangeCursorPosition(()=>{if(i===enhancement.split.activeGroup) updateStatus();});
    ed.onDidChangeCursorSelection(()=>{if(i===enhancement.split.activeGroup) Collab.onCursor();});
    installBreakpointMouse(ed);
  }
  enhancement.split.open = !!open && count>1;
  $('#editor-zone')?.classList.toggle('split-open', enhancement.split.open);
  enhancement.split.groups[enhancement.split.activeGroup || 0]?.editor?.focus();
}
function setSplitCount(count){
  if(count<=1){ toggleSplit(false); return; }
  const old=enhancement.split.groups.map(g=>g.path); const candidate=old[enhancement.split.activeGroup]||state.activePath;
  createSplitGroups(Math.min(3,count),true);
  old.forEach((p,i)=>{if(p&&i<enhancement.split.groups.length)setSplitFile(p,i);});
  if(candidate && !old[enhancement.split.activeGroup]) setSplitFile(candidate,enhancement.split.activeGroup);
  toast(`Split editor: ${Math.min(3,count)} groups`);
}
function toggleSplit(force){
  const open=force===undefined?!enhancement.split.open:!!force;
  if(!open){enhancement.split.open=false;$('#editor-zone')?.classList.remove('split-open');enhancement.split.groups.forEach(g=>{try{g.editor?.dispose()}catch{}});enhancement.split.groups=[];return;}
  if(!enhancement.split.groups.length) createSplitGroups(2,true); else {enhancement.split.open=true;$('#editor-zone').classList.add('split-open');}
  const candidate=state.activePath || state.tabOrder[0]; if(candidate) setSplitFile(candidate,enhancement.split.activeGroup||0);
}
async function setSplitFile(p, groupIndex=enhancement.split.activeGroup||0){
  if(!p) return; if(!state.tabs.has(p)){try{await openFile(p);}catch{}}
  const tab=state.tabs.get(p); if(!tab||tab.isImage||tab.type==='diff') return toast('Split view supports text files only');
  if(!enhancement.split.open) toggleSplit(true);
  const g=enhancement.split.groups[groupIndex]; if(!g)return;
  let model=tab.model; if(!model&&monaco?.editor){const uri=monaco.Uri.file(p);model=monaco.editor.getModel(uri)||monaco.editor.createModel(tab.fallbackText||'',langFor(p),uri);tab.model=model;}
  if(!model)return; g.path=p; enhancement.split.activeGroup=groupIndex; g.editor.setModel(model); renderSplitTabs(); g.editor.focus(); document.body.dataset.activeEditorGroup=String(groupIndex+1);
}
function renderSplitTabs(){ enhancement.split.groups.forEach((g,i)=>{const h=g.element.querySelector('.sc-group-head');h.textContent=`GROUP ${i+1}${g.path?' · '+base(g.path):' · Empty'}`;g.element.classList.toggle('active',i===enhancement.split.activeGroup);}); }

function renderOutline() {
  const box=$('#outline'); if(!box) return;
  const t=state.tabs.get(state.activePath); const model=t?.model; if(!model){ box.innerHTML='<div class="search-info">Open a code file to see symbols.</div>'; return; }
  const lines=model.getLinesContent(); const items=[];
  const re=/^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)|^\s*(?:def|class)\s+([A-Za-z_]\w*)/;
  lines.forEach((line,i)=>{ const m=line.match(re); if(m) items.push({name:m[1]||m[2], line:i+1}); });
  box.innerHTML=items.length?items.slice(0,200).map(x=>`<div class="outline-item">${esc(x.name)} <span class="dim">${x.line}</span></div>`).join(''):'<div class="search-info">No symbols detected.</div>';
  $$('.outline-item',box).forEach((el,i)=>el.onclick=()=>{editor?.revealLineInCenter(items[i].line);editor?.setPosition({lineNumber:items[i].line,column:1});editor?.focus();});
}

function openDebuggerPanel(){ $('#debugger')?.classList.add('active'); $$('.panel-page').forEach(x=>{if(x!==$('#debugger'))x.classList.remove('active')}); $$('.panel-tab').forEach(x=>x.classList.toggle('active',x.dataset.panel==='debugger')); }
function debugCommand(name){ const id=enhancement.run.id; if(!id)return toast('Start Debug first'); const fn={resume:ide.debugResume,pause:ide.debugPause,stepOver:ide.debugStepOver,stepInto:ide.debugStepInto,stepOut:ide.debugStepOut}[name]; if(!fn)return; Promise.resolve(fn(id)).catch(e=>toast(prettyErr(e))); }
async function debugEvaluateUI(){ const expression=$('#dbg-expr')?.value.trim(); if(!expression)return; try{const r=await ide.debugEvaluate({id:enhancement.run.id,expression,callFrameId:enhancement.debugger.callFrameId||undefined}); $('#dbg-result').textContent=JSON.stringify(r?.value!==undefined?r.value:(r||{}),null,2);}catch(e){$('#dbg-result').textContent=prettyErr(e);}}
function installBreakpointMouse(ed){
  ed.onMouseDown(async e=>{
    if(e.target.type!==monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !e.target.position)return;
    const p=[...state.tabs.values()].find(t=>t.model===ed.getModel())?.path;
    if(!p)return; const line=e.target.position.lineNumber; const key=p+':'+line; const existing=enhancement.debugger.breakpoints.get(key);
    if(existing){try{await ide.debugRemoveBreakpoints({id:enhancement.run.id,breakpointIds:[existing.id]});}catch{} enhancement.debugger.breakpoints.delete(key); ed.deltaDecorations(existing.decorations||[],[]); toast(`Breakpoint removed · ${line}`);}
    else {
      const apply=async()=>{try{const r=await ide.debugBreakpoint({id:enhancement.run.id,lineNumber:line,file:p});const bpId=r.breakpointId||('pending-'+Date.now());const dec=ed.deltaDecorations([],[{range:new monaco.Range(line,1,line,1),options:{isWholeLine:false,glyphMarginClassName:'sc-breakpoint'}}]);enhancement.debugger.breakpoints.set(key,{id:bpId,decorations:dec,path:p,line});toast(`Breakpoint set · ${line}`);}catch(e){toast('Debugger breakpoint: '+prettyErr(e));}};
      try { await apply(); } catch {}
    }
  });
}
function renderPaused(params){
  enhancement.debugger.paused=true; const frame=params.callFrames?.[0]; enhancement.debugger.callFrameId=frame?.callFrameId||null;
  $('#dbg-state').textContent=frame?`Paused · ${frame.functionName||'(anonymous)'}:${(frame.location?.lineNumber||0)+1}`:'Paused';
  const stack=$('#dbg-stack'); if(stack){stack.innerHTML=(params.callFrames||[]).slice(0,12).map((f,i)=>`<div class="debug-frame"><b>${esc(f.functionName||'(anonymous)')}</b> · ${esc((f.url||'').replace(/^file:\/\//,''))}:${(f.location?.lineNumber||0)+1}${i===0?' ← current':''}</div>`).join('')||'Paused';}
  const url=String(frame?.url||''); const file=url.startsWith('file:///') ? decodeURIComponent(url.slice(8)).replace(/^\//,'') : ''; const norm=x=>String(x||'').replace(/\\/g,'/').toLowerCase(); const tabEntry=[...state.tabs.values()].find(t=>norm(t.path)===norm(file)); if(tabEntry?.model){ const line=(frame.location?.lineNumber||0)+1; const decOpts={isWholeLine:true,className:'sc-paused-line'}; for(const g of enhancement.split.groups||[]) { if(g.path===tabEntry.path) { enhancement.debugger.pausedDecorations=g.editor.deltaDecorations(enhancement.debugger.pausedDecorations,[{range:new monaco.Range(line,1,line,1),options:decOpts}]); g.editor.revealLineInCenter(line); } } if(editor?.getModel()===tabEntry.model){ enhancement.debugger.pausedDecorations=editor.deltaDecorations(enhancement.debugger.pausedDecorations,[{range:new monaco.Range(line,1,line,1),options:decOpts}]); editor.revealLineInCenter(line); }}
}
function clearDebugState(){ enhancement.debugger.paused=false; enhancement.debugger.callFrameId=null; if(enhancement.debugger.pausedDecorations.length && editor){ enhancement.debugger.pausedDecorations=editor.deltaDecorations(enhancement.debugger.pausedDecorations,[]); } enhancement.split.groups?.forEach(g=>{ if(g.editor&&enhancement.debugger.pausedDecorations.length) enhancement.debugger.pausedDecorations=g.editor.deltaDecorations(enhancement.debugger.pausedDecorations,[]); }); $('#dbg-state')&&( $('#dbg-state').textContent='Disconnected'); }

async function startManagedRun(debug=false) {
  const tab=state.tabs.get(state.activePath); if(!tab || tab.isImage || tab.type==='diff') return toast('Open a runnable file first');
  const p=tab.filePath||tab.path, kind=runKind(p); if(!['node','python'].includes(kind)) return runHtml(p);
  if(tabIsDirty(tab)) await saveTab(tab.path);
  await stopManagedRun(); togglePanel(true);
  try {
    const res=await ide.runStart({root:state.root,file:p,kind,debug});
    enhancement.run={id:res.id,file:p,debug,running:true}; updateRunPill();
    logOutput(`${debug?'Debug':'Run'} started: ${base(p)}`);
    if(debug){ togglePanel(true); openDebuggerPanel(); toast('Node debugger started — breakpoints and stepping are available below.'); }
  } catch(err){ toast('Run failed: '+prettyErr(err)); }
}
async function stopManagedRun(){ if(enhancement.run.id){ try{await ide.runStop(enhancement.run.id);}catch{} } enhancement.run.running=false; updateRunPill(); }
async function restartManagedRun(){ if(!enhancement.run.file){ return startManagedRun(false); } const d=enhancement.run.debug; state.activePath=enhancement.run.file; return startManagedRun(d); }
function updateRunPill(){ const p=$('#run-pill'); if(!p)return; if(!enhancement.run.running){p.classList.add('hidden');p.textContent='';return;} p.classList.remove('hidden');p.classList.toggle('debug',enhancement.run.debug);p.textContent=(enhancement.run.debug?'● DEBUG ':'● RUN ')+base(enhancement.run.file); }

function runActiveEnhanced(){
  const tab=state.tabs.get(state.activePath), p=tab&&(tab.filePath||tab.path), k=p&&runKind(p);
  return k==='node'||k==='python' ? startManagedRun(false) : runActive();
}
function debugActive(){ return startManagedRun(true); }

function renderPackages(){
  const box=$('#packages-body'); if(!box)return;
  if(!state.root){box.innerHTML='<div class="search-info">Open a workspace first.</div>';return;}
  box.innerHTML='<div class="search-info">Scanning workspace…</div>';
  Promise.allSettled([ide.readFile(joinP(state.root,'package.json')),ide.readFile(joinP(state.root,'requirements.txt'))]).then(([pkg,req])=>{
    let html='';
    if(pkg.status==='fulfilled' && !pkg.value.binary){
      try{ const d=JSON.parse(pkg.value.content); const deps={...(d.dependencies||{}),...(d.devDependencies||{})}; html+=`<div class="tool-card"><h3>${esc(d.name||'Node project')}</h3><p>${Object.keys(deps).length} npm package(s)</p><div class="tool-row"><button id="pkg-install" class="sc-btn primary">npm install</button><button id="pkg-update" class="sc-btn">npm update</button></div></div>`; Object.entries(deps).slice(0,80).forEach(([n,v])=>{html+=`<div class="pkg-item"><span class="pkg-name">${esc(n)}</span><span class="pkg-ver">${esc(v)}</span></div>`});}
      catch{html+='<div class="search-info">package.json is invalid JSON.</div>';}
    }
    if(req.status==='fulfilled' && !req.value.binary) html+=`<div class="tool-card"><h3>Python</h3><p>requirements.txt detected</p><div class="tool-row"><button id="pip-install" class="sc-btn primary">pip install -r</button></div></div>`;
    if(!html) html='<div class="search-info">No package manifest detected.</div>';
    box.innerHTML=html;
    $('#pkg-install')?.addEventListener('click',()=>{togglePanel(true);execTerm('npm install');});
    $('#pkg-update')?.addEventListener('click',()=>{togglePanel(true);execTerm('npm update');});
    $('#pip-install')?.addEventListener('click',()=>{togglePanel(true);execTerm('python -m pip install -r requirements.txt');});
  });
}
function extensionStore(){ try{return JSON.parse(localStorage.getItem('wf-extensions')||'[]')}catch{return[]} }
function renderExtensions(){ const box=$('#extensions-body'); if(!box)return; const arr=extensionStore(); box.innerHTML=`<div class="tool-card"><h3>Local extensions</h3><p>SleepCoding keeps extension manifests locally. This first layer is intentionally safe: manifests add commands and metadata without executing arbitrary code.</p><div class="tool-row"><button id="ext-add" class="sc-btn primary">Add manifest</button><button id="ext-clear" class="sc-btn">Reset</button></div></div>`+(arr.length?arr.map(x=>`<div class="tool-card"><h3>${esc(x.name||'Unnamed')}</h3><p>${esc(x.description||'No description')}</p></div>`).join(''):'<div class="search-info">No local extensions yet.</div>'); $('#ext-add').onclick=()=>{try{const v=JSON.parse(prompt('Paste extension manifest JSON')||''); if(!v.name)throw new Error('Manifest needs a name'); const n=[...arr,v];localStorage.setItem('wf-extensions',JSON.stringify(n.slice(-30)));renderExtensions();toast('Extension manifest added');}catch(e){toast('Invalid manifest');}}; $('#ext-clear').onclick=()=>{localStorage.removeItem('wf-extensions');renderExtensions();}; }

/* Better Monaco defaults / IntelliSense ergonomics */
function tuneMonaco(){
  if(!monaco?.editor)return;
  const old=refreshEditorOptions;
  refreshEditorOptions=function(){ old(); if(editor){editor.updateOptions({quickSuggestions:true,suggestOnTriggerCharacters:true,parameterHints:{enabled:true},codeLens:true,folding:true,links:true,mouseWheelZoom:true,stickyScroll:{enabled:true},padding:{top:10,bottom:10},scrollBeyondLastLine:false});} enhancement.split.groups?.forEach(g=>g.editor?.updateOptions({quickSuggestions:true,suggestOnTriggerCharacters:true,parameterHints:{enabled:true},scrollBeyondLastLine:false})); };
  refreshEditorOptions();
}

function installEnhancementCommands(){
  const original=COMMANDS;
  COMMANDS=()=>[...original(),
    {label:'Editor: Toggle Split Editor',run:()=>toggleSplit()},
    {label:'Editor: Focus Active Split Group',run:()=>enhancement.split.groups[enhancement.split.activeGroup]?.editor?.focus()},
    {label:'Editor: Split 2 Groups',run:()=>setSplitCount(2)},
    {label:'Editor: Split 3 Groups',run:()=>setSplitCount(3)},
    {label:'Editor: Outline',run:()=>{togglePanel(true);document.querySelector('[data-panel="outline"]')?.click();renderOutline();}},
    {label:'Editor: Restore Previous Snapshot',run:restorePreviousSnapshot},
    {label:'Run: Run Active File',run:()=>runActiveEnhanced()},
    {label:'Run: Stop Process',run:stopManagedRun},
    {label:'Run: Restart Process',run:restartManagedRun},
    {label:'Debug: Start Node Debugger',run:debugActive},
    {label:'Packages: Refresh',run:renderPackages},
    {label:'Extensions: Open',run:()=>{setView('extensions',true);renderExtensions();}},
    {label:'Theme: SleepCoding Dark',run:()=>setSettings({theme:'dark'})},
    {label:'Theme: Midnight',run:()=>setSettings({theme:'midnight'})},
    {label:'Theme: Light',run:()=>setSettings({theme:'light'})},
    {label:'Preview: Markdown',run:previewMarkdown},
  ];
}

function previewMarkdown(){
  const t=state.tabs.get(state.activePath); if(!t || ext(t.path)!=='md') return toast('Open a Markdown file first');
  const text=getTabText(t); const html=markdownToHtml(text);
  $('#preview-frame').srcdoc=`<!doctype html><html><meta charset="utf-8"><style>body{font:15px system-ui;max-width:900px;margin:40px auto;padding:0 28px;line-height:1.65;background:#10131a;color:#e8edf7}h1,h2,h3{line-height:1.2}code{background:#1b2130;padding:2px 5px;border-radius:4px}pre{background:#0b0e14;padding:14px;border-radius:8px;overflow:auto}a{color:#7dd3fc}blockquote{border-left:3px solid #7dd3fc;padding-left:14px;color:#aeb8ca}</style>${html}</html>`;
  $('#preview-pane').classList.remove('hidden'); $('#preview-url').value='Markdown Preview';
}
function markdownToHtml(s){
  let h=esc(s).replace(/```([\w-]*)\n([\s\S]*?)```/g,(_,l,c)=>`<pre><code>${c}</code></pre>`);
  h=h.replace(/^### (.*)$/gm,'<h3>$1</h3>').replace(/^## (.*)$/gm,'<h2>$1</h2>').replace(/^# (.*)$/gm,'<h1>$1</h1>');
  h=h.replace(/^> (.*)$/gm,'<blockquote>$1</blockquote>').replace(/^\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.split(/\n{2,}/).map(x=>/^<(h|pre|blockquote)/.test(x)?x:`<p>${x.replace(/\n/g,'<br>')}</p>`).join('');
  return h;
}

function wireEnhancementEvents(){
  ide.on('run:data', ({id,data,stream})=>{if(id!==enhancement.run.id)return;const tag=stream==='stderr'?'[stderr] ':' ';logOutput(tag+String(data).replace(/\r?\n$/,''));});
  ide.on('run:exit', ({id,code,duration})=>{if(id!==enhancement.run.id)return; enhancement.run.running=false;updateRunPill();clearDebugState();logOutput(`Process exited with code ${code} after ${(duration/1000).toFixed(1)}s`);flashStatus(code===0?'✓ Process finished':`✖ Exit ${code}`);});
  ide.on('debug:event', msg=>{ if(msg.id!==enhancement.run.id)return; if(msg.event==='connected'||msg.event==='ready'){openDebuggerPanel();$('#dbg-state').textContent='Debugger connected';} if(msg.event==='paused')renderPaused(msg.params||{}); if(msg.event==='resumed'){enhancement.debugger.paused=false;$('#dbg-state').textContent='Running';} if(msg.event==='scriptParsed'&&msg.params?.url) enhancement.debugger.scripts.set(msg.params.url,msg.params); if(msg.event==='error'){logOutput('[debug] '+msg.message);$('#dbg-state').textContent='Debugger error';} if(msg.event==='disconnected')clearDebugState(); });
}

function initEnhancements(){
  ensureEnhancementUI(); installEnhancementCommands(); wireEnhancementEvents();
  const oldSetSettings=setSettings;
  setSettings=function(patch){ oldSetSettings(patch); if(patch.theme!==undefined) applyTheme(patch.theme); if($('#set-theme')) $('#set-theme').value=state.settings.theme||'dark'; if(patch.fontSize!==undefined||patch.minimap!==undefined) refreshEditorOptions(); };
  /* Replace run button behavior after the original UI is wired. */
  if ($('#btn-run')) $('#btn-run').onclick = () => runActiveEnhanced();
  document.addEventListener('dblclick',e=>{ const tab=e.target.closest('#tabs .tab'); if(tab && enhancement.split.open) setSplitFile(tab.dataset.path); });
  $('#panel-body')?.addEventListener('click',()=>setTimeout(renderOutline,30));
  window.addEventListener('keydown',e=>{
    const mod=e.ctrlKey||e.metaKey;
    if(mod&&e.code==='Backslash'){e.preventDefault();toggleSplit();}
    if(mod&&e.shiftKey&&e.code==='Digit2'){e.preventDefault();setSplitCount(2);}
    if(mod&&e.shiftKey&&e.code==='Digit3'){e.preventDefault();setSplitCount(3);}
    if(e.shiftKey&&e.key==='F5'){e.preventDefault();debugActive();}
    if(mod&&e.code==='KeyK'&&e.shiftKey){e.preventDefault();openPalette('command');}
  });
}

/* ============================== entry point ============================ */
function start() {
  if (!window.ide) {
    showBootError('Preload bridge missing', [
      'window.ide is undefined — preload.js did not run.',
      'Restart the app with: npm start'
    ]);
    return;
  }
  state.fx.detected = detectTier();
  initUI();
  ide.bootProgress?.(20, 'Preparing workbench…');

  window.CollabBridge = {
    state, openFile, toast, logOutput, openPath,
    editor: null,
    modelText: (p) => { const t = state.tabs.get(p); return t && t.model ? t.model.getValue() : null; },
    applyRemoteToModel: (p, text) => {
      const t = state.tabs.get(p);
      if (t && t.model && !t.isImage && t.type !== 'diff') {
        Collab.suppress(true);
        t.model.pushEditOperations([], [{ range: t.model.getFullModelRange(), text }], () => null);
        t.savedVersion = t.model.getAlternativeVersionId();
        Collab.suppress(false);
        updateDirtyMarker(p);
      }
    },
    closeTabIfOpen: (p) => { if (state.tabs.has(p)) closeTab(p, true); },
    openWorkspace: async (dir) => { await openPath(dir); }
  };
  Collab.init(window.CollabBridge);

  ide.bootProgress?.(30, 'Starting editor engine…');
  ensureLoader(startMonaco);
  setTimeout(fpsProbe, 5000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();