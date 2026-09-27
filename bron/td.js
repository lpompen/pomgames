const VERSION = '1.0.0';
const APP = 'td1';
const PEER_PREFIX = 'tegelduel-v1-';
const $ = s => document.querySelector(s);
const params = ctx.params;
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
const FORCE_BC = params.get('net') === 'bc';
const ls = {
  get(k, d) { try { const v = localStorage.getItem('tegelduel.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tegelduel.' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('tegelduel.' + k); } catch (e) {} }
};
if (ctx.playerName) ls.set('nick', String(ctx.playerName).slice(0, 14));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('nl-NL');
const sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n);
const Log = ctx.log;
Log.add('info', `start v${VERSION} omgeving=${FORCE_BC ? 'test' : IN_CLAUDE ? 'claude' : 'web'}`);

/* ---------------- ENGINE ----------------
   Twee spelers, vijf fabrieken met elk vier tegels, 5 kleuren x 20 tegels.
   Het hele spel wordt steeds opnieuw afgespeeld uit (seed, wie begint, zetten van speler 0, zetten van speler 1).
   Een zet is 3 cijfers: bron (0-4 fabriek, 5 midden), kleur (0-4), rij (0-4, 5 = vloer). */
class RNG {
  constructor(s) { this.a = s >>> 0; }
  next() { let t = (this.a = (this.a + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
}
const NF = 5, FP = 9, PEN = [1, 1, 2, 2, 2, 3, 3];
const CNAME = ['koraal', 'zon', 'mint', 'lucht', 'violet'];
const MV_RE = /^([0-5][0-4][0-5])*$/;
const wallCol = (r, c) => (c + r) % 5;
const colorAt = (r, col) => (col - r + 5) % 5;
function shuffle(R, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } }
const mkPlayer = () => ({ lines: [0, 1, 2, 3, 4].map(() => ({ c: -1, n: 0 })), wall: new Uint8Array(25), floor: [], score: 0, bonus: null });
function newGame(seed, starter) {
  const R = new RNG(seed), bag = [];
  for (let c = 0; c < 5; c++) for (let i = 0; i < 20; i++) bag.push(c);
  shuffle(R, bag);
  const st = { R, bag, lid: [], fac: [], center: [], fpc: true, pl: [mkPlayer(), mkPlayer()], turn: starter, next: starter, round: 0, done: false, winner: -1, rounds: [] };
  startRound(st);
  return st;
}
function draw(st) {
  if (!st.bag.length) { if (!st.lid.length) return -1; st.bag = st.lid; st.lid = []; shuffle(st.R, st.bag); }
  return st.bag.pop();
}
function startRound(st) {
  st.round++; st.fac = [];
  for (let f = 0; f < NF; f++) { const t = []; for (let i = 0; i < 4; i++) { const c = draw(st); if (c < 0) break; t.push(c); } t.sort((a, b) => a - b); st.fac.push(t); }
  st.center = []; st.fpc = true; st.turn = st.next;
  if (marketEmpty(st)) finish(st);
}
const marketEmpty = st => !st.center.length && st.fac.every(f => !f.length);
const tilesAt = (st, s) => s < NF ? st.fac[s] : st.center;
function countAt(st, s, c) { let n = 0; for (const x of tilesAt(st, s)) if (x === c) n++; return n; }
function canLine(p, L, c) {
  const ln = p.lines[L];
  if (ln.n >= L + 1 || (ln.n && ln.c !== c)) return false;
  return !p.wall[L * 5 + wallCol(L, c)];
}
function lineWhy(p, L, c) {
  const ln = p.lines[L];
  if (ln.n >= L + 1) return 'Deze rij is al vol';
  if (ln.n && ln.c !== c) return `Hier liggen al ${CNAME[ln.c]}-tegels`;
  return `${CNAME[c][0].toUpperCase() + CNAME[c].slice(1)} ligt al op je muur in deze rij`;
}
function placeScore(w, r, col) {
  let h = 1, v = 1;
  for (let c = col - 1; c >= 0 && w[r * 5 + c]; c--) h++;
  for (let c = col + 1; c < 5 && w[r * 5 + c]; c++) h++;
  for (let q = r - 1; q >= 0 && w[q * 5 + col]; q--) v++;
  for (let q = r + 1; q < 5 && w[q * 5 + col]; q++) v++;
  return ((h > 1 ? h : 0) + (v > 1 ? v : 0)) || 1;
}
function toFloor(st, p, c) { if (p.floor.length < 7) p.floor.push(c); else if (c !== FP) st.lid.push(c); }
function applyMove(st, s, c, L, lite) {
  if (st.done || !(s >= 0 && s <= NF && c >= 0 && c <= 4 && L >= 0 && L <= 5)) return null;
  const pi = st.turn, p = st.pl[pi], n = countAt(st, s, c);
  if (!n || (L < 5 && !canLine(p, L, c))) return null;
  const info = { p: pi, s, c, L, n, put: 0, lineFrom: L < 5 ? p.lines[L].n : 0, floorFrom: p.floor.length, floorTo: 0, fp: false, round: null };
  if (s < NF) { for (const x of st.fac[s]) if (x !== c) st.center.push(x); st.fac[s] = []; st.center.sort((a, b) => a - b); }
  else { st.center = st.center.filter(x => x !== c); if (st.fpc) { st.fpc = false; info.fp = true; st.next = pi; toFloor(st, p, FP); } }
  let left = n;
  if (L < 5) { const ln = p.lines[L], put = Math.min(L + 1 - ln.n, n); ln.c = c; ln.n += put; info.put = put; left -= put; }
  for (; left > 0; left--) toFloor(st, p, c);
  info.floorTo = p.floor.length;
  if (marketEmpty(st)) { if (!lite) info.round = endRound(st); }
  else st.turn = 1 - pi;
  return info;
}
function endRound(st) {
  const sum = { round: st.round, gains: [0, 0], pen: [0, 0], placed: [[], []], next: st.next };
  st.pl.forEach((p, i) => {
    for (let L = 0; L < 5; L++) {
      const ln = p.lines[L];
      if (ln.n !== L + 1) continue;
      const col = wallCol(L, ln.c), idx = L * 5 + col;
      p.wall[idx] = 1;
      const pts = placeScore(p.wall, L, col);
      p.score += pts; sum.gains[i] += pts; sum.placed[i].push(idx);
      for (let k = 0; k < L; k++) st.lid.push(ln.c);
      ln.c = -1; ln.n = 0;
    }
    let pen = 0;
    p.floor.forEach((c, k) => { pen += PEN[k]; if (c !== FP) st.lid.push(c); });
    p.floor = [];
    sum.pen[i] = Math.min(pen, p.score); p.score = Math.max(0, p.score - pen);
  });
  st.rounds.push(sum);
  const rowDone = st.pl.some(p => { for (let r = 0; r < 5; r++) { let f = 1; for (let c = 0; c < 5; c++) f &= p.wall[r * 5 + c]; if (f) return true; } return false; });
  if (rowDone) finish(st); else startRound(st);
  sum.ended = st.done;
  return sum;
}
function bonusOf(p) {
  let rows = 0, cols = 0, colors = 0;
  for (let r = 0; r < 5; r++) { let f = 1; for (let c = 0; c < 5; c++) f &= p.wall[r * 5 + c]; rows += f; }
  for (let c = 0; c < 5; c++) { let f = 1; for (let r = 0; r < 5; r++) f &= p.wall[r * 5 + c]; cols += f; }
  for (let k = 0; k < 5; k++) { let f = 1; for (let r = 0; r < 5; r++) f &= p.wall[r * 5 + wallCol(r, k)]; colors += f; }
  return { rows, cols, colors, pts: rows * 2 + cols * 7 + colors * 10 };
}
function finish(st) {
  st.done = true;
  st.pl.forEach(p => { p.bonus = bonusOf(p); p.score += p.bonus.pts; });
  const [a, b] = st.pl;
  st.winner = a.score !== b.score ? (a.score > b.score ? 0 : 1) : a.bonus.rows !== b.bonus.rows ? (a.bonus.rows > b.bonus.rows ? 0 : 1) : 2;
}
function legalMoves(st) {
  const p = st.pl[st.turn], out = [];
  for (let s = 0; s <= NF; s++) for (const c of new Set(tilesAt(st, s))) {
    for (let L = 0; L < 5; L++) if (canLine(p, L, c)) out.push([s, c, L]);
    out.push([s, c, 5]);
  }
  return out;
}
const cloneLite = st => ({ fac: st.fac.map(f => f.slice()), center: st.center.slice(), fpc: st.fpc, lid: [], turn: st.turn, next: st.next, round: st.round, done: false, rounds: [],
  pl: st.pl.map(p => ({ lines: p.lines.map(l => ({ c: l.c, n: l.n })), wall: Uint8Array.from(p.wall), floor: p.floor.slice(), score: p.score })) });
function replay(seed, starter, mv) {
  const st = newGame(seed, starter), idx = [0, 0];
  let k = 0, last = null, bad = false;
  for (let guard = 0; guard < 400 && !st.done; guard++) {
    const p = st.turn;
    if (idx[p] * 3 + 3 > mv[p].length) break;
    const m = mv[p].substr(idx[p] * 3, 3), info = applyMove(st, +m[0], +m[1], +m[2]);
    if (!info) { bad = true; break; }
    last = info; idx[p]++; k++;
  }
  return { st, idx, k, last, bad };
}

/* ---------------- COMPUTER ---------------- */
function nb(w, r, col) { return (col > 0 && w[r * 5 + col - 1] ? 1 : 0) + (col < 4 && w[r * 5 + col + 1] ? 1 : 0) + (r > 0 && w[(r - 1) * 5 + col] ? 1 : 0) + (r < 4 && w[(r + 1) * 5 + col] ? 1 : 0); }
function marketCount(st, c) { let n = 0; for (let s = 0; s <= NF; s++) n += countAt(st, s, c); return n; }
function evalMove(st, pi, m) {
  const [s, c, L] = m, p = st.pl[pi], n = countAt(st, s, c), fp = s === NF && st.fpc;
  let v = 0, over = n;
  if (L < 5) {
    const ln = p.lines[L], cap = L + 1, put = Math.min(cap - ln.n, n), filled = ln.n + put, col = wallCol(L, c);
    over = n - put;
    if (filled === cap) {
      const w = Uint8Array.from(p.wall); w[L * 5 + col] = 1;
      v += placeScore(w, L, col) + 0.4;
      let rn = 0, cn = 0, kn = 0;
      for (let i = 0; i < 5; i++) { rn += w[L * 5 + i]; cn += w[i * 5 + col]; kn += w[i * 5 + wallCol(i, c)]; }
      v += rn === 5 ? 2 : rn * 0.12;
      v += cn === 5 ? 7 : cn * 0.3;
      v += kn === 5 ? 10 : kn * 0.25;
    } else {
      v += 0.8 * (filled / cap) * (1 + 0.5 * nb(p.wall, L, col));
      if (marketCount(st, c) - n < cap - filled) v -= 0.35;
      if (!ln.n) v -= 0.08 * L;
    }
  }
  const f0 = p.floor.length, add = over + (fp ? 1 : 0);
  for (let i = f0; i < Math.min(7, f0 + add); i++) v -= PEN[i];
  if (fp) v += 0.8;
  return v;
}
function botMove(st, level) {
  const me = st.turn, moves = legalMoves(st);
  let best = moves[0], bv = -Infinity;
  for (const m of moves) {
    let v = evalMove(st, me, m);
    if (level === 'slim') {
      const s2 = cloneLite(st); applyMove(s2, m[0], m[1], m[2], true);
      if (!marketEmpty(s2)) {
        s2.turn = 1 - me; let ob = -Infinity;
        for (const m2 of legalMoves(s2)) { const o = evalMove(s2, 1 - me, m2); if (o > ob) ob = o; }
        v -= 0.5 * Math.max(0, ob);
      }
      v += Math.random() * 0.05;
    } else v += (Math.random() - 0.5) * 2.4;
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}

/* ---------------- DOM ---------------- */
const rootEl = document.documentElement, appEl = $('#app');
const scoreEl = $('#score'), subEl = $('#sub'), modeEl = $('#mode'), toastEl = $('#toast'), fxEl = $('#fx');
const ovEl = $('#ov'), panelEl = $('#panel'), oppEl = $('#opp'), oppBoardEl = $('#oppBoard');
const facsEl = $('#facs'), poolEl = $('#pool'), myBoardEl = $('#myBoard'), floorEl = $('#floor'), flsEl = $('#floor .fls');
let G = null, ui = 'home', sel = null, curGid = 0, localRound = 0, fresh = null, lastResult = null;
const PREVIEW = replay(20240611, 0, ['', '']);
const rndSeed = () => (Math.random() * 0x7fffffff) | 0;

function layout() {
  const W = Math.min(appEl.clientWidth - 24, 536), H = innerHeight;
  let cs = Math.floor((W - 50) / 10);
  cs = Math.max(18, Math.min(cs, Math.floor((H - 250) / 8.6), 46));
  const ft = Math.max(16, Math.min(Math.round(cs * 0.9), Math.floor((W - 24 - 75) / 10), 40));
  rootEl.style.setProperty('--cs', cs + 'px');
  rootEl.style.setProperty('--ft', ft + 'px');
}
addEventListener('resize', layout);
if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(appEl);

const view = () => G ? G.view() : PREVIEW;
const bottomP = () => G ? G.bottom() : 0;
const tileHTML = (c, extra = '') => c === FP ? `<i class="t fp${extra}">1</i>` : `<i class="t c${c}${extra}"></i>`;
function linesHTML(p, o) {
  let h = '<div class="lines">';
  for (let L = 0; L < 5; L++) {
    const ln = p.lines[L];
    let cls = 'ln';
    if (o.sel) cls += canLine(p, L, o.sel.c) ? ' ok' : ' no';
    let cells = '';
    for (let i = 0; i <= L; i++) {
      const pos = L - i;
      cells += pos < ln.n ? tileHTML(ln.c, o.fresh && o.fresh.L === L && pos >= o.fresh.from ? ' pop' : '') : '<i class="sl"></i>';
    }
    h += o.act ? `<button class="${cls}" data-line="${L}" aria-label="Rij ${L + 1}${ln.n ? ', ' + ln.n + ' ' + CNAME[ln.c] : ''}">${cells}</button>` : `<div class="${cls}">${cells}</div>`;
  }
  return h + '</div>';
}
function wallHTML(p, freshSet) {
  let h = '<div class="wall">';
  for (let i = 0; i < 25; i++) {
    const k = colorAt((i / 5) | 0, i % 5);
    h += p.wall[i] ? tileHTML(k, freshSet && freshSet.includes(i) ? ' pop' : '') : `<i class="t w c${k}"></i>`;
  }
  return h + '</div>';
}
function floorHTML(p, f) {
  let h = '';
  for (let k = 0; k < 7; k++) {
    const c = p.floor[k], pop = f && k >= f.floorFrom && k < f.floorTo ? ' pop' : '';
    h += c === undefined ? `<i class="fl">−${PEN[k]}</i>` : tileHTML(c, pop);
  }
  return h;
}
function renderMarket() {
  const st = view().st, act = !!(G && G.canInteract());
  const tile = (s, c) => {
    const on = sel && sel.s === s && sel.c === c, cls = `t c${c}${on ? ' on' : sel ? ' dim' : ''}`;
    return act ? `<button class="${cls}" data-t="${s}:${c}" aria-label="${CNAME[c]} ${s < NF ? 'uit fabriek ' + (s + 1) : 'uit het midden'}"></button>` : `<i class="${cls}"></i>`;
  };
  facsEl.innerHTML = st.fac.map((f, s) => `<div class="fac${f.length ? '' : ' empty'}">${f.map(c => tile(s, c)).join('')}</div>`).join('');
  let h = st.fpc ? '<i class="t fp" title="Beginner-tegel">1</i>' : '';
  for (let c = 0; c < 5; c++) { const n = countAt(st, NF, c); if (n) h += `<span class="grp">${Array.from({ length: n }, () => tile(NF, c)).join('')}</span>`; }
  poolEl.innerHTML = h || '<span class="pempty">Midden</span>';
}
function renderBoards() {
  const st = view().st, P = bottomP(), O = 1 - P, act = !!(G && G.canInteract());
  const f = fresh; fresh = null;
  const s2 = act ? sel : null;
  myBoardEl.innerHTML = linesHTML(st.pl[P], { sel: s2, act, fresh: f && f.p === P ? f : null }) + wallHTML(st.pl[P], f && f.wall ? f.wall[P] : null);
  flsEl.innerHTML = floorHTML(st.pl[P], f && f.p === P ? f : null);
  floorEl.classList.toggle('ok', !!s2);
  oppBoardEl.innerHTML = linesHTML(st.pl[O], { fresh: f && f.p === O ? f : null }) + wallHTML(st.pl[O], f && f.wall ? f.wall[O] : null);
  renderMarket();
}
function renderHud() {
  if (!G) { scoreEl.textContent = '0'; subEl.textContent = ''; modeEl.textContent = 'Tegelduel'; rootEl.style.setProperty('--glow', 'transparent'); oppEl.classList.remove('on'); return; }
  const st = G.view().st, P = G.bottom(), O = 1 - P, me = st.pl[P], o = st.pl[O];
  scoreEl.textContent = fmt(me.score);
  modeEl.textContent = `${G.label}\n${st.done ? 'Afgelopen' : 'Ronde ' + st.round}`;
  let sub;
  if (st.done) sub = st.winner === 2 ? 'Gelijkspel' : `${G.name(st.winner)} wint`;
  else if (G.kind === 'online' && !Net.connected) sub = 'Verbinding weg…';
  else if (st.turn === P) sub = sel ? `Kies een rij voor ${countAt(st, sel.s, sel.c)} × ${CNAME[sel.c]}` : G.kind === 'local' ? `${G.name(P)}: kies tegels` : 'Jouw beurt: kies tegels';
  else sub = `${G.name(st.turn)} is aan zet`;
  if (subEl.textContent !== sub) subEl.textContent = sub;
  rootEl.style.setProperty('--glow', !st.done && st.turn === P ? 'var(--k2)' : 'transparent');
  oppEl.classList.add('on');
  $('#oppName').textContent = G.name(O);
  $('#oppScore').textContent = fmt(o.score);
  const pen = o.floor.reduce((a, _, k) => a + PEN[k], 0);
  $('#oppStat').textContent = st.done ? (st.winner === O ? 'Wint' : st.winner === 2 ? 'Gelijkspel' : 'Verliest')
    : G.kind === 'online' && !Net.connected ? 'Verbinding weg'
    : st.turn === O ? (G.kind === 'bot' ? 'Denkt na…' : 'Is aan zet') : pen ? `Vloer −${pen}` : 'Wacht';
  oppEl.classList.toggle('turn', !st.done && st.turn === O);
}
function renderAll() { renderBoards(); renderHud(); }

/* ---------------- EFFECTEN & GELUID ---------------- */
function fxText(html) { const el = document.createElement('div'); el.className = 'fxt'; el.innerHTML = html; fxEl.appendChild(el); setTimeout(() => el.remove(), 1300); }
let AC = null, soundOn = ls.get('sound', true);
function audio() {
  if (!soundOn) return null;
  try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; }
  return AC;
}
function tone(f, dur, type, vol, delay = 0) {
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.03);
}
const sfx = {
  tick() { tone(520, 0.05, 'triangle', 0.06); },
  place() { tone(330, 0.07, 'triangle', 0.1); tone(440, 0.06, 'triangle', 0.06, 0.05); },
  bad() { tone(150, 0.12, 'square', 0.03); },
  round() { [392, 523, 659].forEach((f, i) => tone(f, 0.16, 'sine', 0.08, i * 0.08)); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, i * 0.1)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.26, 'triangle', 0.08, i * 0.12)); }
};
let toastT = 0;
function clearToast() { clearTimeout(toastT); toastEl.classList.remove('on'); }
function toast(msg, ms = 2200) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms); }

/* ---------------- SPELVORMEN ---------------- */
function makeGame(o) {
  const kind = o.kind, seed = o.seed | 0, starter = o.starter ? 1 : 0, gid = o.gid || 0, level = o.level === 'slim' ? 'slim' : 'rustig';
  const mv = o.mv ? o.mv.slice(0, 2) : ['', ''];
  const me = kind === 'online' ? (Net.role === 'h' ? 0 : 1) : kind === 'bot' ? 0 : -1;
  let v = replay(seed, starter, mv), shown = false, botT = 0, lostAt = 0;
  const label = kind === 'bot' ? (level === 'slim' ? 'Computer: slim' : 'Computer: rustig') : kind === 'local' ? 'Samen spelen' : 'Online';
  const name = p => kind === 'local' ? `Speler ${p + 1}` : p === me ? 'Jij' : kind === 'bot' ? 'Computer' : oppNick();
  const g = {
    kind, gid, label, name, level,
    view: () => v,
    bottom: () => kind === 'local' ? (v.st.done ? 0 : v.st.turn) : me,
    canInteract: () => !v.st.done && (kind === 'local' || v.st.turn === me) && (kind !== 'online' || Net.connected),
    waitMsg: () => v.st.done ? 'Het spel is voorbij' : kind === 'online' && !Net.connected ? 'Verbinding is weg' : `${name(v.st.turn)} is aan zet`,
    play(m) {
      if (!g.canInteract()) return false;
      if (!legalMoves(v.st).some(x => x[0] === m[0] && x[1] === m[1] && x[2] === m[2])) return false;
      mv[v.st.turn] += m.join('');
      if (kind === 'online') Net.set({ dg: gid, mv: mv[me] });
      update(); return true;
    },
    onOpp(x) {
      if (kind !== 'online' || x.dg !== gid || typeof x.mv !== 'string' || !MV_RE.test(x.mv)) return;
      const other = 1 - me;
      if (x.mv.length > mv[other].length && x.mv.startsWith(mv[other])) { mv[other] = x.mv.slice(0, 600); update(); }
    },
    tick() {
      if (kind !== 'online' || shown) return;
      if (!Net.connected) { if (!lostAt) lostAt = Date.now(); else if (Date.now() - lostAt > 20000) { shown = true; showResult({ kind, gone: true }); } }
      else lostAt = 0;
    },
    lost() { toast('Verbinding weg. Even wachten…', 3000); },
    stop() { clearTimeout(botT); botT = 0; },
    save() { if (kind === 'bot' && !v.st.done) ls.set('bot', { seed, starter, mv, level }); },
    start() { renderAll(); schedule(); },
    dbg: () => ({ v, mv, seed, starter })
  };
  function update() {
    const prev = v;
    v = replay(seed, starter, mv);
    if (v.bad) Log.add('err', `ongeldige zet bij zet ${v.k} (lopen de spelers nog gelijk?)`);
    sel = null;
    if (v.k > prev.k && v.last) moved(v.last);
    g.save();
    if (v.st.done && !shown) {
      shown = true;
      if (kind === 'bot') ls.del('bot');
      const r = { kind, level, me, winner: v.st.winner, names: [name(0), name(1)], score: v.st.pl.map(p => p.score), bonus: v.st.pl.map(p => p.bonus), rounds: v.st.round };
      Log.add('game', `klaar: winnaar=${r.winner === 2 ? 'gelijk' : r.names[r.winner]} punten=${r.score.join('/')} rondes=${r.rounds} zetten=${v.k}`);
      setTimeout(() => { if (G === g) showResult(r); }, 1500);
    }
    renderAll();
    schedule();
  }
  function moved(last) {
    fresh = { p: last.p, L: last.L, from: last.lineFrom, floorFrom: last.floorFrom, floorTo: last.floorTo, wall: null };
    if (!last.round) { sfx.place(); return; }
    const r = last.round;
    fresh.L = -1; fresh.floorFrom = fresh.floorTo = 0; fresh.wall = r.placed;
    sfx.round();
    const net = [r.gains[0] - r.pen[0], r.gains[1] - r.pen[1]];
    const P = g.bottom();
    fxText(`${sgn(net[P])}${r.pen[P] ? `<small>vloer −${r.pen[P]}</small>` : ''}`);
    if (!r.ended) toast(`Ronde ${r.round} klaar. ${name(0)} ${sgn(net[0])}, ${name(1)} ${sgn(net[1])}. ${name(r.next)} begint.`, 3600);
    Log.add('game', `ronde ${r.round}: muur ${r.gains.join('/')} vloer -${r.pen.join('/')} stand ${v.st.pl.map(p => p.score).join('/')}`);
  }
  function schedule() {
    clearTimeout(botT); botT = 0;
    if (kind !== 'bot' || v.st.done || v.st.turn !== 1) return;
    const afterRound = v.last && v.last.round;
    botT = setTimeout(() => {
      botT = 0;
      if (G !== g || v.st.done || v.st.turn !== 1) return;
      const t0 = performance.now(), m = botMove(v.st, level);
      const dt = performance.now() - t0; if (dt > 150) Log.add('perf', `computer dacht ${Math.round(dt)}ms`);
      if (!m) return;
      mv[1] += m.join(''); update();
    }, (afterRound ? 1900 : 650) + Math.random() * 450);
  }
  return g;
}

/* ---------------- KIEZEN EN LEGGEN ---------------- */
function pick(s, c) {
  if (!G) return;
  if (!G.canInteract()) { toast(G.waitMsg()); return; }
  sel = sel && sel.s === s && sel.c === c ? null : { s, c };
  sfx.tick(); renderAll();
}
function place(L) {
  if (!G) return;
  if (!G.canInteract()) { toast(G.waitMsg()); return; }
  if (!sel) { toast('Kies eerst tegels in de markt'); return; }
  const st = G.view().st, p = st.pl[st.turn];
  if (L < 5 && !canLine(p, L, sel.c)) { sfx.bad(); toast(lineWhy(p, L, sel.c)); return; }
  const m = [sel.s, sel.c, L];
  sel = null;
  if (!G.play(m)) { sfx.bad(); renderAll(); }
}

/* ---------------- NETWERK: Claude-kamer (artifact), PeerJS/WebRTC (GitHub), BroadcastChannel (test) ---------------- */
const Net = {
  role: null, code: '', t: null, connected: false, opp: null, oppSeen: 0, rtt: 0, rttN: 0, measured: 0, lostAt: 0,
  mine: {}, timer: 0, hb: 0, sess: 0,
  reset() {
    clearInterval(this.hb); this.hb = 0; clearTimeout(this.timer); this.timer = 0;
    if (this.t) { try { this.t.send(Object.assign({}, this.mine, { bye: 1 })); } catch (e) {} try { this.t.close(Object.keys(this.mine)); } catch (e) {} }
    this.t = null; this.connected = false; this.opp = null; this.role = null; this.mine = {}; this.sess++;
  },
  set(p) { Object.assign(this.mine, p); if (!this.timer) this.timer = setTimeout(() => { this.timer = 0; this.push(); }, 12); },
  push() { if (!this.t) return; this.mine.q = (this.mine.q || 0) + 1; try { this.t.send(this.mine); } catch (e) { Log.add('err', 'versturen: ' + e.message); } },
  receive(o) {
    if (!o || o.app !== APP || !this.role || o.role === this.role) return;
    if (o.bye) { this.lost('de ander is gestopt'); return; }
    this.oppSeen = Date.now(); this.opp = o;
    if (!this.connected) this.found();
    if (o.pong && o.pong === this.mine.png && this.measured !== o.pong) {
      this.measured = o.pong; this.rtt = Date.now() - o.pong;
      if (this.rttN++ % 6 === 0) Log.add('net', `reactietijd ${this.rtt}ms`);
      if (ui === 'lobby') updateLobby();
    }
    if (o.png && o.png !== this.mine.pong) this.set({ pong: o.png });
    onOpp(o);
  },
  found() { if (this.connected) return; this.connected = true; this.lostAt = 0; Log.add('net', 'verbonden met ' + oppNick()); onNetUp(); },
  lost(why) { if (!this.connected) return; this.connected = false; this.lostAt = Date.now(); Log.add('net', 'verbinding weg: ' + why); onNetDown(why); },
  beat() { this.set({ png: Date.now() }); if (this.connected && Date.now() - this.oppSeen > 10000) this.lost('geen signaal (10s)'); }
};
const oppNick = () => (Net.opp && typeof Net.opp.nick === 'string' && cleanNick(Net.opp.nick)) || (ctx.opponent && ctx.opponent.name) || 'Tegenstander';
const cleanNick = s => (String(s || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 14)) || 'Speler';
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const newCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');

async function roomTransport(role, code) {
  const room = await ctx.room();
  if (!room) throw Object.assign(new Error('Realtime kamer niet beschikbaar'), { type: 'room-null' });
  let oppPeer = null, lastP = null;
  const offPeers = room.onPeers(ch => {
    let best = null;
    for (const p of ch.peers) {
      const pr = p.presence;
      if (p.sameTab || !pr || pr.app !== APP || pr.code !== code || pr.role === role) continue;
      if (!best || p.updatedAt > best.updatedAt) best = p;
    }
    if (!best) { if (oppPeer) { oppPeer = null; lastP = null; Net.lost('ander heeft de pagina verlaten'); } return; }
    if (best.peer !== oppPeer) { oppPeer = best.peer; lastP = null; }
    if (best.presence !== lastP) { lastP = best.presence; Net.receive(best.presence); }
  }, err => { Log.add('err', 'kamer: ' + err.code); Net.lost('kamer ' + err.code); });
  const offConn = room.onConnection(c => Log.add('net', 'kamer ' + (c ? 'online' : 'offline')), () => {});
  return {
    send(o) { room.presence(o).catch(e => Log.add('err', 'presence: ' + (e && e.code) + ' ' + (e && e.message))); },
    close(keys) { offPeers(); offConn(); const clear = {}; for (const k of keys) clear[k] = null; room.presence(clear).catch(() => {}); }
  };
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(Object.assign(new Error('script laden mislukt'), { type: 'load' })); document.head.appendChild(s); });
}
async function peerTransport(role, code) {
  if (!window.Peer) await loadScript('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js');
  return new Promise((resolve, reject) => {
    let conn = null, done = false;
    const peer = role === 'h' ? new window.Peer(PEER_PREFIX + code, { debug: 1 }) : new window.Peer({ debug: 1 });
    const t = {
      send(o) { if (conn && conn.open) conn.send(o); },
      close() { try { if (conn) conn.close(); } catch (e) {} try { peer.destroy(); } catch (e) {} }
    };
    function wire(c) {
      if (conn && conn.open && c !== conn) { c.on('open', () => c.close()); return; }
      conn = c;
      c.on('open', () => {
        Log.add('net', 'datakanaal open');
        try { const pc = c.peerConnection; if (pc) pc.addEventListener('iceconnectionstatechange', () => Log.add('net', 'ice ' + pc.iceConnectionState)); } catch (e) {}
        t.send(Net.mine);
      });
      c.on('data', d => Net.receive(d));
      c.on('close', () => { if (conn === c) { conn = null; Net.lost('verbinding gesloten'); } });
      c.on('error', e => Log.add('err', 'kanaal: ' + (e && (e.type || e.message))));
    }
    peer.on('open', () => {
      Log.add('net', 'signaalserver ok');
      if (role === 'g') wire(peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' }));
      if (!done) { done = true; resolve(t); }
    });
    peer.on('connection', c => { if (role === 'h') wire(c); else c.close(); });
    peer.on('error', e => {
      Log.add('err', 'peer: ' + (e && e.type));
      if (!done) { done = true; t.close(); reject(e); } else netError(e && e.type);
    });
    peer.on('disconnected', () => { Log.add('net', 'signaalserver los, opnieuw…'); try { if (!peer.destroyed) peer.reconnect(); } catch (e) {} });
  });
}
function bcTransport(role, code) {
  const ch = new BroadcastChannel('td-test-' + code);
  ch.onmessage = e => Net.receive(e.data);
  return Promise.resolve({ send: o => ch.postMessage(JSON.parse(JSON.stringify(o))), close: () => setTimeout(() => ch.close(), 50) });
}
const makeTransport = (role, code) => FORCE_BC ? bcTransport(role, code) : IN_CLAUDE ? roomTransport(role, code) : peerTransport(role, code);

let joinTimer = 0;
async function goOnline(role, code, attempt = 0) {
  Net.reset();
  const sess = Net.sess;
  const nick = cleanNick(($('#nick') && $('#nick').value) || ctx.playerName || ls.get('nick', ''));
  ls.set('nick', nick);
  Net.role = role; Net.code = code;
  Net.mine = { app: APP, v: 1, bye: 0, role, code, nick, gid: 0, seed: 0, live: 0, dg: 0, mv: '', png: 0, pong: 0 };
  curGid = 0;
  Log.add('net', `${role === 'h' ? 'spel maken' : 'meedoen'} code=${code} via ${FORCE_BC ? 'test' : IN_CLAUDE ? 'claude-kamer' : 'webrtc'}`);
  showWaiting();
  let t;
  try { t = await makeTransport(role, code); }
  catch (e) {
    if (Net.sess !== sess) return;
    const type = e && e.type;
    if (role === 'h' && type === 'unavailable-id' && attempt < 3) return goOnline('h', newCode(), attempt + 1);
    Log.add('err', 'verbinden mislukt: ' + (type || (e && e.message)));
    return showNetError(type);
  }
  if (Net.sess !== sess) { try { t.close([]); } catch (e) {} return; }
  Net.t = t;
  Net.push();
  Net.hb = setInterval(() => Net.beat(), 2000);
  clearTimeout(joinTimer);
  if (role === 'g') joinTimer = setTimeout(() => { if (!Net.connected && ui === 'wait') setStatus(`Nog geen spel gevonden met code ${code}. Heeft de ander het spel al open?`); }, 9000);
}
function onNetUp() {
  if (ui === 'wait' || ui === 'neterr') { showLobby(); sfx.place(); }
  else if (ui === 'game' || ui === 'result') toast('Weer verbonden');
  renderAll();
}
function onNetDown() {
  if (ui === 'game') { if (G && G.lost) G.lost(); }
  else if (ui === 'lobby') showNetError('lost');
  renderAll();
}
function netError(type) { if (ui === 'wait') showNetError(type); }
function onOpp(o) {
  if (Net.role === 'g' && o.live === 1 && o.gid && o.gid !== curGid && Number.isFinite(o.seed)) startOnline(o.seed | 0, o.gid | 0);
  if (G && G.onOpp && G.gid === curGid) G.onOpp(o);
  if (ui === 'lobby') updateLobby();
  renderHud();
}
function hostStart() {
  const gid = (Net.mine.gid || 0) + 1, seed = rndSeed();
  Net.set({ gid, seed });
  startOnline(seed, gid);
}
function startOnline(seed, gid) {
  curGid = gid;
  Net.set(Net.role === 'h' ? { gid, dg: 0, mv: '', live: 1 } : { gid, dg: 0, mv: '' });
  stopGame(); closeOv(); clearToast(); ui = 'game';
  G = makeGame({ kind: 'online', seed, starter: (gid + 1) % 2, gid });
  Log.add('game', `start online ronde=${gid} rol=${Net.role === 'h' ? 'maker' : 'gast'}`);
  layout(); G.start();
  toast(G.bottom() === G.view().st.turn ? 'Jij begint' : `${oppNick()} begint`);
}
function leaveOnline() { clearTimeout(joinTimer); if (Net.role) Log.add('net', 'online sessie gestopt'); Net.reset(); }
function stopGame() { if (G && G.stop) G.stop(); G = null; sel = null; }

/* ---------------- SCHERMEN ---------------- */
function openOv(html, name) { panelEl.innerHTML = html; ovEl.classList.add('on'); ui = name; panelEl.scrollTop = 0; }
function closeOv() { ovEl.classList.remove('on'); }
function setStatus(txt, wait = true) { const s = $('#netStatus'); if (s) { s.textContent = txt; s.classList.toggle('wait', wait); } }
const TITLE = `<div class="title" role="img" aria-label="Tegelduel">${[...'TEGELDUEL'].map((ch, i) => `<span style="--tc:var(--c${i % 5})" aria-hidden="true">${ch}</span>`).join('')}</div>`;
function validSaved(s) { return s && Number.isFinite(s.seed) && (s.starter === 0 || s.starter === 1) && Array.isArray(s.mv) && s.mv.length === 2 && s.mv.every(x => typeof x === 'string' && MV_RE.test(x)); }
function showHome() {
  leaveOnline(); stopGame(); renderAll(); layout();
  const saved = ls.get('bot', null), rec = ls.get('rec', { w: 0, l: 0, d: 0 });
  openOv(`${TITLE}
    <p class="tag">Pak tegels, vul je rijen en bouw je muur.</p>
    ${validSaved(saved) ? '<button class="btn pri" data-a="cont">Verder tegen de computer</button>' : ''}
    <button class="btn ${validSaved(saved) ? 'sec' : 'pri'}" data-a="bot">Tegen de computer</button>
    <button class="btn sec" data-a="online">Online tegen elkaar</button>
    <button class="btn sec" data-a="local">Samen op deze telefoon</button>
    <button class="btn ghost" data-a="rules">Hoe werkt het?</button>
    ${ctx.extraButtons('home')}
    ${rec.w + rec.l + (rec.d || 0) ? `<p class="fine" style="text-align:center;margin-top:8px">Tegen de computer: ${rec.w} gewonnen, ${rec.l} verloren</p>` : ''}`, 'home');
}
function showRules(back = 'home') {
  openOv(`<h2>Hoe werkt het?</h2><div class="rules">
    <p><b>Pak tegels.</b> Tik in een fabriek op een kleur: je pakt alle tegels van die kleur. De rest schuift naar het midden. Je mag ook één kleur uit het midden pakken. Wie dat als eerste doet, krijgt de <span class="fpi">1</span>: je begint de volgende ronde, maar hij ligt op je vloer.</p>
    <p><b>Leg ze op een rij.</b> Tik daarna op een rij van je bord. Eén kleur per rij, en niet een kleur die al in die rij van je muur ligt. Wat niet past valt op de vloer, en de vloer kost punten.</p>
    <p><b>Bouw je muur.</b> Is de markt leeg, dan schuift uit elke volle rij één tegel naar je muur. Een losse tegel is 1 punt. Sluit hij aan, dan tel je alle aansluitende tegels in de rij en in de kolom.</p>
    <p><b>Einde.</b> Na de ronde waarin iemand een hele rij op de muur heeft. Bonus: +2 per volle rij, +7 per volle kolom, +10 per kleur die vijf keer ligt.</p>
  </div><button class="btn pri" data-a="${back}">Terug</button>`, 'rules');
}
function showBotPick() {
  openOv(`<h2>Tegen de computer</h2>
    <button class="mode" data-a="botgo" data-level="rustig"><b>Rustig</b><span>Speelt ontspannen en maakt soms een foutje.</span></button>
    <button class="mode" data-a="botgo" data-level="slim"><b>Slim</b><span>Let op zijn eigen muur en op wat jij nodig hebt.</span></button>
    <button class="btn ghost" data-a="home">Terug</button>`, 'botpick');
}
function showOnline(prefill = '') {
  leaveOnline();
  const note = FORCE_BC ? 'Testmodus: twee tabbladen in dezelfde browser.'
    : IN_CLAUDE ? 'Hier in Claude: je tegenstander opent PomGames en kiest Tegelduel.'
    : 'Werkt via internet. Deel de code, of nodig iemand uit via Spelers in PomGames.';
  openOv(`<h2>Online tegen elkaar</h2>
    <label class="lab" for="nick">Jouw naam</label>
    <input id="nick" class="field" maxlength="14" autocomplete="nickname" value="${esc(ls.get('nick', '') || ctx.playerName || '')}" placeholder="Bijv. Sam">
    <button class="btn pri" data-a="host">Maak een spel</button>
    <p class="or">of doe mee met een code</p>
    <input id="code" class="field code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(prefill)}" aria-label="Spelcode">
    <button class="btn sec" data-a="join">Doe mee</button>
    <p class="fine" style="margin-top:14px">${esc(note)}</p>
    <button class="btn ghost" data-a="home">Terug</button>`, 'online');
}
function showWaiting() {
  const host = Net.role === 'h', canShare = !IN_CLAUDE || FORCE_BC, extra = ctx.extraButtons('wait');
  const who = ctx.opponent ? esc(ctx.opponent.name) : 'tegenstander';
  openOv(host ? `<h2>Jouw spelcode</h2><div class="bigcode">${esc(Net.code)}</div>
      <p>${ctx.opponent ? `${who} krijgt een uitnodiging en komt er zo bij.` : 'Laat de ander op <b>Doe mee</b> tikken en deze code invullen.'}</p>
      ${canShare && !ctx.opponent ? '<button class="btn sec" data-a="share">Deel uitnodiging</button>' : ''}
      <p class="status wait" id="netStatus">Wachten op ${who}</p>${extra}
      <button class="btn ghost" data-a="online">Annuleren</button>`
    : `<h2>Meedoen</h2><div class="bigcode">${esc(Net.code)}</div>
      <p class="status wait" id="netStatus">Verbinden</p>${extra}
      <button class="btn ghost" data-a="online">Annuleren</button>`, 'wait');
}
function showNetError(type) {
  const msg = {
    'peer-unavailable': `Geen spel gevonden met code ${Net.code}. Misschien heeft de ander het spel al gesloten. Vraag om een nieuwe uitnodiging.`,
    'room-null': 'Online spelen werkt hier alleen als je bent ingelogd bij Claude.',
    'network': 'Geen verbinding met de server. Controleer je internet en probeer opnieuw.',
    'server-error': 'De verbindingsserver reageert niet. Probeer het over een minuut opnieuw.',
    'browser-incompatible': 'Deze browser ondersteunt geen directe verbinding. Gebruik Safari of Chrome.',
    'load': 'Het netwerkonderdeel kon niet laden. Controleer je internet.',
    'lost': `De verbinding met ${oppNick()} is weg.`
  }[type] || 'Verbinden lukte niet. Probeer het opnieuw.';
  const code = Net.code, role = Net.role;
  leaveOnline();
  openOv(`<h2>Geen verbinding</h2><p>${esc(msg)}</p>
    ${type !== 'room-null' ? `<button class="btn pri" data-a="${role === 'h' ? 'host' : 'rejoin'}" data-code="${esc(code)}">Opnieuw proberen</button>` : ''}
    ${ctx.extraButtons('wait')}
    <button class="btn ghost" data-a="home">Naar start</button>`, 'neterr');
}
function showLobby() {
  const host = Net.role === 'h';
  openOv(`<h2>Verbonden met <span id="oppN"></span></h2>
    <p class="fine" id="rtt">Reactietijd meten…</p>
    ${host ? '<button class="btn pri" data-a="start">Start Tegelduel</button>' : '<p class="status wait" id="netStatus"></p>'}
    <p class="fine" style="margin-top:12px">Jullie pakken om de beurt tegels uit dezelfde markt. De maker begint het eerste spel, daarna wisselt het.</p>
    <button class="btn ghost" data-a="home">Stoppen</button>`, 'lobby');
  updateLobby();
}
function updateLobby() {
  const n = $('#oppN'); if (n) n.textContent = oppNick();
  const r = $('#rtt'); if (r && Net.rtt) r.textContent = `Reactietijd ${Net.rtt} ms${Net.rtt < 120 ? ', lekker snel' : Net.rtt < 300 ? ', prima' : ', wat traag'}`;
  if (Net.role === 'g') setStatus(`${oppNick()} start het spel`);
}
function bonusTxt(b) {
  if (!b || !b.pts) return '';
  const parts = [b.rows ? `${b.rows} ${b.rows === 1 ? 'rij' : 'rijen'}` : '', b.cols ? `${b.cols} ${b.cols === 1 ? 'kolom' : 'kolommen'}` : '', b.colors ? `${b.colors} ${b.colors === 1 ? 'kleur' : 'kleuren'}` : ''].filter(Boolean);
  return `<small>bonus +${b.pts}: ${parts.join(', ')}</small>`;
}
function showResult(r) {
  lastResult = r; clearToast();
  ctx.score({ mode: r.kind, result: r });
  if (r.kind === 'online' && Net.role === 'h') Net.set({ live: 0 });
  let title, rows = '', btns = '';
  if (r.gone) title = 'Verbinding verbroken';
  else {
    const w = r.winner;
    title = w === 2 ? 'Gelijkspel' : r.kind === 'local' ? `${r.names[w]} wint!` : w === r.me ? 'Jij wint!' : `${r.names[w]} wint`;
    const order = r.kind === 'local' ? [0, 1] : [r.me, 1 - r.me];
    rows = order.map(p => `<div><span>${esc(r.names[p])}${bonusTxt(r.bonus[p])}</span><b>${fmt(r.score[p])}</b></div>`).join('');
    if (!r.counted) {
      r.counted = true;
      if (r.kind === 'bot') { const rec = ls.get('rec', { w: 0, l: 0, d: 0 }); if (w === 0) rec.w++; else if (w === 1) rec.l++; else rec.d = (rec.d || 0) + 1; ls.set('rec', rec); }
      (r.kind === 'local' || w === r.me || w === 2) ? sfx.win() : sfx.lose();
    }
  }
  const view = '<button class="btn ghost" data-a="view">Bekijk de muren</button>';
  if (r.kind === 'bot') btns = `<button class="btn pri" data-a="botgo" data-level="${r.level}">Nog een keer</button>${view}<button class="btn ghost" data-a="home">Naar start</button>`;
  else if (r.kind === 'local') btns = `<button class="btn pri" data-a="local">Nog een keer</button>${view}<button class="btn ghost" data-a="home">Naar start</button>`;
  else if (r.gone || !Net.connected) btns = `<button class="btn pri" data-a="online">Nieuw online spel</button>${ctx.extraButtons('wait')}<button class="btn ghost" data-a="home">Naar start</button>`;
  else if (Net.role === 'h') btns = `<button class="btn pri" data-a="start">Nog een keer</button>${view}<button class="btn ghost" data-a="home">Stoppen</button>`;
  else btns = `<p class="status wait" id="netStatus">Wachten tot ${esc(oppNick())} een nieuw spel start</p>${view}<button class="btn ghost" data-a="home">Stoppen</button>`;
  openOv(`<h2>${esc(title)}</h2><div class="rows">${rows}</div>${btns}`, 'result');
}
function showMenu() {
  const online = !!Net.role, over = G && G.view().st.done;
  openOv(`<h2>Menu</h2>
    ${over && lastResult ? '<button class="btn pri" data-a="result">Uitslag bekijken</button>' : '<button class="btn pri" data-a="resume">Verder spelen</button>'}
    ${G && G.kind === 'bot' ? '<button class="btn sec" data-a="bot">Nieuw spel tegen de computer</button>' : ''}
    ${G && G.kind === 'local' ? '<button class="btn sec" data-a="local">Nieuw spel samen</button>' : ''}
    <button class="btn sec" data-a="rulesm">Hoe werkt het?</button>
    <button class="btn sec" data-a="sound">Geluid: ${soundOn ? 'aan' : 'uit'}</button>
    <button class="btn sec" data-a="copylog">Kopieer log</button>
    ${ctx.extraButtons('menu')}
    <button class="btn ghost" data-a="home">${online ? 'Stoppen en naar start' : 'Naar start'}</button>
    <p class="fine" style="margin-top:12px">Gaat er iets mis? Kopieer de log en plak hem bij Claude. Versie ${VERSION}.</p>`, 'menu');
}
async function copyLog() {
  await Log.flush();
  const txt = Log.text();
  try { await navigator.clipboard.writeText(txt); toast('Log gekopieerd'); }
  catch (e) { openOv(`<h2>Log</h2><p class="fine">Selecteer alles en kopieer.</p><textarea class="field" readonly>${esc(txt)}</textarea><button class="btn ghost" data-a="menu">Terug</button>`, 'menu'); }
}
function startBot(level, saved) {
  leaveOnline(); stopGame(); closeOv(); clearToast(); ui = 'game';
  if (saved) G = makeGame({ kind: 'bot', level: saved.level, seed: saved.seed, starter: saved.starter, mv: saved.mv });
  else {
    const starter = Math.random() < 0.5 ? 0 : 1;
    G = makeGame({ kind: 'bot', level, seed: rndSeed(), starter });
    toast(starter === 0 ? 'Jij begint' : 'De computer begint');
  }
  Log.add('game', saved ? `computer-spel hervat (${G.level})` : `computer-spel gestart (${G.level})`);
  layout(); G.start();
}
function startLocal() {
  leaveOnline(); stopGame(); closeOv(); clearToast(); ui = 'game';
  const starter = localRound++ % 2;
  G = makeGame({ kind: 'local', seed: rndSeed(), starter });
  toast(`Speler ${starter + 1} begint`);
  Log.add('game', 'samen-spelen gestart'); layout(); G.start();
}

const ACT = {
  cont: () => { const s = ls.get('bot', null); if (validSaved(s)) startBot(s.level, s); else showBotPick(); },
  bot: () => showBotPick(),
  botgo: el => startBot(el.dataset.level),
  local: () => startLocal(),
  online: () => showOnline(),
  home: () => showHome(),
  pg: () => ctx.exit(),
  pgbuzz: () => ctx.buzz(),
  rules: () => showRules('home'),
  rulesm: () => showRules('menu'),
  host: el => goOnline('h', cleanCode(el && el.dataset.code).length === 4 ? cleanCode(el.dataset.code) : newCode()),
  join: () => { const c = cleanCode($('#code') && $('#code').value); if (c.length !== 4) { toast('Vul de 4 letters van de code in'); return; } goOnline('g', c); },
  rejoin: el => goOnline('g', el.dataset.code),
  start: () => { if (Net.role === 'h' && Net.connected) hostStart(); },
  menu: () => showMenu(),
  resume: () => { if (G) { closeOv(); ui = 'game'; } else showHome(); },
  result: () => { if (lastResult) showResult(lastResult); },
  view: () => { closeOv(); ui = 'game'; },
  sound: () => { soundOn = !soundOn; ls.set('sound', soundOn); if (soundOn) sfx.tick(); showMenu(); },
  copylog: () => copyLog(),
  share: async () => {
    const url = ctx.shareUrl(Net.code), text = `Speel Tegelduel tegen me! Code: ${Net.code}`;
    try { if (navigator.share) { await navigator.share({ title: 'Tegelduel', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + ' ' + url); toast('Uitnodiging gekopieerd'); } catch (e) { toast('Code: ' + Net.code); }
  }
};
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]');
  if (a) { const f = ACT[a.dataset.a]; if (f) { audio(); f(a); } return; }
  if (ovEl.classList.contains('on') || !e.target.closest('#app')) return;
  const t = e.target.closest('[data-t]');
  if (t) { const [s, c] = t.dataset.t.split(':').map(Number); audio(); pick(s, c); return; }
  const l = e.target.closest('[data-line]');
  if (l) { audio(); place(+l.dataset.line); return; }
  if (G && e.target.closest('#market')) { if (!G.canInteract()) toast(G.waitMsg()); else if (sel) { sel = null; renderAll(); } return; }
  if (sel) { sel = null; renderAll(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sel) { sel = null; renderAll(); return; }
  if (e.key !== 'Enter') return;
  if (e.target.id === 'code') ACT.join(); else if (e.target.id === 'nick' && ui === 'online') e.target.blur();
});
document.addEventListener('input', e => { if (e.target.id === 'code') { const v = cleanCode(e.target.value); if (v !== e.target.value) e.target.value = v; } });

setInterval(() => { if (G && G.tick) G.tick(); if (G) renderHud(); }, 250);

/* ---------------- START ---------------- */
layout(); renderAll();
Log.add('info', `tegel ${getComputedStyle(rootEl).getPropertyValue('--cs').trim()}, venster ${innerWidth}x${innerHeight}`);
const joinCode = cleanCode(params.get('join')), hostCode = cleanCode(params.get('host'));
if (hostCode.length === 4) goOnline('h', hostCode);
else if (joinCode.length === 4) { showOnline(joinCode); if (ls.get('nick', '')) setTimeout(() => goOnline('g', joinCode), 150); }
else showHome();

if (params.has('test')) window.__td = { get G() { return G; }, Net, replay, legalMoves, botMove, applyMove, newGame, cloneLite, Log, get ui() { return ui; } };
return {
  unmount() {
    try { leaveOnline(); } catch (e) {}
    try { if (G) { G.save(); G.stop(); } } catch (e) {}
    G = null;
    if (AC) { try { AC.close(); } catch (e) {} AC = null; }
    delete window.__td;
  }
};
