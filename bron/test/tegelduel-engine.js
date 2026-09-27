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


function count(st){ let n=st.bag.length+st.lid.length+st.center.length; st.fac.forEach(f=>n+=f.length);
  st.pl.forEach(p=>{ p.lines.forEach(l=>n+=l.n); p.floor.forEach(c=>{ if(c!==FP) n++; }); for(const w of p.wall) n+=w; }); return n; }
let games=0, moves=0, maxRounds=0, wins=[0,0,0], bad=0, slow=0; const t0=Date.now();
for(let g=0; g<400; g++){
  const lv=[g%2?'slim':'rustig', g%3?'rustig':'slim'];
  const st=newGame((Math.random()*2**31)|0, g%2); const mv=['',''];
  let guard=0;
  while(!st.done && guard++<500){
    const c=count(st); if(c!==100){ console.log('TELFOUT', c, 'ronde', st.round); bad++; break; }
    const t=performance.now(); const m = g<100 ? legalMoves(st)[Math.floor(Math.random()*legalMoves(st).length)] : botMove(st, lv[st.turn]);
    if(performance.now()-t>50) slow++;
    mv[st.turn]+=m.join('');
    if(!applyMove(st, m[0], m[1], m[2])){ console.log('ILLEGALE ZET', m); bad++; break; }
    moves++;
  }
  if(!st.done){ console.log('NIET KLAAR', guard); bad++; continue; }
  // replay determinisme
  const r=replay(st.R ? 0 : 0, 0, ['','']);
  games++; maxRounds=Math.max(maxRounds, st.round); wins[st.winner]++;
}
// determinisme: zelfde seed+zetten => zelfde uitslag
const st=newGame(12345,0), mv=['',''];
while(!st.done){ const m=botMove(st,'slim'); mv[st.turn]+=m.join(''); applyMove(st,...m); }
const rp=replay(12345,0,mv);
console.log(JSON.stringify({games, moves, maxRounds, wins, bad, slow, ms: Date.now()-t0, replayGelijk: rp.st.pl.map(p=>p.score).join()===st.pl.map(p=>p.score).join() && rp.st.done, score: st.pl.map(p=>p.score)}));
// sterkte: slim tegen rustig
let sw=[0,0,0]; for(let g=0; g<200; g++){ const s2=newGame((Math.random()*2**31)|0, g%2); const L=g%2?['slim','rustig']:['rustig','slim'];
  while(!s2.done){ const m=botMove(s2, L[s2.turn]); applyMove(s2,...m); }
  const w=s2.winner; sw[w===2?2:(L[w]==='slim'?0:1)]++; }
console.log('slim wint', sw[0], 'rustig wint', sw[1], 'gelijk', sw[2]);
