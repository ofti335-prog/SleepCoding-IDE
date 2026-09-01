'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = new Set([
  'fs:event', 'terminal:data', 'pty:data', 'pty:exit', 'win:maximized',
  'win:blur', 'win:focus', 'win:mica', 'power:state', 'app:ask-quit', 'run:data', 'run:exit', 'debug:event', 'boot:progress', 'boot:complete', 'boot:error'
]);

contextBridge.exposeInMainWorld('ide', {
  platform: process.platform,

  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openPath: (p) => ipcRenderer.invoke('dialog:openPath', p),
  saveAs: (opts) => ipcRenderer.invoke('dialog:saveAs', opts),
  versions: () => ipcRenderer.invoke('app:versions'),
  bootProgress: (percent, text) => ipcRenderer.send('boot:progress', { percent, text }),
  bootReady: () => ipcRenderer.send('boot:complete'),
  bootError: (message) => ipcRenderer.send('boot:error', { message }),

  readDir: (p) => ipcRenderer.invoke('fs:readDir', p),
  readFile: (p) => ipcRenderer.invoke('fs:readFile', p),
  readFileDataUrl: (p) => ipcRenderer.invoke('fs:readFileDataUrl', p),
  writeFile: (p, c) => ipcRenderer.invoke('fs:writeFile', p, c),
  createFile: (dir, name) => ipcRenderer.invoke('fs:createFile', dir, name),
  createDir: (dir, name) => ipcRenderer.invoke('fs:createDir', dir, name),
  rename: (t, n) => ipcRenderer.invoke('fs:rename', t, n),
  move: (s, d) => ipcRenderer.invoke('fs:move', s, d),
  duplicate: (p) => ipcRenderer.invoke('fs:duplicate', p),
  paste: (o) => ipcRenderer.invoke('fs:paste', o),
  copyInto: (s, d) => ipcRenderer.invoke('fs:copyInto', s, d),
  remove: (p) => ipcRenderer.invoke('fs:remove', p),
  allFiles: (r) => ipcRenderer.invoke('fs:allFiles', r),
  reveal: (p) => ipcRenderer.invoke('fs:reveal', p),
  openExternal: (u) => ipcRenderer.invoke('shell:openExternal', u),
  search: (o) => ipcRenderer.invoke('fs:search', o),

  pythonCmd: () => ipcRenderer.invoke('run:pythonCmd'),
  runStart: (o) => ipcRenderer.invoke('run:start', o),
  runStop: (id) => ipcRenderer.invoke('run:stop', id),
  runStopAll: () => ipcRenderer.invoke('run:stopAll'),
  runList: () => ipcRenderer.invoke('run:list'),
  debugStatus: (id) => ipcRenderer.invoke('debug:status', id),
  debugResume: (id) => ipcRenderer.invoke('debug:resume', id),
  debugPause: (id) => ipcRenderer.invoke('debug:pause', id),
  debugStepOver: (id) => ipcRenderer.invoke('debug:stepOver', id),
  debugStepInto: (id) => ipcRenderer.invoke('debug:stepInto', id),
  debugStepOut: (id) => ipcRenderer.invoke('debug:stepOut', id),
  debugBreakpoint: (o) => ipcRenderer.invoke('debug:breakpoint', o),
  debugRemoveBreakpoints: (o) => ipcRenderer.invoke('debug:removeBreakpoints', o),
  debugEvaluate: (o) => ipcRenderer.invoke('debug:evaluate', o),

  collabDir: (room) => ipcRenderer.invoke('collab:dir', room),
  readFileRaw: (p) => ipcRenderer.invoke('fs:readFileRaw', p),
  writeFileRaw: (p, u8) => ipcRenderer.invoke('fs:writeFileRaw', p, u8),

  ptyCreate: (cwd) => ipcRenderer.invoke('pty:create', cwd),
  ptyInput: (id, data) => ipcRenderer.invoke('pty:input', { id, data }),
  ptyResize: (id, cols, rows) => ipcRenderer.invoke('pty:resize', { id, cols, rows }),
  ptyDispose: (id) => ipcRenderer.invoke('pty:dispose', id),
  termCreate: (r) => ipcRenderer.invoke('terminal:create', r),
  termRun: (id, cmd) => ipcRenderer.invoke('terminal:run', { id, cmd }),

  gitStatus: (root) => ipcRenderer.invoke('git:status', root),
  gitStage: (root, paths) => ipcRenderer.invoke('git:stage', { root, paths }),
  gitStageAll: (root) => ipcRenderer.invoke('git:stageAll', root),
  gitUnstage: (root, paths) => ipcRenderer.invoke('git:unstage', { root, paths }),
  gitDiscard: (root, paths) => ipcRenderer.invoke('git:discard', { root, paths }),
  gitCommit: (root, message) => ipcRenderer.invoke('git:commit', { root, message }),
  gitBranches: (root) => ipcRenderer.invoke('git:branches', root),
  gitCheckout: (root, branch, create) => ipcRenderer.invoke('git:checkout', { root, branch, create }),
  gitPush: (root, token) => ipcRenderer.invoke('git:push', { root, token }),
  gitPull: (root) => ipcRenderer.invoke('git:pull', root),
  gitInit: (root) => ipcRenderer.invoke('git:init', root),
  gitPublish: (o) => ipcRenderer.invoke('git:publish', o),
  gitShow: (root, p) => ipcRenderer.invoke('git:show', { root, p }),

  previewStart: (o) => ipcRenderer.invoke('preview:start', o),
  previewStop: () => ipcRenderer.invoke('preview:stop'),

  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),
  quit: () => ipcRenderer.send('app:quit'),
  cancelQuit: () => ipcRenderer.send('app:cancel-quit'),
  toggleDevtools: () => ipcRenderer.send('win:devtools'),

  on: (channel, cb) => {
    if (!EVENTS.has(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  }
});