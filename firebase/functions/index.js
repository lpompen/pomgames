/* PomGames: stuurt een pushmelding zodra iemand een bericht, uitnodiging of buzz verstuurt. */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
// Zelfde regio als je Firestore-database (handleiding: europe-west1).
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });
const APP_URL = defineString('APP_URL');
const GAMES = { blokduel: 'Blokduel', mijnenduel: 'Mijnenduel', tegelduel: 'Tegelduel', bommenduel: 'Bommenduel' };
const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

exports.stuurMelding = onDocumentCreated('chats/{chatId}/messages/{msgId}', async event => {
  const snap = event.data;
  if (!snap) return;
  const m = snap.data();
  const { chatId, msgId } = event.params;
  const db = getFirestore();

  const chatSnap = await db.doc(`chats/${chatId}`).get();
  const chat = chatSnap.exists ? chatSnap.data() : null;
  if (!chat || !Array.isArray(chat.members) || !chat.members.includes(m.from)) return;
  const to = chat.members.find(u => u !== m.from);
  if (!to) return;

  const fromSnap = await db.doc(`users/${m.from}`).get();
  const from = (fromSnap.exists && fromSnap.data().name) || 'Iemand';
  const base = APP_URL.value().replace(/\/?$/, '/');

  let title, body, link, tag;
  if (m.type === 'buzz') {
    title = `${from} buzzt je!`; body = 'Er wacht iemand op je in PomGames.';
    link = `${base}?chat=${chatId}`; tag = `buzz-${m.from}`;
  } else if (m.type === 'invite') {
    let game = GAMES[m.game] || 'een game';
    try { const g = await db.doc(`games/${String(m.game || 'x').replace(/[^a-z0-9]/g, '') || 'x'}`).get(); if (g.exists && g.data().name) game = g.data().name; } catch (e) {}
    title = `${from} nodigt je uit`; body = `Speel ${game} tegen ${from}. Tik om mee te doen.`;
    link = `${base}?invite=${chatId}/${msgId}`; tag = `invite-${m.from}`;
  } else {
    title = from; body = String(m.text || '').slice(0, 140);
    link = `${base}?chat=${chatId}`; tag = `chat-${chatId}`;
  }

  const tokSnap = await db.collection(`users/${to}/tokens`).get();
  const tokens = tokSnap.docs.map(d => d.id);
  if (!tokens.length) { logger.info('Geen toestellen met meldingen voor', to); return; }

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      headers: { Urgency: 'high', TTL: m.type === 'invite' ? '1800' : '86400' },
      notification: { icon: `${base}icons/icon-192.png`, badge: `${base}icons/badge-96.png`, tag, renotify: true,
        vibrate: m.type === 'buzz' ? [220, 90, 220, 90, 320] : [120] },
      fcmOptions: { link }
    },
    data: { type: String(m.type), chatId, msgId, link }
  });

  const dead = [];
  res.responses.forEach((r, i) => { if (!r.success) { const code = r.error && r.error.code; logger.warn('Melding mislukt', code); if (DEAD.has(code)) dead.push(tokens[i]); } });
  await Promise.all(dead.map(t => db.doc(`users/${to}/tokens/${t}`).delete()));
  logger.info(`Melding ${m.type} naar ${to}: ${res.successCount} gelukt, ${res.failureCount} mislukt`);
});
