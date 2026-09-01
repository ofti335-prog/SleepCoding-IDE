/* global ide, monaco, Peer, fflate */
'use strict';

/* ======================================================================
   SleepCoding Collab — serverless P2P sessions over WebRTC DataChannels.
   Host = authority. All frames AES-GCM encrypted with the session key
   embedded in the access code. Snapshot = fflate zip, chunked 60KB.
   PeerJS cloud is used for handshake ONLY (no file data touches it).
   ====================================================================== */
window.Collab = (function () {

  const PEER_OPTS = { debug: 1 };
  const CHUNK = 60 * 1024;
  const EDIT_DEBOUNCE = 160, CURSOR_MS = 100, MAX_FILE = 8 * 1024 * 1024, ECHO_MS = 450;
  const PALETTE = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#b983ff', '#ff9f68', '#4ec9b0', '#f78fb3'];

  const st = {
    role: null, room: null, key: null, peer: null,
    conns: new Map(),            // host: peerId -> conn | guest: 'host' -> conn
    people: new Map(),           // host: 'me' = self; guest: hostPeerId/peerIds
    root: null, dir: null,
    revs: new Map(),             // rel -> rev
    cursors: new Map(),          // peerId -> cursor info
    decs: new Map(),             // peerId -> {model, ids}
    myName: '', myColor: '',
    ready: false, suppress: false,
    lastCursor: null, lastCursorAt: 0,
    editTimers: new Map(),
    echoGuard: new Map(),        // rel -> expiry ts (suppress echo of remote edits)
    snapBuf: null,
  };
  let bridge = null;

  /* ------------------------------ utils ------------------------------- */
  const encB64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000)
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const decB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const hexToBytes = (h) => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
  const bytesToHex = (b) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const randHex = (n) => bytesToHex(crypto.getRandomValues(new Uint8Array(n)));
  const colorIdxFor = (s) => Array.from(String(s)).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length;
  const colorFor = (s) => PALETTE[colorIdxFor(s)];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const sepOf = (p) => p.includes('\\') ? '\\' : '/';
  const joinAbs = (dirp, rel) => { const s = sepOf(dirp); return dirp.endsWith(s) ? dirp + rel : dirp + s + rel; };

  function relOf(abs) {
    if (!st.ready || !abs) return null;
    const base = st.role === 'host' ? st.root : st.dir;
    if (!base || abs === base) return null;
    const s = sepOf(base);
    if (!abs.startsWith(base + s)) return null;
    return abs.slice(base.length + 1).split('\\').join('/');
  }
  const absOf = (rel) => {
    if (!st.ready || !rel) return null;
    return joinAbs(st.role === 'host' ? st.root : st.dir, rel);
  };

  /* --------------------------- crypto (AES-GCM) ------------------------ */
  const newKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  async function keyBytes() { return new Uint8Array(await crypto.subtle.exportKey('raw', st.key)); }
  async function importKey(b) {
    return crypto.subtle.importKey('raw', b, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  async function seal(bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, st.key, bytes));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv); out.set(ct, 12);
    return out;
  }
  async function unseal(frame) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: frame.subarray(0, 12) }, st.key, frame.subarray(12));
    return new Uint8Array(pt);
  }
  const encJSON = async (o) => seal(new TextEncoder().encode(JSON.stringify(o)));
  const decJSON = async (f) => JSON.parse(new TextDecoder().decode(await unseal(f)));

  /* ------------------------------ sending ----------------------------- */
  function rawSend(conn, frame) { try { conn.send(frame); } catch {} }
  async function sendJSON(conn, obj) { rawSend(conn, await encJSON(obj)); }
  async function broadcast(obj) { for (const c of st.conns.values()) if (c.open) await sendJSON(c, obj); }
  async function broadcastExcept(exceptId, obj) {
    for (const [id, c] of st.conns) if (id !== exceptId && c.open) await sendJSON(c, obj);
  }

  /* ------------------------------- peer ------------------------------- */
  function newPeer(id) {
    const p = id ? new Peer(id, PEER_OPTS) : new Peer(PEER_OPTS);
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Signaling timeout — check internet connection')), 15000);
      p.on('open', () => { clearTimeout(to); res(p); });
      p.on('error', (e) => { clearTimeout(to); rej(e); });
    });
  }
  function onceOpen(conn, ms = 15000) {
    return new Promise((res, rej) => {
      if (conn.open) return res();
      const to = setTimeout(() => rej(new Error('Host is not reachable — check the code / ask host to stay online')), ms);
      conn.on('open', () => { clearTimeout(to); res(); });
      conn.on('error', (e) => { clearTimeout(to); rej(new Error(String(e && e.message || e))); });
    });
  }

  /* ---------------------------- snapshot zip -------------------------- */
  async function sendSnapshot(conn) {
    ui.status('Packing workspace…');
    const files = await ide.allFiles(st.root);
    const entries = {}; let skipped = 0;
    for (const abs of files) {
      const rel = relOf(abs); if (!rel) continue;
      try {
        const buf = await ide.readFileRaw(abs);
        if (buf.length > MAX_FILE) { skipped++; continue; }
        entries[rel] = buf;
      } catch {}
    }
    const zip = fflate.zipSync(entries, { level: 1 });
    const total = Math.max(1, Math.ceil(zip.length / CHUNK));
    await sendJSON(conn, { t: 'snap-size', files: Object.keys(entries).length, bytes: zip.length, total, skipped, revs: [...st.revs.entries()] });
    for (let i = 0; i < total; i++) {
      const dc = conn.dataChannel;
      while (dc && dc.bufferedAmount > 4 * 1024 * 1024) await sleep(25);   // backpressure
      await sendJSON(conn, { t: 'bchunk', seq: i, total, d: encB64(zip.subarray(i * CHUNK, (i + 1) * CHUNK)) });
    }
    await sendJSON(conn, { t: 'snap-end' });
  }

  function concat(arr) {
    let len = 0; for (const a of arr) len += a.length;
    const out = new Uint8Array(len); let o = 0;
    for (const a of arr) { out.set(a, o); o += a.length; }
    return out;
  }

  async function receiveSnapshotEnd() {
    ui.status('Unpacking…');
    const parts = [];
    for (let i = 0; i < st.snapBuf.total; i++) parts.push(decB64(st.snapBuf.parts.get(i)));
    const zip = concat(parts);
    const files = fflate.unzipSync(zip);
    let n = 0;
    for (const [rel, data] of Object.entries(files)) {
      await ide.writeFileRaw(joinAbs(st.dir, rel), data);
      if ((++n % 50) === 0) ui.status(`Written ${n}/${Object.keys(files).length}…`);
    }
    ui.status(`Synced ${Object.keys(files).length} files ✓`);
    bridge.toast(`Collab: workspace synced (${Object.keys(files).length} files)`);
    st.snapBuf = null;
    await bridge.openWorkspace(st.dir);
  }

  /* --------------------------- frame handling ------------------------- */
  async function onFrame(conn, frame) {
    let u8 = frame instanceof ArrayBuffer ? new Uint8Array(frame)
      : (frame && frame.buffer ? new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength) : frame);
    if (!(u8 instanceof Uint8Array)) return;
    let msg; try { msg = await decJSON(u8); } catch { return; }
    switch (msg.t) {

      /* ---- host receives ---- */
      case 'hello': {
        st.people.set(conn.peer, { name: msg.name, color: msg.color, host: false });
        ui.people(); ui.chat(null, `${msg.name} joined`);
        await sendJSON(conn, {
          t: 'welcome',
          people: [[st.peer.id, { name: st.myName, color: st.myColor, host: true }],
                   ...[...st.people.entries()].filter(([k]) => k !== 'me' && k !== conn.peer)],
          revs: [...st.revs.entries()]
        });
        await broadcastExcept(conn.peer, { t: 'joined', id: conn.peer, name: msg.name, color: msg.color });
        await sendSnapshot(conn);
        break;
      }
      case 'edit': {
        const cur = st.revs.get(msg.p) || 0;
        if (msg.baseRev !== cur) {   // stale edit → push authoritative version back
          const latest = await readCurrent(msg.p);
          await sendJSON(conn, { t: 'apply', p: msg.p, rev: cur, c: latest });
          break;
        }
        const abs = absOf(msg.p);
        if (!abs) break;
        markEcho(abs);
        await ide.writeFile(abs, msg.c);
        const rev = cur + 1; st.revs.set(msg.p, rev);
        bridge.applyRemoteToModel(abs, msg.c);
        await broadcastExcept(conn.peer, { t: 'apply', p: msg.p, rev, c: msg.c });
        break;
      }
      case 'rm': {
        const abs = absOf(msg.p);
        if (abs) { bridge.closeTabIfOpen(abs); try { await ide.remove(abs); } catch {} }
        st.revs.delete(msg.p);
        await broadcastExcept(conn.peer, { t: 'del', p: msg.p });
        break;
      }
      case 'chat': {
        if (st.role === 'host') {
          const who = st.people.get(conn.peer) || { name: '?', color: '#888' };
          ui.chat(who, msg.text);
          await broadcastExcept(conn.peer, { t: 'chat', from: who, text: msg.text });
        } else {
          ui.chat(msg.from || { name: '?', color: '#888' }, msg.text);
        }
        break;
      }

      /* ---- guest receives ---- */
      case 'welcome': {
        st.people = new Map(msg.people);
        st.revs = new Map(msg.revs);
        ui.people();
        break;
      }
      case 'joined': {
        st.people.set(msg.id, { name: msg.name, color: msg.color, host: false });
        ui.people(); ui.chat(null, `${msg.name} joined`);
        break;
      }
      case 'left': {
        const n = st.people.get(msg.id)?.name;
        st.people.delete(msg.id);
        ui.people(); ui.chat(null, `${n || 'Teammate'} left`);
        clearCursor(msg.id);
        break;
      }
      case 'snap-size': {
        st.snapBuf = { total: msg.total, parts: new Map(), got: 0 };
        st.revs = new Map(msg.revs);
        ui.status(`Snapshot: ${(msg.bytes / 1048576).toFixed(1)} MB · ${msg.files} files`);
        break;
      }
      case 'bchunk': {
        if (!st.snapBuf) break;
        if (!st.snapBuf.parts.has(msg.seq)) {
          st.snapBuf.parts.set(msg.seq, msg.d);
          st.snapBuf.got++;
          if ((st.snapBuf.got % 8) === 0 || st.snapBuf.got === st.snapBuf.total)
            ui.status(`Downloading ${st.snapBuf.got}/${st.snapBuf.total} chunks…`);
        }
        break;
      }
      case 'snap-end': { if (st.snapBuf) await receiveSnapshotEnd(); break; }

      /* ---- both roles ---- */
      case 'apply': {
        st.revs.set(msg.p, msg.rev);
        const abs = absOf(msg.p);
        if (!abs) break;
        const curText = bridge.modelText(abs);
        if (curText === msg.c) break;
        markEcho(abs);
        await ide.writeFile(abs, msg.c);
        bridge.applyRemoteToModel(abs, msg.c);
        break;
      }
      case 'del': {
        const abs = absOf(msg.p);
        if (abs) { bridge.closeTabIfOpen(abs); try { await ide.remove(abs); } catch {} }
        st.revs.delete(msg.p);
        break;
      }
      case 'cursor': {
        const pid = st.role === 'host' ? conn.peer
          : (msg.id === 'me' ? (st.conns.get('host') && st.conns.get('host').peer) : msg.id);
        if (!pid) break;
        const person = st.people.get(pid) || { name: '?', color: '#888' };
        st.cursors.set(pid, { abs: absOf(msg.p), sel: msg.sel,
          name: person.name, color: person.color, idx: colorIdxFor(pid) });
        renderCursor(pid);
        if (st.role === 'host')
          await broadcastExcept(conn.peer, { t: 'cursor', id: conn.peer, p: msg.p, sel: msg.sel });
        break;
      }
    }
  }

  async function readCurrent(rel) {
    try { const r = await ide.readFile(absOf(rel)); return r.binary ? '' : r.content; } catch { return ''; }
  }

  /* --------------------------- echo guard ----------------------------- */
  function markEcho(absPath) {
    const rel = relOf(absPath);
    if (rel) st.echoGuard.set(rel, Date.now() + ECHO_MS);
  }
  function isEcho(absPath) {
    const rel = relOf(absPath);
    if (!rel) return false;
    const until = st.echoGuard.get(rel) || 0;
    if (until > Date.now()) return true;
    st.echoGuard.delete(rel);
    return false;
  }

  /* --------------------------- host / guest --------------------------- */
  function wireHost() {
    st.peer.on('connection', (conn) => {
      if (st.conns.has(conn.peer)) { try { st.conns.get(conn.peer).close(); } catch {} }
      st.conns.set(conn.peer, conn);
      conn.on('data', (f) => onFrame(conn, f));
      conn.on('close', () => dropPeer(conn.peer));
      conn.on('error', () => dropPeer(conn.peer));
    });
    st.peer.on('disconnected', () => { try { st.peer.reconnect(); } catch {} });
  }

  function dropPeer(id) {
    if (!st.conns.has(id)) return;
    st.conns.delete(id);
    const n = st.people.get(id)?.name;
    st.people.delete(id);
    ui.people(); ui.chat(null, `${n || 'Teammate'} disconnected`);
    clearCursor(id);
    broadcast({ t: 'left', id }).catch(() => {});
  }

  async function create() {
    const name = ui.getName(); if (!name) return;
    if (!bridge.state.root) return bridge.toast('Open a folder first');
    ui.busy(true); ui.status('Creating session…');
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const room = randHex(10);
        try {
          st.key = await newKey();
          st.peer = await newPeer('slp-' + room);
          st.role = 'host'; st.room = room; st.root = bridge.state.root;
          st.myName = name; st.myColor = colorFor(name);
          st.people = new Map([['me', { name, color: st.myColor, host: true }]]);
          st.ready = true;
          wireHost();
          const code = `SC1.${encB64(hexToBytes(room))}.${encB64(await keyBytes())}`;
          ui.enter('host', room, code);
          bridge.logOutput(`Collab: session created (${room.slice(0, 8)}…)`);
          return;
        } catch (e) {
          cleanup();
          if (attempt === 1) throw e;
        }
      }
    } catch (e) { ui.error(e); cleanup(); }
    finally { ui.busy(false); }
  }

  async function join() {
    const name = ui.getName(); if (!name) return;
    const code = document.querySelector('#cl-joincode').value.trim();
    const parts = code.split('.');
    if (parts.length !== 3 || parts[0] !== 'SC1') return ui.error(new Error('Invalid access code format'));
    ui.busy(true); ui.status('Connecting to host…');
    try {
      st.key = await importKey(decB64(parts[2]));
      const room = bytesToHex(decB64(parts[1]));
      st.peer = await newPeer(null);
      const conn = st.peer.connect('slp-' + room, { reliable: true });
      await onceOpen(conn);
      st.role = 'guest'; st.room = room;
      st.myName = name; st.myColor = colorFor(name);
      conn.on('data', (f) => onFrame(conn, f));
      conn.on('close', () => {
        if (st.role === 'guest') { ui.error(new Error('Host disconnected — your local copy is kept')); cleanup(true); }
      });
      conn.on('error', () => {});
      st.conns.set('host', conn);
      st.ready = true;
      const r = await ide.collabDir(room.slice(0, 8));   // prepare folder BEFORE hello
      st.dir = r.dir;
      await sendJSON(conn, { t: 'hello', name, color: st.myColor });
      ui.enter('guest', room, code);
      bridge.logOutput(`Collab: joined session ${room.slice(0, 8)}… → ${st.dir}`);
    } catch (e) { ui.error(e); cleanup(true); }
    finally { ui.busy(false); }
  }

  function leave() {
    cleanup(true);
    bridge.toast('Left the session');
  }

  function cleanup(keepUi) {
    try { st.peer && st.peer.destroy(); } catch {}
    st.peer = null; st.conns.clear(); st.people.clear(); st.cursors.clear();
    st.revs.clear(); st.snapBuf = null; st.ready = false; st.role = null;
    for (const t of st.editTimers.values()) clearTimeout(t);
    st.editTimers.clear(); st.echoGuard.clear();
    for (const id of [...st.decs.keys()]) clearCursor(id);
    if (keepUi) ui.reset();
  }

  /* ------------------- hooks called from app.js ----------------------- */
  function onLocalEdit(absPath) {
    if (!st.ready || st.role !== 'guest' || st.suppress) return;
    if (isEcho(absPath)) return;
    const rel = relOf(absPath); if (!rel) return;
    clearTimeout(st.editTimers.get(rel));
    st.editTimers.set(rel, setTimeout(async () => {
      const c = bridge.modelText(absPath);
      if (c === null) return;
      const conn = st.conns.get('host');
      if (conn && conn.open) await sendJSON(conn, { t: 'edit', p: rel, baseRev: st.revs.get(rel) || 0, c });
    }, EDIT_DEBOUNCE));
  }

  async function onSaved(absPath, text) {
    if (!st.ready || st.role !== 'host') return;
    const rel = relOf(absPath); if (!rel) return;
    const rev = (st.revs.get(rel) || 0) + 1;
    st.revs.set(rel, rev);
    await broadcast({ t: 'apply', p: rel, rev, c: text });
  }

  async function onDeleted(absPath) {
    if (!st.ready) return;
    const rel = relOf(absPath); if (!rel) return;
    if (st.role === 'host') {
      st.revs.delete(rel);
      await broadcast({ t: 'del', p: rel });
    } else {
      const c = st.conns.get('host');
      if (c && c.open) await sendJSON(c, { t: 'rm', p: rel });
    }
  }

  function onCursor() {
    if (!st.ready) return;
    const now = Date.now();
    if (now - st.lastCursorAt < CURSOR_MS) return;
    const ed = bridge.editor; if (!ed) return;
    const sel = ed.getSelection(); if (!sel) return;
    const abs = bridge.state.activePath; const rel = relOf(abs);
    if (!rel) return;
    const j = { a: { l: sel.anchorLineNumber, c: sel.anchorColumn }, h: { l: sel.headLineNumber, c: sel.headColumn } };
    const sig = rel + JSON.stringify(j);
    if (sig === st.lastCursor) return;
    st.lastCursor = sig; st.lastCursorAt = now;
    if (st.role === 'guest') {
      const conn = st.conns.get('host');
      if (conn && conn.open) sendJSON(conn, { t: 'cursor', p: rel, sel: j });
    } else {
      broadcast({ t: 'cursor', id: 'me', p: rel, sel: j });
    }
  }

  /* ------------------------- remote cursors --------------------------- */
  function renderCursor(id) {
    if (typeof monaco === 'undefined' || !bridge || !bridge.editor) return;
    const model = bridge.editor.getModel(); if (!model) return;
    const cur = st.cursors.get(id);
    const old = st.decs.get(id);
    if (old) { try { old.model.deltaDecorations(old.ids, []); } catch {} st.decs.delete(id); }
    if (!cur || bridge.state.activePath !== cur.abs) return;
    const cls = `rc-hl-${cur.idx}`;
    const range = new monaco.Range(cur.sel.a.l, cur.sel.a.c, cur.sel.h.l, cur.sel.h.c);
    const opts = { className: cls, stickiness: 1 };
    if (cur.sel.a.l === cur.sel.h.l && cur.sel.a.c === cur.sel.h.c)
      opts.after = { content: ' ' + cur.name, inlineClassName: `rc-tag-${cur.idx}` };
    const ids = model.deltaDecorations([], [{ range, options: opts }]);
    st.decs.set(id, { model, ids });
  }
  function renderCursors() { for (const id of st.cursors.keys()) renderCursor(id); }
  function clearCursor(id) {
    const old = st.decs.get(id);
    if (old) { try { old.model.deltaDecorations(old.ids, []); } catch {} st.decs.delete(id); }
    st.cursors.delete(id);
  }

  /* ------------------------------- chat ------------------------------- */
  async function sendChat() {
    const inp = document.querySelector('#cl-chatin');
    const text = inp.value.trim(); if (!text) return;
    inp.value = '';
    ui.chat({ name: st.myName + ' (you)', color: st.myColor }, text);
    if (st.role === 'host') await broadcast({ t: 'chat', from: { name: st.myName, color: st.myColor }, text });
    else { const c = st.conns.get('host'); if (c && c.open) await sendJSON(c, { t: 'chat', text }); }
  }

  /* -------------------------------- UI -------------------------------- */
  const ui = {
    q: (s) => document.querySelector(s),
    getName() { return this.q('#cl-name').value.trim() || ('Guest-' + Math.floor(10 + Math.random() * 90)); },
    busy(b) { this.q('#cl-create').disabled = b; this.q('#cl-join').disabled = b; },
    enter(role, room, code) {
      this.q('#cl-setup').classList.add('hidden');
      this.q('#cl-active').classList.remove('hidden');
      this.q('#cl-roomid').textContent = room.slice(0, 8);
      this.q('#cl-role').textContent = role === 'host' ? 'host' : 'guest';
      this.q('#cl-code').value = code;
      this.q('#cl-resend').style.display = role === 'host' ? '' : 'none';
      this.q('#cl-status').textContent = role === 'host' ? 'Waiting for teammates…' : 'Connected. Receiving files…';
      this.people();
    },
    reset() {
      this.q('#cl-active').classList.add('hidden');
      this.q('#cl-setup').classList.remove('hidden');
      this.q('#cl-status').textContent = '';
      this.q('#cl-people').innerHTML = '';
      this.q('#cl-chatlog').innerHTML = '';
    },
    people() {
      const box = this.q('#cl-people'); if (!box) return;
      box.innerHTML = '';
      const me = document.createElement('div');
      me.className = 'cl-person';
      me.innerHTML = `<span class="cl-dot" style="background:${st.myColor}"></span>${esc(st.myName)} <span class="dim">(${st.role || '—'})</span>`;
      box.appendChild(me);
      for (const [id, p] of st.people) {
        if (st.role === 'host' && id === 'me') continue;   // skip self entry (host-side key)
        const el = document.createElement('div');
        el.className = 'cl-person';
        el.innerHTML = `<span class="cl-dot" style="background:${p.color}"></span>${esc(p.name)}${p.host ? ' <span class="dim">(host)</span>' : ''}`;
        box.appendChild(el);
      }
    },
    status(t) { const el = this.q('#cl-status'); if (el) el.textContent = t; },
    chat(from, text) {
      const log = this.q('#cl-chatlog'); if (!log) return;
      const row = document.createElement('div');
      row.className = 'cl-msg';
      if (from) row.innerHTML = `<span class="cl-dot" style="background:${from.color}"></span><b>${esc(from.name)}:</b> ${esc(text)}`;
      else { row.classList.add('sys'); row.textContent = '— ' + text + ' —'; }
      log.appendChild(row);
      while (log.children.length > 100) log.firstChild.remove();
      log.scrollTop = log.scrollHeight;
    },
    error(e) { bridge.toast('Collab: ' + String(e && e.message || e)); this.status(''); }
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* -------------------------------- init ------------------------------ */
  function init(b) {
    bridge = b;
    const q = ui.q.bind(ui);
    q('#cl-create').onclick = create;
    q('#cl-join').onclick = join;
    q('#cl-leave').onclick = leave;
    q('#cl-copy').onclick = () => { navigator.clipboard.writeText(q('#cl-code').value); bridge.toast('Access code copied'); };
    q('#cl-resend').onclick = async () => {
      for (const c of st.conns.values()) if (c.open) await sendSnapshot(c);
      bridge.toast('Snapshot resent');
    };
    q('#cl-chatsend').onclick = sendChat;
    q('#cl-chatin').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
    window.addEventListener('beforeunload', () => { try { st.peer && st.peer.destroy(); } catch {} });
  }

  return {
    init, onLocalEdit, onSaved, onDeleted, onCursor, renderCursors,
    markEcho,
    suppress: (v) => { st.suppress = v; },
    isActive: () => st.ready
  };
})();