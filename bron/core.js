/* =====================================================================
   PomGames (PG) — kern
   - Log van de laatste run (lokaal + online als je bent ingelogd)
   - Game-register: elke game meldt zich aan met PG.register({...})
   - Een game draait in een eigen "zandbak": luisteraars, timers en
     animaties worden bij het sluiten automatisch opgeruimd.
   - Scores: de haak zit erin (ctx.score), opslaan staat nog uit.
   ===================================================================== */
(() => {
'use strict';
const PG_VERSION = '1.1.0';
const T0 = performance.now();
const qs = new URLSearchParams(location.search);
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
const STANDALONE = !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone);
const store = {
  get(k, d) { try { const v = localStorage.getItem('pg.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pg.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('pg.' + k); } catch (e) {} }
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- LOG van de laatste run ---------------- */
const Log = (() => {
  const prev = store.get('lastlog', null);
  if (prev) store.set('prevlog', prev);
  const d = { app: 'PomGames', run: Math.random().toString(36).slice(2, 8), version: PG_VERSION, started: new Date().toISOString(),
    env: IN_CLAUDE ? 'claude-artifact' : STANDALONE ? 'app (beginscherm)' : 'browser', url: location.origin + location.pathname,
    ua: navigator.userAgent.slice(0, 180), screen: `${screen.width}x${screen.height} dpr${window.devicePixelRatio || 1} venster${innerWidth}x${innerHeight}`,
    user: '', errors: 0, games: [], entries: [] };
  let dirty = true, remote = null, remoteAt = 0, busy = false;
  function add(kind, msg, tag = 'pg') {
    const t = ((performance.now() - T0) / 1000).toFixed(1).padStart(6, ' ');
    d.entries.push(`${t}s ${String(kind).padEnd(5)} ${String(tag).padEnd(2)} ${String(msg).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 220)}`);
    if (d.entries.length > 500) d.entries.splice(0, d.entries.length - 500);
    if (kind === 'err') { d.errors++; setTimeout(() => flush(true), 150); }
    dirty = true;
  }
  async function flush(force) {
    if (!dirty) return;
    dirty = false; d.saved = new Date().toISOString();
    store.set('lastlog', d);
    if (remote && !busy && (force || Date.now() - remoteAt > 30000)) {
      busy = true; remoteAt = Date.now();
      try { await remote(JSON.parse(JSON.stringify(d))); } catch (e) { dirty = true; }
      busy = false;
    }
  }
  const text = () => [`PomGames log  run=${d.run}  v${d.version}  omgeving=${d.env}  speler=${d.user || '-'}`, `start ${d.started}`, `adres ${d.url}`,
    `toestel ${d.ua}`, `scherm ${d.screen}`, `games ${d.games.join(', ') || '-'}`, `fouten ${d.errors}`, '', ...d.entries].join('\n');
  setInterval(flush, 3000);
  document.addEventListener('visibilitychange', () => { add('info', document.visibilityState === 'hidden' ? 'app naar achtergrond' : 'app weer zichtbaar'); if (document.visibilityState === 'hidden') flush(true); });
  addEventListener('pagehide', () => { dirty = true; flush(true); });
  return { add, flush, text, setRemote(fn) { remote = fn; dirty = true; flush(true); }, setUser(n) { d.user = n || ''; dirty = true; },
    noteGame(id) { if (!d.games.includes(id)) d.games.push(id); }, games: () => d.games.slice() };
})();
let curTag = () => 'pg';
addEventListener('error', e => Log.add('err', `${e.message || 'fout'} @${String(e.filename || '').split('/').pop()}:${e.lineno || 0}`, curTag()));
addEventListener('unhandledrejection', e => { const r = e.reason; Log.add('err', 'promise: ' + (r ? (r.code ? r.code + ' ' : '') + (r.message || r.type || String(r)) : '?'), curTag()); });
Log.add('info', `start PomGames v${PG_VERSION} omgeving=${IN_CLAUDE ? 'claude' : STANDALONE ? 'app' : 'browser'}`);

/* ---------------- kleine hulpjes ---------------- */
let toastT = 0;
function toast(msg, ms = 2400) {
  const el = document.getElementById('pg-toast'); if (!el) return;
  el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}
const COLORS = ['var(--pg-k1)', 'var(--pg-k2)', 'var(--pg-k3)', 'var(--pg-k4)', 'var(--pg-k5)', 'var(--pg-k6)', 'var(--pg-k7)'];
function hueOf(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
const avatar = name => `<span class="pg-av" style="--av:${hueOf(String(name).toLowerCase())}" aria-hidden="true">${esc(String(name || '?').slice(0, 1).toUpperCase())}</span>`;

/* ---------------- mini-plaatjes ---------------- */
function thumb(t) {
  if (!t || !t.rows) return '';
  let h = '<span class="pg-th" aria-hidden="true">';
  t.rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (t.type === 'blocks') h += ch === '.' ? '<i class="e"></i>' : `<i class="b k${ch}"></i>`;
    else if (t.type === 'mines') h += ch === 'h' ? '<i class="h"></i>' : ch === 'f' ? '<i class="h f"></i>' : ch === 'g' ? '<i class="h g"></i>' : `<i class="r n${ch}">${ch === '0' ? '' : ch}</i>`;
    else if (t.type === 'tiles') { const k = (c - r + 5) % 5; h += ch === '.' ? `<i class="t w c${k}"></i>` : `<i class="t c${k}"></i>`; }
    else if (t.type === 'bombs') h += `<i class="${({ '#': 'hw', x: 'sb', '+': 'fl', o: 'bo', r: 'pr', b: 'pb' })[ch] || 'e'}"></i>`;
  }));
  return h + '</span>';
}
function thumbOf(g) {
  if (g && g.thumb && g.thumb.rows) return thumb(g.thumb);
  return `<span class="pg-th lt" aria-hidden="true" style="--acc:${g ? g.accent : 'var(--pg-k2)'}"><b>${esc(String((g && g.name) || '?').slice(0, 1).toUpperCase())}</b></span>`;
}

/* ---------------- SCORES: klaar voor later, staat nu uit ----------------
   Elke game meldt een uitslag met ctx.score({ mode, result, ... }).
   Nu wordt de uitslag alleen gelogd. Zet later `enabled` aan en vul save() in, bijvoorbeeld:
     users/<uid>/scores/<game>          { played, won, best, updatedAt }
     leaderboards/<game>/entries/<uid>  { name, best, won, updatedAt }            */
const Scores = {
  enabled: false,
  seen: new WeakSet(),
  report(game, data) {
    try {
      if (!data || typeof data !== 'object') return;
      const r = data.result && typeof data.result === 'object' ? data.result : null;
      if (r) { if (this.seen.has(r)) return; this.seen.add(r); }
      const s = { mode: String(data.mode || '') };
      for (const k of ['points', 'moves', 'lines']) if (typeof data[k] === 'number') s[k] = data[k];
      if (r) {
        for (const k of ['winner', 'me', 'mine', 'theirs', 'gone', 'level', 'kind', 'size']) if (r[k] !== undefined && typeof r[k] !== 'object') s[k] = r[k];
        for (const k of ['pts', 'score']) if (Array.isArray(r[k])) s[k] = r[k].slice(0, 2);
      }
      Log.add('score', `${game} ${JSON.stringify(s)}`.slice(0, 200), byId[game] ? byId[game].short : 'pg');
      if (this.enabled) this.save(game, s).catch(e => Log.add('err', 'score opslaan: ' + (e && e.message)));
    } catch (e) { Log.add('err', 'score: ' + (e && e.message)); }
  },
  async save(game, s) { /* later: via PG.backend opslaan */ }
};

/* ---------------- GAME-REGISTER ----------------
   Ingebouwde games melden zich aan met PG.register().
   Geïmporteerde games (door de beheerder, via Firebase) komen uit de catalogus
   en draaien in een eigen iframe. Een import met dezelfde id vervangt de ingebouwde versie. */
const games = [], byId = Object.create(null);
function register(def) {
  if (!def || !def.id || byId[def.id]) return;
  def.builtin = true; def.invite = true;
  games.push(def); byId[def.id] = def;
}
const ACCENTS = { k1: 'var(--pg-k1)', k2: 'var(--pg-k2)', k3: 'var(--pg-k3)', k4: 'var(--pg-k4)', k5: 'var(--pg-k5)', k6: 'var(--pg-k6)', k7: 'var(--pg-k7)' };
let catalog = {}, imported = Object.create(null);
function importedDef(id, d) {
  const g = {
    id, short: id.slice(0, 2), name: String(d.name || id).slice(0, 30), accent: ACCENTS[d.accent] || ACCENTS.k2, accentKey: ACCENTS[d.accent] ? d.accent : 'k2',
    tagline: String(d.tagline || '').slice(0, 120), modes: Array.isArray(d.modes) ? d.modes.map(String).slice(0, 5) : [],
    thumb: null, imported: true, version: d.version | 0, size: d.size | 0, invite: !!d.invite, aware: !!d.aware,
    updatedAt: d.updatedAt || 0, createdAt: d.createdAt || 0, replaces: !!byId[id]
  };
  g.mount = ctx => frameMount(g, ctx);
  return g;
}
function setCatalog(docs) {
  catalog = docs || {};
  imported = Object.create(null);
  for (const [id, d] of Object.entries(catalog)) if (d && (d.version | 0) > 0 && /^[a-z0-9]{2,24}$/.test(id)) imported[id] = importedDef(id, d);
  store.set('catalog', catalog);
}
setCatalog(store.get('catalog', {}));
const def = id => imported[id] || byId[id] || null;
function allGames() {
  const ids = games.map(g => g.id);
  const extra = Object.keys(imported).filter(id => !byId[id]).sort((a, b) => (imported[a].createdAt || 0) - (imported[b].createdAt || 0) || (a < b ? -1 : 1));
  return ids.concat(extra).map(def);
}
const isHidden = id => !!(catalog[id] && catalog[id].hidden);
const visibleGames = () => allGames().filter(g => !isHidden(g.id));

/* ---------------- ZANDBAK: alles wat een game aan window/document hangt, ruimen we op ---------------- */
function makeEnv(rec) {
  const on = (target, t, f, o) => { target.addEventListener(t, f, o); rec.listeners.push([target, t, f, o]); };
  const off = (target, t, f, o) => target.removeEventListener(t, f, o);
  const doc = new Proxy(document, {
    get(tg, prop) {
      if (prop === 'addEventListener') return (t, f, o) => on(document, t, f, o);
      if (prop === 'removeEventListener') return (t, f, o) => off(document, t, f, o);
      const v = Reflect.get(tg, prop, tg);
      return typeof v === 'function' ? v.bind(tg) : v;
    },
    set(tg, prop, val) { return Reflect.set(tg, prop, val, tg); }
  });
  const RO = window.ResizeObserver ? class extends window.ResizeObserver { constructor(cb) { super(cb); rec.observers.push(this); } } : undefined;
  return {
    document: doc,
    addEventListener: (t, f, o) => on(window, t, f, o),
    removeEventListener: (t, f, o) => off(window, t, f, o),
    setTimeout: (f, ms, ...a) => {
      if (rec.closing) return window.setTimeout(f, ms, ...a);
      const id = window.setTimeout(() => { rec.timeouts.delete(id); if (rec.alive) f(...a); }, ms);
      rec.timeouts.add(id); return id;
    },
    clearTimeout: id => { rec.timeouts.delete(id); window.clearTimeout(id); },
    setInterval: (f, ms, ...a) => { const id = window.setInterval(() => { if (rec.alive) f(...a); }, ms); rec.intervals.add(id); return id; },
    clearInterval: id => { rec.intervals.delete(id); window.clearInterval(id); },
    requestAnimationFrame: f => { const id = window.requestAnimationFrame(t => { rec.rafs.delete(id); if (rec.alive) f(t); }); rec.rafs.add(id); return id; },
    cancelAnimationFrame: id => { rec.rafs.delete(id); window.cancelAnimationFrame(id); },
    ResizeObserver: RO
  };
}

const caps = {};
function cap(name) {
  if (!IN_CLAUDE) return Promise.resolve(null);
  if (!caps[name]) caps[name] = Promise.resolve().then(() => window.claude.use(name)).catch(e => { Log.add('err', `capability ${name}: ${e && (e.code || e.message)}`); return null; });
  return caps[name];
}
const joined = {};

let cur = null;
const hooks = { onOpen: [], onClose: [] };
function isOpen() { return !!cur; }
function current() { return cur ? { id: cur.id, opts: cur.opts } : null; }

function open(id, opts = {}) {
  const def = opts.preview || PG.def(id);
  if (!def) { Log.add('err', 'onbekende game: ' + id); return false; }
  if (cur) unmount();
  const rec = { alive: true, closing: false, listeners: [], timeouts: new Set(), intervals: new Set(), rafs: new Set(), observers: [] };
  const style = def.imported ? null : document.getElementById('pgcss-' + id), tpl = def.imported ? null : document.getElementById('pgtpl-' + id);
  const htmlStyle = document.documentElement.getAttribute('style');
  if (style) style.media = 'all';
  document.body.classList.add('pg-play');
  document.getElementById('pg-stage').replaceChildren(tpl ? tpl.content.cloneNode(true) : '');
  const params = new URLSearchParams();
  for (const k of ['join', 'host']) if (opts[k]) params.set(k, String(opts[k]));
  for (const k of ['net', 'test']) if (qs.has(k)) params.set(k, qs.get(k));
  const opp = opts.opp && opts.opp.uid ? { uid: String(opts.opp.uid), name: String(opts.opp.name || 'Tegenstander') } : null;
  const me = PG.me ? PG.me() : null;
  const ctx = {
    id, env: makeEnv(rec), params,
    playerName: me ? me.name : '',
    opponent: opp,
    log: { add: (k, m) => Log.add(k, m, def.short), flush: () => Log.flush(true), text: () => Log.text() },
    room() {
      if (!IN_CLAUDE) return Promise.resolve(null);
      if (joined[id]) return joined[id];
      const p = (async () => {
        const lobby = await cap('room');
        if (!lobby) { Log.add('net', 'realtime kamer niet beschikbaar', def.short); return null; }
        try { const r = await lobby.join('pg-' + id); Log.add('net', `kamer pg-${id} open`, def.short); return r; }
        catch (e) { Log.add('net', `eigen kamer lukt niet (${e && e.code}), lobby gebruikt`, def.short); delete joined[id]; return lobby; }
      })();
      joined[id] = p; return p;
    },
    exit: () => closeGame(),
    shareUrl: code => location.origin + location.pathname + '?g=' + encodeURIComponent(id) + '&join=' + encodeURIComponent(code),
    score: data => Scores.report(id, data),
    extraButtons: where => {
      let h = '';
      if (opp && PG.social && PG.social.canBuzz()) h += `<button class="btn sec" data-a="pgbuzz">Buzz ${esc(opp.name)}</button>`;
      if (where === 'home' || where === 'menu') h += `<button class="btn ghost" data-a="pg">${where === 'home' ? 'Alle games' : 'Naar PomGames'}</button>`;
      return h;
    },
    buzz: () => { if (opp && PG.social) PG.social.buzz(opp.uid, opp.name, id); }
  };
  cur = { id, def, rec, style, htmlStyle, api: null, since: Date.now(), opts };
  curTag = () => def.short;
  store.set('last', id); Log.noteGame(id);
  Log.add('info', `open ${def.name}${def.imported ? ' (import v' + def.version + ')' : ''}${opts.host ? ' als maker ' + opts.host : ''}${opts.join ? ' meedoen ' + opts.join : ''}${opp ? ' tegen ' + opp.name : ''}`);
  hooks.onOpen.forEach(f => { try { f(id); } catch (e) {} });
  try { cur.api = def.mount(ctx) || null; }
  catch (e) {
    Log.add('err', `${def.name} start mislukt: ${e && e.message}`, def.short);
    closeGame();
    toast(`${def.name} kon niet starten. Kopieer de log en plak die bij Claude.`, 4000);
    return false;
  }
  return true;
}
function unmount() {
  const c = cur; if (!c) return;
  const r = c.rec; r.closing = true;
  try { if (c.api && c.api.unmount) c.api.unmount(); } catch (e) { Log.add('err', `${c.def.name} afsluiten: ${e && e.message}`, c.def.short); }
  cur = null; curTag = () => 'pg';
  r.alive = false;
  for (const [t, ty, f, o] of r.listeners) { try { t.removeEventListener(ty, f, o); } catch (e) {} }
  r.timeouts.forEach(id => clearTimeout(id)); r.intervals.forEach(id => clearInterval(id)); r.rafs.forEach(id => cancelAnimationFrame(id));
  r.observers.forEach(o => { try { o.disconnect(); } catch (e) {} });
  document.getElementById('pg-stage').replaceChildren();
  if (c.style) c.style.media = 'not all';
  if (c.htmlStyle == null) document.documentElement.removeAttribute('style'); else document.documentElement.setAttribute('style', c.htmlStyle);
  document.body.classList.remove('pg-play');
  Log.add('info', `sluit ${c.def.name} na ${Math.round((Date.now() - c.since) / 1000)}s`);
}
function closeGame() {
  unmount();
  hooks.onClose.forEach(f => { try { f(); } catch (e) {} });
  window.scrollTo(0, 0);
}

function gameLogs() {
  let out = '';
  for (const id of Log.games()) {
    const g = def(id); if (!g || !g.imported) continue;
    try {
      const d = JSON.parse(localStorage.getItem(id + '.lastlog') || 'null');
      if (d && Array.isArray(d.entries)) out += `\n\n--- log van ${g.name} (import v${g.version}) run=${d.run || '?'} fouten=${d.errors || 0} ---\n` + d.entries.slice(-150).join('\n');
    } catch (e) {}
  }
  return out;
}
async function copyLog() {
  await Log.flush(true);
  const txt = Log.text() + gameLogs();
  try { await navigator.clipboard.writeText(txt); toast('Log gekopieerd. Plak hem in je chat met Claude.'); }
  catch (e) {
    try { if (navigator.share) { await navigator.share({ title: 'PomGames log', text: txt }); return; } } catch (e2) { if (e2 && e2.name === 'AbortError') return; }
    toast('Kopiëren lukt niet op dit toestel.');
  }
}

/* ---------------- IFRAME-GAMES (geïmporteerd) ----------------
   De HTML van de game wordt in een iframe geschreven. Het adres binnen die iframe wordt
   .../spel/<id>/?join=CODE, zodat games die ?join= en ?host= lezen gewoon werken en hun
   deellinks via 404.html weer in PomGames uitkomen. Games die window.PG_HOST kennen,
   krijgen naam, tegenstander, buzz, terug en score van de hub. */
const hubDir = () => location.pathname.replace(/[^/]*$/, '');
async function loadCode(g) {
  if (g.previewHtml) return g.previewHtml;
  const key = location.origin + hubDir() + '__pgcode/' + g.id + '@' + g.version;
  let cache = null;
  try { if (window.caches) { cache = await caches.open('pgcode-v1'); const r = await cache.match(key); if (r) { Log.add('info', `${g.id} v${g.version} uit de cache`); return await r.text(); } } } catch (e) { cache = null; }
  if (!PG.backend || !PG.backend.getGameCode) throw new Error('geen verbinding met de server');
  const c = await PG.backend.getGameCode(g.id);
  if (!c || typeof c.html !== 'string') throw new Error('game niet gevonden');
  if (c.version !== g.version) Log.add('info', `${g.id}: catalogus v${g.version}, code v${c.version}`);
  if (cache) {
    try {
      for (const k of await cache.keys()) if (k.url.includes('/__pgcode/' + g.id + '@')) await cache.delete(k);
      await cache.put(location.origin + hubDir() + '__pgcode/' + g.id + '@' + c.version, new Response(c.html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    } catch (e) {}
  }
  Log.add('info', `${g.id} v${c.version} geladen (${Math.round(c.html.length / 1024)} kB)`);
  return c.html;
}
const BRIDGE = `<script>(function(){try{var f=window.frameElement,h=f&&f.__pg;if(!h)return;window.PG_HOST=h.api;
try{history.replaceState(null,'',h.url)}catch(e){h.api.log('info','adres niet aangepast: '+e.message)}
if(h.nick){try{localStorage.setItem(h.nickKey,JSON.stringify(h.nick))}catch(e){}}
addEventListener('error',function(e){h.api.log('err',(e.message||'fout')+' regel '+(e.lineno||0))});
addEventListener('unhandledrejection',function(e){var r=e.reason;h.api.log('err','promise: '+((r&&(r.message||r.type))||r))});
}catch(e){}})();<\/script>`;
function withBridge(html) {
  const m = /<head[^>]*>/i.exec(html) || /<html[^>]*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + BRIDGE + html.slice(m.index + m[0].length);
  return BRIDGE + html;
}
function frameMount(g, ctx) {
  const stage = document.getElementById('pg-stage');
  const opp = ctx.opponent, canBuzz = !!(opp && PG.social && PG.social.canBuzz());
  stage.innerHTML = `<div class="pg-frame${g.aware ? ' aware' : ''}">
    <div class="pg-fbar"><button class="pg-fback" data-f="exit" aria-label="Terug naar PomGames"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>PomGames</button>
      <b>${esc(g.name)}</b>${canBuzz ? `<button class="pg-fbuzz" data-f="buzz">Buzz ${esc(opp.name)}</button>` : ''}</div>
    <div class="pg-fbox"><div class="pg-fmsg">Laden…</div></div></div>`;
  const box = stage.querySelector('.pg-fbox');
  stage.querySelector('.pg-fbar').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; if (b.dataset.f === 'exit') ctx.exit(); else ctx.buzz(); });
  let dead = false, frame = null;
  const q = new URLSearchParams();
  for (const k of ['join', 'host', 'net', 'test']) if (ctx.params.get(k)) q.set(k, ctx.params.get(k));
  const api = Object.freeze({
    version: 1, game: g.id, playerName: ctx.playerName, opponent: opp ? Object.freeze({ name: opp.name }) : null,
    join: ctx.params.get('join') || '', host: ctx.params.get('host') || '', canBuzz,
    exit: () => setTimeout(() => ctx.exit(), 0),
    buzz: () => ctx.buzz(),
    score: data => ctx.score(data),
    log: (k, m) => ctx.log.add(String(k || 'info').slice(0, 5), String(m).slice(0, 200)),
    shareUrl: code => ctx.shareUrl(code)
  });
  async function go() {
    box.innerHTML = '<div class="pg-fmsg">Laden…</div>';
    let html;
    try { html = await loadCode(g); }
    catch (e) {
      if (dead) return;
      Log.add('err', `${g.id} laden: ${e.message}`, g.short);
      box.innerHTML = `<div class="pg-fmsg"><b>${esc(g.name)} kon niet laden</b><br>${esc(e.message)}. Heb je internet?<br><button class="pg-btn pri inline" data-f2="retry">Opnieuw</button></div>`;
      box.querySelector('[data-f2]').onclick = go;
      return;
    }
    if (dead) return;
    frame = document.createElement('iframe');
    frame.title = g.name;
    frame.setAttribute('allow', 'autoplay; clipboard-write; fullscreen');
    frame.__pg = { api, url: hubDir() + 'spel/' + g.id + '/' + (q.toString() ? '?' + q : ''), nick: ctx.playerName ? ctx.playerName.slice(0, 14) : '', nickKey: g.id + '.nick' };
    box.replaceChildren(frame);
    const doc = frame.contentDocument;
    doc.open(); doc.write(withBridge(html)); doc.close();
    try { frame.contentWindow.focus(); } catch (e) {}
  }
  go();
  return { unmount() { dead = true; if (frame) { try { frame.contentWindow.dispatchEvent(new Event('pagehide')); } catch (e) {} frame.remove(); frame = null; } } };
}

const PG = window.PG = {
  version: PG_VERSION, qs, IN_CLAUDE, STANDALONE, store, esc, Log, toast, avatar, hueOf, thumb, Scores,
  games, byId, register, def, importedDef, allGames, visibleGames, isHidden, setCatalog, getCatalog: () => catalog, ACCENTS, thumbOf,
  open, closeGame, isOpen, current, hooks, copyLog, me: null, social: null, backend: null
};
})();
