'use strict';

const path = require('path');
const fsp = require('fs/promises');
const http = require('http');
const net = require('net');
const express = require('express');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');

const INJECT = `<script>(function(){
  var ws;
  function connect(){
    ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/__lr');
    ws.onmessage = function(ev){
      if (ev.data === 'reload') location.reload();
      else if (ev.data === 'css') document.querySelectorAll('link[rel="stylesheet"]')
        .forEach(function(l){ l.href = l.href.split('?')[0] + '?lr=' + Date.now(); });
    };
    ws.onclose = function(){ setTimeout(connect, 700); };
  }
  connect();
})();</script>`;

function firstFreePort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => {
      const s2 = net.createServer();
      s2.listen(0, '127.0.0.1', () => { const p = s2.address().port; s2.close(() => resolve(p)); });
    });
    srv.listen(preferred, '127.0.0.1', () => srv.close(() => resolve(preferred)));
  });
}

class LiveServer {
  constructor() {
    this.root = null; this.port = null; this.httpServer = null;
    this.wss = null; this.watcher = null; this.timer = null;
    this.pending = { reload: false, css: false };
  }

  async start(root, preferredPort = 3000) {
    await this.stop();
    this.root = path.resolve(root);
    const port = await firstFreePort(preferredPort);
    const app = express();

    // inject live-reload snippet into .html responses
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/__lr')) return next();
      let file;
      try { file = path.join(this.root, decodeURIComponent(req.path)); } catch { return next(); }
      if (req.path === '/' || !path.extname(file)) file = path.join(file, 'index.html');
      if (path.extname(file) !== '.html' || !file.startsWith(this.root)) return next();
      try {
        let html = await fsp.readFile(file, 'utf8');
        html = html.includes('</body>') ? html.replace(/<\/body>/i, INJECT + '</body>') : html + INJECT;
        res.set('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } catch { return next(); }
    });

    app.use(express.static(this.root, { extensions: ['html'], dotfiles: 'allow' }));
    app.use(async (_req, res) => {
      try {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(await fsp.readFile(path.join(this.root, 'index.html'), 'utf8'));
      } catch { res.status(404).send('Not found'); }
    });

    this.httpServer = http.createServer(app);
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/__lr' });

    this.watcher = chokidar.watch(this.root, {
      ignoreInitial: true,
      ignored: /(^|[/\\])(node_modules|\.git)([/\\]|$)/,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 }
    });
    this.watcher.on('all', (_ev, file) => {
      if (file.endsWith('.css')) this.pending.css = true; else this.pending.reload = true;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.broadcast(), 120);
    });

    await new Promise((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(port, '127.0.0.1', resolve);
    });
    this.port = port;
    return port;
  }

  broadcast() {
    const msg = this.pending.reload ? 'reload' : (this.pending.css ? 'css' : null);
    this.pending = { reload: false, css: false };
    if (!msg || !this.wss) return;
    for (const c of this.wss.clients) if (c.readyState === 1) c.send(msg);
  }

  async stop() {
    clearTimeout(this.timer);
    if (this.watcher) { await this.watcher.close().catch(() => {}); this.watcher = null; }
    if (this.wss) { for (const c of this.wss.clients) c.terminate(); this.wss = null; }
    if (this.httpServer) { await new Promise(r => this.httpServer.close(r)); this.httpServer = null; }
    this.port = null; this.root = null;
  }
}

module.exports = { LiveServer, firstFreePort };

/* standalone:  node server.js [folder] [port] */
if (require.main === module) {
  const dir = path.resolve(process.argv[2] || process.cwd());
  new LiveServer().start(dir, Number(process.argv[3]) || 3000)
    .then(p => console.log(`Live server → http://localhost:${p}  (${dir})`))
    .catch(err => { console.error(err); process.exit(1); });
}