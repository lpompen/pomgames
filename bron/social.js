/* =====================================================================
   PomGames — schermen: inloggen, games, spelers, berichten,
   uitnodigen, buzzen, meldingen en de melding-banner.
   ===================================================================== */
(() => {
'use strict';
const { Log, store, esc, toast, avatar } = PG;
const thumb = g => PG.thumbOf(g);
const B = PG.backend;
const $ = id => document.getElementById(id);
const ONLINE_MS = 150000, INVITE_MS = 30 * 60000, BUZZ_GAP = 20000;
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4l.1 6.7L15 12 3.5 13.9z"/></svg>',
  buzz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4.5 8v8M1.8 10v4M19.5 8v8M22.2 10v4"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 7h11a4 4 0 0 1 3.9 4.8l-1 5a2.6 2.6 0 0 1-4.5 1.2L14 16h-4l-1.9 2a2.6 2.6 0 0 1-4.5-1.2l-1-5A4 4 0 0 1 6.5 7z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".6" fill="currentColor"/><circle cx="17.5" cy="13" r=".6" fill="currentColor"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.4"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>'
};

const S = { admin: false, catalogReady: null, catalogDone: null, me: null, tab: store.get('tab', 'games'), players: [], chats: [], known: null, openChat: null, msgs: [], unsubs: [], msgUnsub: null,
  lastBuzz: {}, bannerAction: null, installEvt: null, deepDone: false, sheetBack: null, hiddenAt: 0 };
PG.me = () => S.me;

/* ---------------- tijd en status ---------------- */
function ago(t) {
  if (!t) return 'nog niet online geweest';
  const d = Date.now() - t;
  if (d < ONLINE_MS) return 'online';
  const m = Math.round(d / 60000);
  if (m < 60) return `${m} min geleden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} uur geleden`;
  const days = Math.round(h / 24);
  return days === 1 ? 'gisteren' : days < 14 ? `${days} dagen geleden` : new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
const clock = t => t ? new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';
function shortWhen(t) {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(t);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'gisteren';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}
const gameName = id => (PG.def(id) && PG.def(id).name) || 'een game';
const newCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const unread = c => c.lastFrom && c.lastFrom !== (S.me && S.me.uid) && c.lastAt > c.readAt;

/* ---------------- geluid en trillen ---------------- */
let AC = null;
function beep(kind) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const notes = kind === 'buzz' ? [[180, 0], [180, .16], [180, .32]] : kind === 'invite' ? [[523, 0], [784, .12]] : [[660, 0]];
    for (const [f, dt] of notes) {
      const t = AC.currentTime + dt, o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === 'buzz' ? 'square' : 'triangle'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(kind === 'buzz' ? .05 : .08, t); g.gain.exponentialRampToValueAtTime(.0001, t + .14);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + .16);
    }
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate(kind === 'buzz' ? [220, 90, 220, 90, 320] : [120]); } catch (e) {}
}

/* ---------------- schermen ---------------- */
function screen(name) {
  for (const id of ['pg-auth', 'pg-home', 'pg-boot']) $(id).classList.toggle('on', id === name);
  document.body.classList.toggle('pg-tabs', name === 'pg-home' && !!S.me);
}
function setTab(t) {
  if (!['games', 'players', 'chats'].includes(t)) t = 'games';
  S.tab = t; store.set('tab', t);
  for (const x of ['games', 'players', 'chats']) $('pg-tab-' + x).hidden = x !== t;
  document.querySelectorAll('.pg-tabbar button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'));
  window.scrollTo(0, 0);
}

function renderGames() {
  const last = store.get('last', ''), fresh = Date.now() - 4 * 86400000;
  $('pg-list').innerHTML = PG.visibleGames().map(g => {
    const pill = g.imported && g.updatedAt > fresh ? `<span class="pg-new">${g.createdAt > fresh ? 'Nieuw' : 'Bijgewerkt'}</span>` : '';
    return `<button class="pg-game" data-pg="open" data-id="${esc(g.id)}" style="--acc:${g.accent}">
      ${thumb(g)}
      <span class="pg-gtxt"><span class="pg-gname">${esc(g.name)}</span><span class="pg-gtag">${esc(g.tagline)}</span>
      <span class="pg-modes">${pill}${g.modes.map(m => `<span>${esc(m)}</span>`).join('')}${g.id === last ? '<span class="pg-last">Laatst gespeeld</span>' : ''}</span></span>
    </button>`; }).join('') || '<div class="pg-empty">Er staan nog geen games klaar.</div>';
}
function renderMe() {
  const b = $('pg-mebtn');
  if (!S.me) { b.hidden = true; return; }
  b.hidden = false; b.innerHTML = `${avatar(S.me.name)}<b>${esc(S.me.name)}</b>`;
}
function renderPlayers() {
  const el = $('pg-players');
  const list = S.players.filter(p => !S.me || p.uid !== S.me.uid)
    .sort((a, b) => (Date.now() - b.lastSeen < ONLINE_MS) - (Date.now() - a.lastSeen < ONLINE_MS) || (b.lastSeen - a.lastSeen));
  if (!list.length) { el.innerHTML = '<div class="pg-empty">Nog geen andere spelers. Stuur je vrienden de link van deze app, dan verschijnen ze hier zodra ze een account maken.</div>'; return; }
  el.innerHTML = list.map(p => { const st = ago(p.lastSeen), on = st === 'online';
    return `<button class="pg-row" data-pg="player" data-uid="${esc(p.uid)}">${avatar(p.name)}<span class="pg-rtxt"><b>${esc(p.name)}</b><span class="${on ? 'on' : ''}">${on ? '<i class="pg-dot"></i>' : ''}${esc(st)}</span></span></button>`; }).join('');
}
function renderChats() {
  const el = $('pg-chats');
  const list = S.chats.slice().sort((a, b) => b.lastAt - a.lastAt);
  const n = list.filter(unread).length;
  $('pg-unread').textContent = n ? String(n) : '';
  if (!list.length) { el.innerHTML = '<div class="pg-empty">Nog geen berichten. Kies iemand bij Spelers om een bericht te sturen of uit te nodigen.<br><button class="pg-btn sec inline" data-pg="tab" data-tab="players">Naar spelers</button></div>'; return; }
  el.innerHTML = list.map(c => { const u = unread(c), mine = S.me && c.lastFrom === S.me.uid;
    return `<button class="pg-row" data-pg="chat" data-id="${esc(c.id)}">${avatar(c.otherName)}<span class="pg-rtxt"><b>${esc(c.otherName)}</b><span class="${u ? 'new' : ''}">${mine ? 'Jij: ' : ''}${esc(c.lastText)}</span></span><span class="pg-when">${esc(shortWhen(c.lastAt))}</span>${u ? '<span class="pg-count" aria-label="ongelezen"></span>' : ''}</button>`; }).join('');
}

/* ---------------- meldingen (push) ---------------- */
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function renderNotice() {
  const el = $('pg-notice');
  if (!B) {
    el.innerHTML = `<div class="pg-card hint"><b>Accounts en berichten staan nog uit</b><p>De games werken al. Voor inloggen, uitnodigen, berichten en meldingen vul je eerst de Firebase-gegevens in config.js in (zie de handleiding).</p></div>`;
    return;
  }
  if (!S.me) { el.innerHTML = ''; return; }
  const ps = B.pushSupport();
  let h = '';
  if (ps === 'default') h = `<div class="pg-card hint"><b>Zet meldingen aan</b><p>Dan hoor je het als iemand je uitnodigt, een bericht stuurt of buzzt, ook als PomGames dicht is.</p><button class="pg-btn pri" data-pg="push">Meldingen aanzetten</button></div>`;
  else if (ps === 'denied' && !store.get('deniedSeen', false)) h = `<div class="pg-card"><b>Meldingen staan uit</b><p>Je hebt meldingen geweigerd. Aanzetten kan via de instellingen van je telefoon: zoek PomGames op en sta meldingen toe.</p><button class="pg-btn ghost" data-pg="denyok">Oké</button></div>`;
  else if (ps === 'unsupported' && isIOS && !PG.STANDALONE) h = `<div class="pg-card hint"><b>Zet PomGames op je beginscherm</b><p>Alleen dan werken meldingen op de iPhone. Tik in Safari op Deel (het vierkantje met de pijl) en kies 'Zet op beginscherm'. Open de app daarna vanaf je beginscherm en log in.</p></div>`;
  if (S.installEvt && !PG.STANDALONE) h += `<div class="pg-card"><b>Installeer als app</b><p>Zet PomGames op je beginscherm, dan opent hij als een gewone app.</p><button class="pg-btn sec" data-pg="install">Installeren</button></div>`;
  el.innerHTML = h;
}
async function enablePush() {
  if (!B) return;
  const r = await B.enablePush();
  if (r === 'granted') toast('Meldingen staan aan');
  else if (r === 'denied') toast('Meldingen geweigerd. Aanzetten kan later via je telefooninstellingen.', 4000);
  else if (r === 'error') toast('Meldingen aanzetten lukte niet. Kopieer de log voor Claude.', 4000);
  else if (r === 'unsupported') toast(isIOS && !PG.STANDALONE ? 'Zet PomGames eerst op je beginscherm.' : 'Dit toestel ondersteunt geen meldingen.', 4000);
  renderNotice(); closeSheet();
}
function askPushSheet() {
  if (!B || B.pushSupport() !== 'default' || store.get('pushAsked', false)) return;
  store.set('pushAsked', true);
  openSheet(`<h3>Meldingen aanzetten?</h3>
    <p class="pg-sub">Dan krijg je een seintje als iemand je uitnodigt voor een game, je een bericht stuurt of je buzzt. Ook als de app dicht is.</p>
    <button class="pg-btn pri" data-pg="push">Meldingen aanzetten</button>
    <button class="pg-btn ghost" data-pg="sheetclose">Later</button>`);
}

/* ---------------- onderblad ---------------- */
function openSheet(html) { $('pg-sheetbox').innerHTML = html; $('pg-sheet').classList.add('on'); const f = $('pg-sheetbox').querySelector('button,input'); if (f) f.focus({ preventScroll: true }); }
function closeSheet() { $('pg-sheet').classList.remove('on'); }
function playerOf(uid) { return S.players.find(p => p.uid === uid) || null; }
function showPlayer(uid) {
  const p = playerOf(uid); if (!p) return;
  const st = ago(p.lastSeen);
  openSheet(`<div style="display:flex;align-items:center;gap:12px">${avatar(p.name)}<div><h3>${esc(p.name)}</h3><p class="pg-sub" style="margin:2px 0 0">${st === 'online' ? '<i class="pg-dot"></i>' : ''}${esc(st)}</p></div></div>
    <button class="pg-btn pri" data-pg="invitepick" data-uid="${esc(uid)}">Nodig uit voor een game</button>
    <button class="pg-btn sec" data-pg="chatwith" data-uid="${esc(uid)}">Stuur een bericht</button>
    <button class="pg-btn sec" data-pg="buzz" data-uid="${esc(uid)}">Buzz ${esc(p.name)}</button>
    <button class="pg-btn ghost" data-pg="sheetclose">Sluiten</button>`);
}
function showInvitePick(uid, name) {
  openSheet(`<h3>Nodig ${esc(name)} uit</h3><p class="pg-sub">Kies een game. ${esc(name)} krijgt een melding en kan meteen meedoen.</p>
    ${PG.visibleGames().filter(g => g.invite).map(g => `<button class="pg-pick" data-pg="invite" data-uid="${esc(uid)}" data-name="${esc(name)}" data-game="${esc(g.id)}">${thumb(g)}<b>${esc(g.name)}</b></button>`).join('')}
    <button class="pg-btn ghost" data-pg="sheetclose">Annuleren</button>`);
}
function showProfile() {
  if (!S.me) return;
  const ps = B ? B.pushSupport() : 'unsupported';
  const pushTxt = { granted: 'Meldingen staan aan.', denied: 'Meldingen staan uit (geweigerd). Aanzetten kan via de instellingen van je telefoon.', default: 'Meldingen staan nog uit.',
    unsupported: isIOS && !PG.STANDALONE ? 'Meldingen werken pas als PomGames op je beginscherm staat.' : 'Dit toestel ondersteunt geen meldingen.', noconfig: 'Meldingen zijn nog niet ingesteld (vapidKey in config.js).' }[ps] || '';
  openSheet(`<div style="display:flex;align-items:center;gap:12px">${avatar(S.me.name)}<div><h3>${esc(S.me.name)}</h3><p class="pg-sub" style="margin:2px 0 0">Je gebruikersnaam staat vast.</p></div></div>
    <p class="pg-sub" style="margin-top:14px">${esc(pushTxt)}</p>
    ${ps === 'default' ? '<button class="pg-btn pri" data-pg="push">Meldingen aanzetten</button>' : ''}
    ${S.admin ? '<button class="pg-btn sec" data-pg="admin">Games beheren</button>' : ''}
    <button class="pg-btn sec" data-pg="copylog">Kopieer log</button>
    <button class="pg-btn sec" data-pg="logout">Uitloggen</button>
    <button class="pg-btn ghost" data-pg="sheetclose">Sluiten</button>
    <p class="pg-fine" style="text-align:center">PomGames ${esc(PG.version)}. Gaat er iets mis? Kopieer de log en plak hem bij Claude.</p>`);
}
function confirmLogout() {
  openSheet(`<h3>Uitloggen?</h3><p class="pg-sub">Om weer in te loggen heb je je naam en wachtwoord nodig. Op dit toestel krijg je dan geen meldingen meer.</p>
    <button class="pg-btn pri" data-pg="logoutyes">Uitloggen</button><button class="pg-btn ghost" data-pg="sheetclose">Annuleren</button>`);
}

/* ---------------- banner ---------------- */
let bannerT = 0;
function banner(o) {
  const el = $('pg-banner');
  el.classList.remove('on', 'buzz');
  el.innerHTML = `${avatar(o.name)}<span class="pg-rtxt"><b>${esc(o.title)}</b><span>${esc(o.text || '')}</span></span>${o.label ? `<button class="pg-btn pri" data-pg="bact">${esc(o.label)}</button>` : ''}<button class="x" data-pg="bclose" aria-label="Sluiten">×</button>`;
  S.bannerAction = o.action || null;
  void el.offsetWidth;
  if (o.kind === 'buzz') el.classList.add('buzz');
  el.classList.add('on');
  clearTimeout(bannerT); bannerT = setTimeout(closeBanner, o.kind === 'invite' ? 25000 : 7000);
}
function closeBanner() { $('pg-banner').classList.remove('on'); S.bannerAction = null; }

/* ---------------- binnenkomende dingen terwijl de app open is ---------------- */
function onChats(list) {
  const first = !S.known;
  const known = S.known || {};
  S.chats = list; S.known = {};
  for (const c of list) {
    S.known[c.id] = c.lastAt;
    if (first || !c.lastAt || c.lastAt <= (known[c.id] || 0) || c.lastFrom === S.me.uid) continue;
    incoming(c);
  }
  renderChats();
  if (S.openChat && S.openChat.id) { const c = list.find(x => x.id === S.openChat.id); if (c && unread(c)) B.markRead(c.id); }
}
function incoming(c) {
  const inThisChat = S.openChat && S.openChat.id === c.id && $('pg-chat').classList.contains('on');
  if (c.lastType === 'buzz') {
    beep('buzz');
    banner({ kind: 'buzz', name: c.otherName, title: `${c.otherName} buzzt je!`, text: PG.isOpen() ? 'Tik om het gesprek te openen.' : 'Iemand wacht op je.', label: inThisChat ? '' : 'Open', action: () => openChat(c.id) });
  } else if (c.lastType === 'invite') {
    beep('invite');
    const msg = { from: c.other, game: c.lastGame, code: c.lastCode, at: c.lastAt };
    banner({ kind: 'invite', name: c.otherName, title: `${c.otherName} nodigt je uit`, text: `Speel ${gameName(c.lastGame)} tegen ${c.otherName}.`, label: 'Doe mee', action: () => acceptInvite(msg, c.otherName) });
  } else if (!inThisChat) {
    beep('msg');
    banner({ kind: 'msg', name: c.otherName, title: c.otherName, text: c.lastText, label: 'Open', action: () => openChat(c.id) });
  }
}

/* ---------------- acties ---------------- */
async function invite(uid, name, game) {
  closeSheet();
  const code = newCode();
  try { await B.send(uid, name, { type: 'invite', game, code }); }
  catch (e) { Log.add('err', 'uitnodigen: ' + (e.code || e.message)); toast('Uitnodigen lukte niet: ' + PG.authMsg(e), 4000); return; }
  toast(`${name} is uitgenodigd`);
  closeChat(true);
  PG.open(game, { host: code, opp: { uid, name } });
}
function acceptInvite(msg, name) {
  closeBanner(); closeSheet();
  if (!msg || !/^[A-Z]{4}$/.test(msg.code || '')) { toast('Deze uitnodiging klopt niet'); return; }
  if (!PG.def(msg.game)) { toast('Deze game staat (nog) niet in jouw PomGames. Open de app opnieuw.', 3500); return; }
  if (msg.at && Date.now() - msg.at > INVITE_MS) { toast('Deze uitnodiging is verlopen. Stuur een nieuwe.', 3500); return; }
  Log.add('msg', `uitnodiging aangenomen: ${msg.game} ${msg.code} van ${name}`);
  closeChat(true);
  PG.open(msg.game, { join: msg.code, opp: { uid: msg.from, name } });
}
async function buzz(uid, name, fromGame) {
  if (!B || !S.me) return;
  const last = S.lastBuzz[uid] || 0;
  if (Date.now() - last < BUZZ_GAP) { toast(`Je hebt ${name} net gebuzzt. Even geduld.`); return; }
  S.lastBuzz[uid] = Date.now();
  closeSheet();
  try { await B.send(uid, name, { type: 'buzz' }); toast(`${name} is gebuzzt`); beep('msg'); if (fromGame) Log.add('msg', 'buzz vanuit ' + fromGame); }
  catch (e) { S.lastBuzz[uid] = 0; toast('Buzzen lukte niet: ' + PG.authMsg(e), 4000); }
}
async function sendText() {
  const inp = $('pg-input'), txt = inp.value.trim();
  if (!txt || !S.openChat) return;
  inp.value = '';
  try { await B.send(S.openChat.uid, S.openChat.name, { type: 'text', text: txt }); }
  catch (e) { inp.value = txt; toast('Versturen lukte niet: ' + PG.authMsg(e), 4000); }
}

/* ---------------- gesprek ---------------- */
function openChatWith(uid, name) {
  if (!S.me) return;
  openChat(PG.chatIdOf(S.me.uid, uid), uid, name);
}
async function openChat(id, uid, name) {
  if (!S.me || !id) return;
  closeSheet(); closeBanner();
  const c = S.chats.find(x => x.id === id);
  if (!uid) uid = c ? c.other : id.split('_').find(u => u !== S.me.uid);
  if (!name) name = c ? c.otherName : ((playerOf(uid) || {}).name || await B.nameOf(uid) || 'Speler');
  if (PG.isOpen()) PG.closeGame();
  if (S.msgUnsub) S.msgUnsub();
  S.openChat = { id, uid, name }; S.msgs = [];
  $('pg-chatname').innerHTML = `<b>${esc(name)}</b><span id="pg-chatstat"></span>`;
  renderChatStatus();
  $('pg-msgs').innerHTML = '<p class="pg-sys">Laden…</p>';
  $('pg-chat').classList.add('on');
  S.msgUnsub = B.watchMessages(id, list => {
    S.msgs = list; renderMsgs();
    const c = S.chats.find(x => x.id === id);
    if (c && unread(c)) B.markRead(id);
  });
  Log.add('msg', 'gesprek open met ' + name);
}
function renderChatStatus() {
  const el = $('pg-chatstat'); if (!el || !S.openChat) return;
  const p = playerOf(S.openChat.uid), st = p ? ago(p.lastSeen) : '';
  el.className = st === 'online' ? 'on' : ''; el.innerHTML = st === 'online' ? '<i class="pg-dot"></i>online' : esc(st);
}
function closeChat(silent) {
  if (S.msgUnsub) { S.msgUnsub(); S.msgUnsub = null; }
  S.openChat = null; $('pg-chat').classList.remove('on');
  if (!silent) renderChats();
}
function renderMsgs() {
  const box = $('pg-msgs'), me = S.me.uid, name = S.openChat.name;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  if (!S.msgs.length) { box.innerHTML = `<p class="pg-sys">Nog geen berichten met ${esc(name)}. Zeg hallo, nodig uit voor een game of buzz.</p>`; return; }
  let h = '', lastDay = '';
  for (const m of S.msgs) {
    const day = m.at ? new Date(m.at).toDateString() : '';
    if (day && day !== lastDay) { lastDay = day; h += `<p class="pg-day">${esc(shortWhen(m.at) === clock(m.at) ? 'Vandaag' : shortWhen(m.at))}</p>`; }
    const mine = m.from === me;
    if (m.type === 'buzz') h += `<p class="pg-sys">${ICON.buzz}${mine ? 'Jij buzzte' : esc(name) + ' buzzte'} ${esc(clock(m.at))}</p>`;
    else if (m.type === 'invite') {
      const fresh = m.at && Date.now() - m.at < INVITE_MS;
      h += `<div class="pg-inv${mine ? ' me' : ''}"><b>${mine ? 'Jij nodigde uit' : esc(name) + ' nodigt je uit'}: ${esc(gameName(m.game))}</b><span>${fresh ? 'Code ' + esc(m.code) + ', ' + esc(clock(m.at)) : 'Verlopen'}</span>
        ${fresh ? (mine ? `<button class="pg-btn sec" data-pg="rehost" data-game="${esc(m.game)}" data-code="${esc(m.code)}">Open het spel</button>` : `<button class="pg-btn pri" data-pg="accept" data-msg="${esc(m.id)}">Doe mee</button>`) : ''}</div>`;
    } else h += `<div class="pg-msg ${mine ? 'me' : 'them'}">${esc(m.text)}<small>${esc(clock(m.at))}</small></div>`;
  }
  box.innerHTML = h;
  if (nearBottom || !box.dataset.seen) { box.scrollTop = box.scrollHeight; box.dataset.seen = '1'; }
}

/* ---------------- inloggen ---------------- */
let authMode = 'signup';
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll('#pg-authseg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('pg-pass2wrap').hidden = m !== 'signup';
  $('pg-signupnote').hidden = m !== 'signup';
  $('pg-pass').setAttribute('autocomplete', m === 'signup' ? 'new-password' : 'current-password');
  $('pg-authgo').textContent = m === 'signup' ? 'Account maken' : 'Inloggen';
  $('pg-autherr').textContent = '';
}
async function submitAuth(e) {
  e.preventDefault();
  const name = $('pg-name').value.trim(), pass = $('pg-pass').value, pass2 = $('pg-pass2').value, err = $('pg-autherr'), go = $('pg-authgo');
  err.textContent = '';
  if (authMode === 'signup' && pass !== pass2) { err.textContent = 'De twee wachtwoorden zijn niet hetzelfde.'; return; }
  go.disabled = true; go.textContent = authMode === 'signup' ? 'Account maken…' : 'Inloggen…';
  try {
    if (authMode === 'signup') { await B.signUp(name, pass); S.justSignedUp = true; }
    else await B.signIn(name, pass);
    $('pg-pass').value = ''; $('pg-pass2').value = '';
  } catch (ex) { err.textContent = ex.message || 'Er ging iets mis.'; }
  go.disabled = false; setAuthMode(authMode);
}

/* ---------------- ingelogd / uitgelogd ---------------- */
function stopWatching() { S.unsubs.forEach(f => { try { f(); } catch (e) {} }); S.unsubs = []; closeChat(true); S.known = null; S.chats = []; S.players = []; }
function onAuth(u) {
  const was = S.me && S.me.uid;
  if (u && was === u.uid) return;
  stopWatching();
  S.me = u || null;
  Log.setUser(u ? u.name : '');
  renderMe(); renderNotice();
  if (!u) {
    if (PG.isOpen()) PG.closeGame();
    screen('pg-auth'); setAuthMode(store.get('hasAccount', false) ? 'login' : 'signup');
    return;
  }
  store.set('hasAccount', true);
  Log.setRemote(d => B.saveLog(d));
  S.unsubs.push(B.watchPlayers(list => { S.players = list; renderPlayers(); renderChatStatus(); }));
  S.unsubs.push(B.watchChats(onChats));
  S.catalogReady = new Promise(res => { S.catalogDone = res; });
  S.unsubs.push(B.watchCatalog(docs => {
    if (docs) { PG.setCatalog(docs); renderGames(); if (PG.admin) PG.admin.refresh(); }
    if (S.catalogDone) { S.catalogDone(); S.catalogDone = null; }
  }));
  S.admin = false;
  B.isAdmin().then(v => { S.admin = !!v; if (v) Log.add('info', 'beheerder'); }).catch(() => {});
  B.touch(true);
  if (!PG.isOpen()) screen('pg-home');
  setTab(S.tab);
  if (B.pushSupport() === 'granted') B.enablePush('granted');
  if (S.justSignedUp || PG.STANDALONE) setTimeout(askPushSheet, 600);
  S.justSignedUp = false;
  handleDeepLink();
}
async function handleDeepLink() {
  if (S.deepDone) return; S.deepDone = true;
  const q = PG.qs, clean = () => { try { history.replaceState(null, '', location.pathname); } catch (e) {} };
  const inv = q.get('invite'), chat = q.get('chat'), g = q.get('g');
  if (inv && inv.includes('/')) {
    clean();
    const [cid, mid] = inv.split('/');
    try { const m = await B.getMessage(cid, mid); if (m && m.type === 'invite') acceptInvite(m, await B.nameOf(m.from) || 'Speler'); else toast('Uitnodiging niet gevonden'); }
    catch (e) { Log.add('err', 'uitnodiging openen: ' + (e.code || e.message)); toast('Uitnodiging openen lukte niet'); }
  } else if (chat) { clean(); openChat(chat); }
  else if (g) {
    clean();
    if (!PG.def(g) && S.catalogReady) await Promise.race([S.catalogReady, new Promise(r => setTimeout(r, 4000))]);
    if (PG.def(g)) PG.open(g, { join: q.get('join') || '', host: q.get('host') || '' });
    else toast('Deze game staat niet in PomGames');
  }
}

/* ---------------- klikken ---------------- */
const ACT = {
  open: el => PG.open(el.dataset.id),
  tab: el => { closeSheet(); setTab(el.dataset.tab); },
  player: el => showPlayer(el.dataset.uid),
  chat: el => openChat(el.dataset.id),
  chatwith: el => { const p = playerOf(el.dataset.uid); if (p) openChatWith(p.uid, p.name); },
  invitepick: el => { const p = playerOf(el.dataset.uid) || (S.openChat && { name: S.openChat.name }); showInvitePick(el.dataset.uid, p ? p.name : 'Speler'); },
  invite: el => invite(el.dataset.uid, el.dataset.name, el.dataset.game),
  buzz: el => { const uid = el.dataset.uid || (S.openChat && S.openChat.uid); const p = playerOf(uid); buzz(uid, p ? p.name : (S.openChat ? S.openChat.name : 'Speler')); },
  accept: el => { const m = S.msgs.find(x => x.id === el.dataset.msg); if (m) acceptInvite(m, S.openChat.name); },
  rehost: el => { const o = S.openChat; closeChat(true); PG.open(el.dataset.game, { host: el.dataset.code, opp: { uid: o.uid, name: o.name } }); },
  chatback: () => closeChat(),
  chatinvite: () => { if (S.openChat) showInvitePick(S.openChat.uid, S.openChat.name); },
  send: () => sendText(),
  profile: () => showProfile(),
  push: () => enablePush(),
  denyok: () => { store.set('deniedSeen', true); renderNotice(); },
  install: async () => { const ev = S.installEvt; S.installEvt = null; renderNotice(); if (ev) { ev.prompt(); try { const r = await ev.userChoice; Log.add('info', 'installeren: ' + r.outcome); } catch (e) {} } },
  copylog: () => PG.copyLog(),
  admin: () => { closeSheet(); if (PG.admin) PG.admin.open(); },
  logout: () => confirmLogout(),
  logoutyes: async () => { closeSheet(); try { await B.signOut(); } catch (e) { toast('Uitloggen lukte niet'); } },
  sheetclose: () => closeSheet(),
  bact: () => { const a = S.bannerAction; closeBanner(); if (a) a(); },
  bclose: () => closeBanner(),
  authmode: el => setAuthMode(el.dataset.mode),
  retry: () => location.reload(),
  offline: () => { screen('pg-home'); renderNotice(); }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-pg]');
  if (el) { const f = ACT[el.dataset.pg]; if (f) { e.preventDefault(); f(el); } return; }
  if (e.target === $('pg-sheet')) closeSheet();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('pg-sheet').classList.contains('on')) closeSheet(); else if ($('pg-chat').classList.contains('on')) closeChat(); }
  if (e.key === 'Enter' && e.target.id === 'pg-input' && !e.shiftKey) { e.preventDefault(); sendText(); }
});

/* ---------------- app-omgeving: service worker, installeren, terugkomen ---------------- */
function registerSW() {
  if (PG.IN_CLAUDE || !('serviceWorker' in navigator) || !/^https:|^http:\/\/(localhost|127\.)/.test(location.href)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    Log.add('info', 'service worker geregistreerd');
    reg.addEventListener('updatefound', () => Log.add('info', 'nieuwe versie van de service worker'));
  }).catch(e => Log.add('err', 'service worker: ' + e.message));
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; renderNotice(); });
addEventListener('appinstalled', () => { Log.add('info', 'app geïnstalleerd'); S.installEvt = null; renderNotice(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { S.hiddenAt = Date.now(); return; }
  if (B && S.me) B.touch(true);
  // lang weg geweest en geen game open: herladen, zodat iedereen de nieuwste versie heeft
  if (S.hiddenAt && Date.now() - S.hiddenAt > 60 * 60000 && !PG.isOpen() && !$('pg-chat').classList.contains('on')) { Log.add('info', 'lang weg geweest: nieuwste versie laden'); location.reload(); }
});
setInterval(() => { if (B && S.me && document.visibilityState === 'visible') B.touch(); if (S.tab === 'players') renderPlayers(); }, 30000);

PG.hooks.onClose.push(() => { renderGames(); if (S.me || !B) { screen('pg-home'); setTab(S.tab); } else screen('pg-auth'); });
PG.social = {
  canBuzz: () => !!(B && S.me),
  buzz: (uid, name, game) => buzz(uid, name, game)
};
PG.ui = { openSheet, closeSheet, screen, renderGames, isAdmin: () => S.admin, beep };

/* ---------------- start ---------------- */
PG.boot = async function boot() {
  $('pg-authform').addEventListener('submit', submitAuth);
  renderGames(); registerSW();
  PG.hooks.onOpen.push(() => { closeSheet(); document.body.classList.remove('pg-tabs'); });
  if (!B) {
    screen('pg-home'); renderNotice();
    const g = PG.qs.get('g'); if (g && PG.def(g)) PG.open(g, { join: PG.qs.get('join') || '' });
    return;
  }
  screen('pg-boot');
  try { await B.init(); }
  catch (e) {
    Log.add('err', 'backend start: ' + (e.code || e.message));
    $('pg-bootmsg').innerHTML = `<b>Geen verbinding met de server</b><br>Controleer je internet. De games zelf werken ook zonder.<br>
      <button class="pg-btn pri" data-pg="retry">Opnieuw proberen</button><button class="pg-btn ghost" data-pg="offline">Speel zonder account</button>`;
    return;
  }
  B.onAuth(onAuth);
  onAuth(B.me());
};
})();
