/* =====================================================================
   PomGames — backend
   Firebase: accounts (vaste naam + wachtwoord), spelerslijst, berichten,
   uitnodigingen, buzzers en pushmeldingen.
   ?mock=1 gebruikt een lokale nep-backend (alleen om te testen).
   ===================================================================== */
(() => {
'use strict';
const { Log, store } = PG;
const CFG = window.PG_CONFIG || {};
const FB_VER = '12.19.0';
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const emailOf = n => `${n.toLowerCase()}@pomgames.example`;
const chatIdOf = (a, b) => [a, b].sort().join('_');
const fail = (msg, code) => Object.assign(new Error(msg), { code: code || 'pg' });

function checkName(name) { if (!NAME_RE.test(name)) throw fail('Kies een naam van 3 tot 16 tekens: letters, cijfers of _ (geen spaties).', 'name'); }
function checkPass(p) { if (String(p).length < 6) throw fail('Kies een wachtwoord van minstens 6 tekens.', 'pass'); }
function previewOf(m, fromName) {
  if (m.type === 'buzz') return `${fromName} buzzte`;
  if (m.type === 'invite') return `Uitnodiging: ${(PG.def(m.game) && PG.def(m.game).name) || m.game}`;
  return String(m.text || '').slice(0, 80);
}
function cleanMsg(m) {
  const type = ['text', 'buzz', 'invite'].includes(m.type) ? m.type : 'text';
  const o = { type };
  if (type === 'text') o.text = String(m.text || '').trim().slice(0, 500);
  if (type === 'invite') { o.game = String(m.game || '').slice(0, 20); o.code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }
  return o;
}
function pushSupport() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!CFG.vapidKey) return 'noconfig';
  return Notification.permission;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = res; s.onerror = () => rej(fail('Kon ' + src.split('/').pop() + ' niet laden. Controleer je internet.', 'load'));
    document.head.appendChild(s);
  });
}
const sdk = p => `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${p}-compat.js`;
function authMsg(e) {
  const c = (e && e.code) || '';
  return ({
    'auth/email-already-in-use': 'Deze naam is al bezet. Kies een andere.',
    'auth/invalid-credential': 'Naam of wachtwoord klopt niet.',
    'auth/invalid-login-credentials': 'Naam of wachtwoord klopt niet.',
    'auth/wrong-password': 'Naam of wachtwoord klopt niet.',
    'auth/user-not-found': 'Naam of wachtwoord klopt niet.',
    'auth/weak-password': 'Dit wachtwoord is te zwak. Kies minstens 6 tekens.',
    'auth/network-request-failed': 'Geen verbinding met internet. Probeer het opnieuw.',
    'auth/too-many-requests': 'Te vaak geprobeerd. Wacht een paar minuten.',
    'auth/operation-not-allowed': 'Inloggen met wachtwoord staat nog uit in Firebase (handleiding, stap 4).',
    'auth/unauthorized-domain': 'Dit webadres staat nog niet bij de toegestane domeinen in Firebase (handleiding, stap 4).',
    'auth/invalid-api-key': 'De Firebase-gegevens in config.js kloppen niet (handleiding, stap 3).',
    'permission-denied': 'Geen toegang tot de database. Staan de Firestore-regels erop? (handleiding, stap 5)'
  })[c] || (e && e.code === 'pg' || (e && ['name', 'pass', 'load'].includes(e.code)) ? e.message : 'Er ging iets mis (' + (c || (e && e.message) || 'onbekend') + ').');
}

/* ---------------- FIREBASE ---------------- */
function firebaseBackend() {
  let auth, db, FV, me = null, lastTouch = 0, messaging = null, signingUp = false;
  const authCbs = [];
  const emit = () => authCbs.forEach(f => { try { f(me); } catch (e) {} });
  async function ensureProfile(u) {
    const ref = db.collection('users').doc(u.uid);
    const snap = await ref.get();
    if (snap.exists) return snap.data().name;
    const name = u.displayName || u.email.split('@')[0];
    const b = db.batch();
    b.set(db.collection('usernames').doc(name.toLowerCase()), { uid: u.uid, name, at: FV.serverTimestamp() });
    b.set(ref, { name, nameLower: name.toLowerCase(), createdAt: FV.serverTimestamp(), lastSeen: FV.serverTimestamp() });
    await b.commit();
    Log.add('auth', 'profiel aangemaakt voor ' + name);
    return name;
  }
  const ms = t => t && t.toMillis ? t.toMillis() : 0;
  const B = {
    mode: 'firebase', emailOf,
    async init() {
      await loadScript(sdk('app'));
      await Promise.all([loadScript(sdk('auth')), loadScript(sdk('firestore'))]);
      firebase.initializeApp(CFG.firebase);
      auth = firebase.auth(); db = firebase.firestore(); FV = firebase.firestore.FieldValue;
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      await new Promise(res => {
        let first = true;
        auth.onAuthStateChanged(async u => {
          if (u && signingUp) return; // signUp() maakt het profiel zelf en meldt zich daarna
          try {
            if (u) { const name = await ensureProfile(u); me = { uid: u.uid, name }; }
            else me = null;
          } catch (e) {
            Log.add('err', 'profiel laden: ' + (e.code || e.message));
            me = u ? { uid: u.uid, name: u.displayName || u.email.split('@')[0] } : null;
          }
          Log.add('auth', me ? 'ingelogd als ' + me.name : 'niet ingelogd');
          if (first) { first = false; res(); }
          emit();
        });
      });
    },
    onAuth(cb) { authCbs.push(cb); },
    me: () => me,
    async signUp(name, pass) {
      checkName(name); checkPass(pass);
      signingUp = true;
      try {
        const cred = await auth.createUserWithEmailAndPassword(emailOf(name), pass);
        await cred.user.updateProfile({ displayName: name });
        me = { uid: cred.user.uid, name: await ensureProfile(cred.user) };
        Log.add('auth', 'nieuw account ' + name);
      } catch (e) { Log.add('auth', 'account maken mislukt: ' + (e.code || e.message)); signingUp = false; throw fail(authMsg(e), e.code); }
      signingUp = false; emit();
    },
    async signIn(name, pass) {
      if (!name || !pass) throw fail('Vul je naam en wachtwoord in.');
      try { await auth.signInWithEmailAndPassword(emailOf(name.trim()), pass); }
      catch (e) { Log.add('auth', 'inloggen mislukt: ' + (e.code || e.message)); throw fail(authMsg(e), e.code); }
    },
    async signOut() {
      const t = store.get('pushToken', '');
      if (t && me) { try { await db.collection('users').doc(me.uid).collection('tokens').doc(t).delete(); } catch (e) {} store.del('pushToken'); }
      try { if (messaging) await messaging.deleteToken(); } catch (e) {}
      await auth.signOut();
    },
    touch(force) {
      if (!me || (!force && Date.now() - lastTouch < 60000)) return;
      lastTouch = Date.now();
      db.collection('users').doc(me.uid).update({ lastSeen: FV.serverTimestamp() }).catch(e => Log.add('net', 'online-status: ' + e.code));
    },
    watchPlayers(cb) {
      return db.collection('users').orderBy('nameLower').limit(300).onSnapshot(
        s => cb(s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' }); return { uid: d.id, name: x.name, lastSeen: ms(x.lastSeen) }; })),
        e => Log.add('err', 'spelers laden: ' + e.code));
    },
    watchChats(cb) {
      return db.collection('chats').where('members', 'array-contains', me.uid).onSnapshot(s => {
        cb(s.docs.map(d => {
          const x = d.data({ serverTimestamps: 'estimate' }), other = (x.members || []).find(u => u !== me.uid) || '';
          const read = x.read || {};
          return { id: d.id, other, otherName: (x.names || {})[other] || 'Speler', lastAt: ms(x.lastAt), lastFrom: x.lastFrom, lastType: x.lastType,
            lastText: x.lastText || '', lastGame: x.lastGame || '', lastCode: x.lastCode || '', lastMsg: x.lastMsg || '', readAt: ms(read[me.uid]) };
        }));
      }, e => Log.add('err', 'berichten laden: ' + e.code));
    },
    watchMessages(chatId, cb) {
      return db.collection('chats').doc(chatId).collection('messages').orderBy('at', 'desc').limit(80).onSnapshot(s => {
        cb(s.docs.map(d => { const x = d.data({ serverTimestamps: 'estimate' }); return { id: d.id, from: x.from, type: x.type, text: x.text || '', game: x.game || '', code: x.code || '', at: ms(x.at) }; }).reverse());
      }, e => Log.add('err', 'gesprek laden: ' + e.code));
    },
    async send(to, toName, raw) {
      if (!me) throw fail('Je bent niet ingelogd.');
      const m = cleanMsg(raw);
      if (m.type === 'text' && !m.text) return null;
      const chatId = chatIdOf(me.uid, to), chat = db.collection('chats').doc(chatId), ref = chat.collection('messages').doc();
      const now = FV.serverTimestamp();
      const b = db.batch();
      b.set(chat, { members: [me.uid, to].sort(), names: { [me.uid]: me.name, [to]: toName }, lastAt: now, lastFrom: me.uid, lastType: m.type,
        lastText: previewOf(m, me.name), lastGame: m.game || '', lastCode: m.code || '', lastMsg: ref.id, read: { [me.uid]: now } }, { merge: true });
      b.set(ref, Object.assign({ from: me.uid, at: now }, m));
      await b.commit();
      Log.add('msg', `${m.type} naar ${toName}${m.game ? ' (' + m.game + ' ' + m.code + ')' : ''}`);
      return { chatId, id: ref.id };
    },
    markRead(chatId) {
      if (!me) return;
      db.collection('chats').doc(chatId).set({ read: { [me.uid]: FV.serverTimestamp() } }, { merge: true }).catch(e => Log.add('net', 'gelezen: ' + e.code));
    },
    async getMessage(chatId, id) {
      const s = await db.collection('chats').doc(chatId).collection('messages').doc(id).get();
      if (!s.exists) return null;
      const x = s.data(); return { id, chatId, from: x.from, type: x.type, game: x.game || '', code: x.code || '', at: ms(x.at) };
    },
    async nameOf(uid) { try { const s = await db.collection('users').doc(uid).get(); return s.exists ? s.data().name : ''; } catch (e) { return ''; } },
    pushSupport,
    async enablePush(permAlready) {
      // Let op: de toestemmingsvraag moet direct na een tik komen (iPhone), dus eerst vragen, dan pas laden.
      const perm = permAlready || await Notification.requestPermission();
      Log.add('push', 'toestemming: ' + perm);
      if (perm !== 'granted') return perm;
      try {
        if (!window.firebase.messaging) await loadScript(sdk('messaging'));
        const reg = await navigator.serviceWorker.ready;
        messaging = messaging || firebase.messaging();
        const token = await messaging.getToken({ vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
        if (!token) throw fail('geen token');
        await db.collection('users').doc(me.uid).collection('tokens').doc(token).set({ at: FV.serverTimestamp(), ua: navigator.userAgent.slice(0, 120) });
        const old = store.get('pushToken', '');
        if (old && old !== token) db.collection('users').doc(me.uid).collection('tokens').doc(old).delete().catch(() => {});
        store.set('pushToken', token);
        messaging.onMessage(p => Log.add('push', 'melding terwijl app open: ' + ((p.notification && p.notification.title) || '')));
        Log.add('push', 'token opgeslagen');
        return 'granted';
      } catch (e) { Log.add('err', 'push aanzetten: ' + (e.code || e.message)); return 'error'; }
    },
    saveLog(d) { if (me) return db.collection('logs').doc(me.uid).set(d); return Promise.resolve(); },

    /* ---- games: catalogus en import (schrijven mag alleen de beheerder, zie firestore.rules) ---- */
    watchCatalog(cb) {
      return db.collection('games').onSnapshot(s => {
        const o = {};
        s.docs.forEach(d => { const x = d.data({ serverTimestamps: 'estimate' }); o[d.id] = Object.assign({}, x, { updatedAt: ms(x.updatedAt), createdAt: ms(x.createdAt) }); });
        cb(o);
      }, e => { Log.add('err', 'gamelijst laden: ' + e.code); cb(null); });
    },
    async getGameCode(id) {
      const s = await db.collection('gamecode').doc(id).get();
      return s.exists ? { html: s.data().html, version: s.data().version | 0 } : null;
    },
    async isAdmin() {
      try { await db.collection('admin').doc('probe').get(); return true; }
      catch (e) { if (e.code !== 'permission-denied') Log.add('net', 'beheerder-check: ' + e.code); return false; }
    },
    async publishGame(meta, html) {
      const ref = db.collection('games').doc(meta.id), code = db.collection('gamecode').doc(meta.id);
      const cur = await ref.get();
      const prev = cur.exists ? (cur.data().version | 0) : 0, version = prev + 1, size = new Blob([html]).size, now = FV.serverTimestamp();
      const doc = { name: meta.name, tagline: meta.tagline, accent: meta.accent, modes: meta.modes, invite: !!meta.invite, aware: !!meta.aware,
        version, size, updatedAt: now, updatedBy: me.name, hidden: cur.exists ? !!cur.data().hidden : false };
      if (!prev) doc.createdAt = now;
      const b = db.batch();
      b.set(code, { html, version, size, at: now });
      b.set(ref, doc, { merge: true });
      await b.commit();
      Log.add('admin', `${meta.id} v${version} gepubliceerd (${Math.round(size / 1024)} kB)`);
      return version;
    },
    async setGameFlags(id, patch) { await db.collection('games').doc(id).set(patch, { merge: true }); Log.add('admin', `${id} ${JSON.stringify(patch)}`); },
    async deleteGame(id) {
      const b = db.batch(); b.delete(db.collection('games').doc(id)); b.delete(db.collection('gamecode').doc(id)); await b.commit();
      Log.add('admin', `${id} verwijderd`);
    }
  };
  return B;
}

/* ---------------- NEP-BACKEND (alleen ?mock=1, om te testen) ---------------- */
function mockBackend() {
  const KEY = 'pgmock.db', bc = ('BroadcastChannel' in window) ? new BroadcastChannel('pgmock') : null;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, chats: {}, msgs: {} }; } catch (e) { return { users: {}, chats: {}, msgs: {} }; } };
  let DB = load(), me = null;
  const authCbs = [], watchers = new Set();
  const save = () => { localStorage.setItem(KEY, JSON.stringify(DB)); if (bc) bc.postMessage(1); notify(); };
  let pending = 0;
  const notify = () => { if (pending) return; pending = setTimeout(() => { pending = 0; watchers.forEach(w => { try { w(); } catch (e) {} }); }, 0); };
  if (bc) bc.onmessage = () => { DB = load(); notify(); };
  const watch = fn => { watchers.add(fn); setTimeout(fn, 0); return () => watchers.delete(fn); };
  const setMe = u => { me = u; sessionStorage.setItem('pgmock.me', JSON.stringify(u)); authCbs.forEach(f => f(me)); };
  let seq = 0; const nid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
  return {
    mode: 'mock', emailOf,
    async init() { try { me = JSON.parse(sessionStorage.getItem('pgmock.me')); } catch (e) { me = null; } },
    onAuth(cb) { authCbs.push(cb); },
    me: () => me,
    async signUp(name, pass) {
      checkName(name); checkPass(pass); DB = load();
      if (Object.values(DB.users).some(u => u.nameLower === name.toLowerCase())) throw fail('Deze naam is al bezet. Kies een andere.');
      const uid = 'u' + nid(); DB.users[uid] = { name, nameLower: name.toLowerCase(), pass, lastSeen: Date.now() }; save(); setMe({ uid, name });
    },
    async signIn(name, pass) {
      DB = load(); const e = Object.entries(DB.users).find(([, u]) => u.nameLower === String(name).trim().toLowerCase());
      if (!e || e[1].pass !== pass) throw fail('Naam of wachtwoord klopt niet.');
      setMe({ uid: e[0], name: e[1].name });
    },
    async signOut() { sessionStorage.removeItem('pgmock.me'); setMe(null); },
    touch() { if (me && DB.users[me.uid]) { DB.users[me.uid].lastSeen = Date.now(); save(); } },
    watchPlayers(cb) { return watch(() => cb(Object.entries(DB.users).map(([uid, u]) => ({ uid, name: u.name, lastSeen: u.lastSeen })).sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1))); },
    watchChats(cb) {
      return watch(() => { if (!me) return; cb(Object.entries(DB.chats).filter(([, c]) => c.members.includes(me.uid)).map(([id, c]) => {
        const other = c.members.find(u => u !== me.uid);
        return { id, other, otherName: c.names[other], lastAt: c.lastAt, lastFrom: c.lastFrom, lastType: c.lastType, lastText: c.lastText, lastGame: c.lastGame, lastCode: c.lastCode, lastMsg: c.lastMsg, readAt: (c.read || {})[me.uid] || 0 };
      })); });
    },
    watchMessages(chatId, cb) { return watch(() => cb((DB.msgs[chatId] || []).slice(-80))); },
    async send(to, toName, raw) {
      const m = cleanMsg(raw); if (m.type === 'text' && !m.text) return null;
      DB = load(); const chatId = chatIdOf(me.uid, to), id = nid(), now = Date.now();
      (DB.msgs[chatId] = DB.msgs[chatId] || []).push(Object.assign({ id, from: me.uid, at: now }, m));
      const c = DB.chats[chatId] || { members: [me.uid, to].sort(), names: {}, read: {} };
      Object.assign(c, { lastAt: now, lastFrom: me.uid, lastType: m.type, lastText: previewOf(m, me.name), lastGame: m.game || '', lastCode: m.code || '', lastMsg: id });
      c.names[me.uid] = me.name; c.names[to] = toName; c.read[me.uid] = now; DB.chats[chatId] = c; save();
      Log.add('msg', `${m.type} naar ${toName}`);
      return { chatId, id };
    },
    markRead(chatId) { DB = load(); const c = DB.chats[chatId]; if (c && me) { c.read[me.uid] = Date.now(); save(); } },
    async getMessage(chatId, id) { DB = load(); const m = (DB.msgs[chatId] || []).find(x => x.id === id); return m ? Object.assign({ chatId }, m) : null; },
    async nameOf(uid) { return (DB.users[uid] || {}).name || ''; },
    pushSupport: () => 'unsupported',
    async enablePush() { return 'unsupported'; },
    saveLog() { return Promise.resolve(); },
    watchCatalog(cb) { return watch(() => cb(JSON.parse(JSON.stringify(DB.games || {})))); },
    async getGameCode(id) { DB = load(); const c = (DB.gamecode || {})[id]; return c ? { html: c.html, version: c.version } : null; },
    async isAdmin() { DB = load(); return !!me && Object.keys(DB.users)[0] === me.uid; },
    async publishGame(meta, html) {
      DB = load(); DB.games = DB.games || {}; DB.gamecode = DB.gamecode || {};
      const cur = DB.games[meta.id] || {}, version = (cur.version | 0) + 1, now = Date.now(), size = new Blob([html]).size;
      DB.games[meta.id] = Object.assign({}, cur, { name: meta.name, tagline: meta.tagline, accent: meta.accent, modes: meta.modes, invite: !!meta.invite, aware: !!meta.aware,
        version, size, updatedAt: now, updatedBy: me.name, hidden: !!cur.hidden }, cur.version ? {} : { createdAt: now });
      DB.gamecode[meta.id] = { html, version, size, at: now };
      save(); Log.add('admin', `${meta.id} v${version} gepubliceerd`); return version;
    },
    async setGameFlags(id, patch) { DB = load(); DB.games = DB.games || {}; DB.games[id] = Object.assign({}, DB.games[id] || {}, patch); save(); },
    async deleteGame(id) { DB = load(); if (DB.games) delete DB.games[id]; if (DB.gamecode) delete DB.gamecode[id]; save(); }
  };
}

const configured = !!(CFG.firebase && CFG.firebase.apiKey && CFG.firebase.projectId);
const mode = PG.qs.has('mock') ? 'mock' : configured ? 'firebase' : 'none';
PG.backend = mode === 'mock' ? mockBackend() : mode === 'firebase' ? firebaseBackend() : null;
PG.backendMode = mode;
PG.chatIdOf = chatIdOf;
PG.authMsg = authMsg;
Log.add('info', 'backend: ' + mode);
})();
