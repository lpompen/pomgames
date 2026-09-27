/* =====================================================================
   PomGames — Games beheren (alleen voor de beheerder)
   Importeer een game als één HTML-bestand of via een link, probeer hem uit
   en publiceer hem voor iedereen. Nieuwe versies, verbergen en verwijderen.
   De echte beveiliging zit in firestore.rules (alleen de beheerder mag schrijven).
   ===================================================================== */
(() => {
'use strict';
const { Log, esc, toast } = PG;
const B = PG.backend;
const $ = id => document.getElementById(id);
const MAX = 950000;
const MODES = ['Solo', 'Tegen computer', 'Online', 'Samen'];
const ID_RE = /^[a-z0-9]{2,24}$/;
let view = 'list', draft = null, busy = false;

const kB = n => Math.max(1, Math.round(n / 1024)) + ' kB';
const when = t => t ? new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '';
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 24);
const isOn = () => $('pg-admin').classList.contains('on');

function open() { if (!B) return; $('pg-admin').classList.add('on'); view = 'list'; draft = null; render(); Log.add('admin', 'beheer geopend'); }
function close() { $('pg-admin').classList.remove('on'); draft = null; view = 'list'; }
function refresh() { if (isOn() && view === 'list') render(); }
function render() {
  const body = $('pg-abody');
  body.innerHTML = view === 'list' ? listHTML() : view === 'source' ? sourceHTML() : formHTML();
  body.scrollTop = 0;
}

/* ---------------- lijst ---------------- */
function listHTML() {
  const rows = PG.allGames().map(g => {
    const hidden = PG.isHidden(g.id), builtin = !!PG.byId[g.id];
    const st = g.imported ? `Geïmporteerd, versie ${g.version}${g.updatedAt ? ', ' + when(g.updatedAt) : ''}${builtin ? ', vervangt de ingebouwde' : ''}` : 'Ingebouwd';
    return `<div class="pg-arow">
      <div class="pg-ahead">${PG.thumbOf(g)}<span class="pg-rtxt"><b>${esc(g.name)}</b><span>${esc(st)}${hidden ? ' · <em>verborgen</em>' : ''}</span></span></div>
      <div class="pg-aact">
        <button class="pg-btn sec inline" data-ad="update" data-id="${esc(g.id)}">Nieuwe versie</button>
        <button class="pg-btn sec inline" data-ad="hide" data-id="${esc(g.id)}" data-v="${hidden ? 0 : 1}">${hidden ? 'Tonen' : 'Verbergen'}</button>
        ${g.imported ? `<button class="pg-btn ghost inline" data-ad="del" data-id="${esc(g.id)}">${builtin ? 'Terug naar ingebouwd' : 'Verwijderen'}</button>` : ''}
      </div></div>`;
  }).join('');
  return `<button class="pg-btn pri" data-ad="new">Nieuwe game importeren</button>
    <p class="pg-fine">Importeer een game als één HTML-bestand, bijvoorbeeld een game die Claude voor je maakte, of via een link. Na publiceren staat hij bij iedereen in de lijst; niemand hoeft iets opnieuw te installeren.</p>
    <h2 class="pg-h2">Alle games</h2><div class="pg-rows">${rows}</div>`;
}

/* ---------------- bron kiezen ---------------- */
function sourceHTML() {
  const g = draft && draft.updateId ? PG.def(draft.updateId) : null;
  return `<h2 class="pg-h2">${g ? 'Nieuwe versie van ' + esc(g.name) : 'Game importeren'}</h2>
    <label class="pg-btn pri pg-file">Kies een HTML-bestand<input type="file" id="pg-afile" accept=".html,.htm,text/html"></label>
    <p class="pg-or">of via een link</p>
    <input id="pg-aurl" class="pg-field" placeholder="https://…/game.html" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false">
    <button class="pg-btn sec" data-ad="fetch">Ophalen</button>
    <p class="pg-err" id="pg-aerr" role="alert"></p>
    <p class="pg-fine">Tip: vraag Claude om de game "als HTML-bestand" en bewaar dat op je telefoon. Een link werkt met GitHub (ook github.com/…/blob/…) en andere sites die het toestaan.</p>
    <button class="pg-btn ghost" data-ad="list">Annuleren</button>`;
}
function rawUrl(u) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(u.trim());
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : u.trim();
}
async function fromUrl() {
  const inp = $('pg-aurl'), err = $('pg-aerr');
  let url = inp.value.trim();
  if (!/^https:\/\//i.test(url)) { err.textContent = 'Gebruik een link die met https:// begint.'; return; }
  url = rawUrl(url);
  err.textContent = 'Ophalen…';
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('status ' + r.status);
    const html = await r.text();
    analyze(html, url.split('/').pop().split('?')[0] || 'game.html', url);
  } catch (e) {
    Log.add('admin', 'ophalen mislukt: ' + e.message);
    err.textContent = `Deze link kon niet worden opgehaald (${e.message}). Sommige sites staan dat niet toe; kies dan het bestand zelf.`;
  }
}
async function fromFile(file) {
  if (!file) return;
  try { analyze(await file.text(), file.name, ''); }
  catch (e) { const err = $('pg-aerr'); if (err) err.textContent = 'Dit bestand kon niet worden gelezen.'; }
}

/* ---------------- analyseren ---------------- */
function analyze(html, fileName, url) {
  const updateId = draft && draft.updateId;
  const size = new Blob([html]).size;
  const err = $('pg-aerr');
  if (size > MAX) { if (err) err.textContent = `Dit bestand is ${kB(size)}. Het maximum is ${kB(MAX)}.`; return; }
  if (!/<script[\s>]/i.test(html)) { if (err) err.textContent = 'Dit lijkt geen game: er zit geen code in het bestand.'; return; }
  const title = ((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '').trim() || fileName.replace(/\.html?$/i, '');
  const desc = ((/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html) || [])[1] || '').trim();
  const prev = updateId ? PG.def(updateId) : null;
  const id = updateId || slug(title) || 'game';
  const modes = prev && prev.modes.length ? prev.modes.slice() : MODES.filter(m =>
    m === 'Solo' ? /\bsolo\b/i.test(html) : m === 'Tegen computer' ? /tegen de computer/i.test(html) : m === 'Online' ? /online/i.test(html) : /samen op (deze|één) telefoon/i.test(html));
  const canInvite = /\.get\(\s*['"]host['"]\s*\)/.test(html);
  const warnings = [];
  if (/window\.claude\.use\(/.test(html) && !/peerjs/i.test(html)) warnings.push('Deze game gebruikt functies van Claude en werkt daarbuiten misschien niet (online spelen of opslaan).');
  if (/(src|href)=["'](?!https?:|data:|#|mailto:|javascript:)[^"']+\.(js|css|png|jpg|svg|json)["']/i.test(html)) warnings.push('Deze game verwijst naar losse bestanden. Alleen alles in één HTML-bestand werkt.');
  const existing = !updateId && PG.def(id);
  draft = {
    html, fileName, url, size, updateId, id, name: prev ? prev.name : title.slice(0, 30), tagline: prev ? prev.tagline : desc.slice(0, 120),
    accent: prev && prev.accentKey ? prev.accentKey : prev ? keyOfAccent(prev.accent) : 'k' + (1 + (Math.abs([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 7)),
    modes, canInvite, invite: canInvite, aware: /PG_HOST/.test(html), warnings, existing: !!existing
  };
  Log.add('admin', `bestand ${fileName} ${kB(size)} uitnodigen=${canInvite} pg=${draft.aware}`);
  view = 'form'; render();
}
function keyOfAccent(v) { for (const [k, val] of Object.entries(PG.ACCENTS)) if (val === v) return k; return 'k2'; }

/* ---------------- formulier ---------------- */
function formHTML() {
  const d = draft, builtin = !!PG.byId[d.id];
  const note = d.updateId ? (builtin && !PG.def(d.id).imported ? `Dit vervangt de ingebouwde ${esc(PG.byId[d.id].name)} voor iedereen. Met "Terug naar ingebouwd" zet je hem later terug.` : 'Dit wordt een nieuwe versie. Wie de game opent, krijgt meteen de nieuwe.')
    : d.existing ? 'Er bestaat al een game met deze code. Publiceren maakt er een nieuwe versie van.' : '';
  return `<h2 class="pg-h2">Controleer en publiceer</h2>
    <p class="pg-fine">${esc(d.fileName)}, ${kB(d.size)}${d.aware ? '. Deze game werkt samen met PomGames.' : ''}</p>
    ${d.warnings.map(w => `<div class="pg-card hint"><p>${esc(w)}</p></div>`).join('')}
    ${note ? `<div class="pg-card"><p>${note}</p></div>` : ''}
    <label class="pg-lab" for="pg-aname">Naam</label><input id="pg-aname" class="pg-field" maxlength="30" value="${esc(d.name)}">
    <label class="pg-lab" for="pg-atag">Korte beschrijving</label><input id="pg-atag" class="pg-field" maxlength="120" value="${esc(d.tagline)}" placeholder="Wat doe je in deze game?">
    <label class="pg-lab" for="pg-aid">Code</label><input id="pg-aid" class="pg-field" maxlength="24" value="${esc(d.id)}" ${d.updateId ? 'disabled' : ''} autocapitalize="none" spellcheck="false">
    <p class="pg-fine">Kleine letters en cijfers. Staat vast na publiceren en zit in uitnodigingslinks.</p>
    <p class="pg-lab">Kleur</p><div class="pg-swatches" role="radiogroup" aria-label="Kleur">${Object.keys(PG.ACCENTS).map(k =>
      `<button role="radio" aria-checked="${k === d.accent}" aria-label="Kleur ${k.slice(1)}" data-ad="acc" data-k="${k}" style="--c:${PG.ACCENTS[k]}"></button>`).join('')}</div>
    <p class="pg-lab">Speelvormen</p><div class="pg-chips">${MODES.map(m => `<button data-ad="mode" data-m="${esc(m)}" aria-pressed="${d.modes.includes(m)}">${esc(m)}</button>`).join('')}</div>
    <label class="pg-check"><input type="checkbox" id="pg-ainv" ${d.invite ? 'checked' : ''} ${d.canInvite ? '' : 'disabled'}> Uitnodigen via PomGames</label>
    <p class="pg-fine">${d.canInvite ? 'Spelers kunnen elkaar voor deze game uitnodigen; hij start dan meteen met de goede code.'
      : 'Deze game kan nog niet vanzelf starten met een uitnodiging. Online spelen kan wel met een code in de game zelf.'}</p>
    <p class="pg-lab">Zo ziet hij eruit in de lijst</p><div id="pg-aprev"></div>
    <p class="pg-err" id="pg-aerr" role="alert"></p>
    <button class="pg-btn sec" data-ad="try">Probeer uit</button>
    <button class="pg-btn pri" data-ad="publish">Publiceren</button>
    <button class="pg-btn ghost" data-ad="list">Annuleren</button>`;
}
function readForm() {
  if (!draft || view !== 'form') return;
  draft.name = $('pg-aname').value.trim().slice(0, 30);
  draft.tagline = $('pg-atag').value.trim().slice(0, 120);
  if (!draft.updateId) draft.id = slug($('pg-aid').value);
  draft.invite = !!($('pg-ainv') && $('pg-ainv').checked && draft.canInvite);
}
function meta() { return { id: draft.id, name: draft.name || draft.id, tagline: draft.tagline, accent: draft.accent, modes: draft.modes.slice(), invite: draft.invite, aware: draft.aware }; }
function renderPreview() {
  const el = $('pg-aprev'); if (!el || !draft) return;
  readForm();
  const g = PG.importedDef(draft.id || 'game', meta());
  el.innerHTML = `<div class="pg-game" style="--acc:${g.accent}">${PG.thumbOf(g)}<span class="pg-gtxt"><span class="pg-gname">${esc(g.name)}</span><span class="pg-gtag">${esc(g.tagline)}</span>
    <span class="pg-modes">${g.modes.map(m => `<span>${esc(m)}</span>`).join('')}</span></span></div>`;
}
function check() {
  readForm();
  const err = $('pg-aerr');
  if (!draft.name) { err.textContent = 'Geef de game een naam.'; return false; }
  if (!ID_RE.test(draft.id)) { err.textContent = 'De code moet 2 tot 24 kleine letters of cijfers zijn.'; return false; }
  err.textContent = ''; return true;
}
function tryOut() {
  if (!check()) return;
  const g = PG.importedDef(draft.id, meta());
  g.previewHtml = draft.html; g.version = 0; g.name = draft.name + ' (proef)';
  Log.add('admin', 'proef ' + draft.id);
  PG.open(draft.id, { preview: g });
}
async function publish() {
  if (busy || !check()) return;
  const builtin = PG.byId[draft.id] && !(PG.def(draft.id) || {}).imported;
  if (builtin && !draft.confirmed) {
    PG.ui.openSheet(`<h3>${esc(PG.byId[draft.id].name)} vervangen?</h3><p class="pg-sub">De ingebouwde versie wordt voor iedereen vervangen door dit bestand. Terugzetten kan altijd via Games beheren.</p>
      <button class="pg-btn pri" data-ad="publishyes">Vervangen en publiceren</button><button class="pg-btn ghost" data-pg="sheetclose">Annuleren</button>`);
    return;
  }
  busy = true;
  const btn = document.querySelector('[data-ad="publish"]'); if (btn) { btn.disabled = true; btn.textContent = 'Publiceren…'; }
  try {
    const v = await B.publishGame(meta(), draft.html);
    toast(`${draft.name} versie ${v} staat online`, 3500);
    PG.ui.beep('invite');
    view = 'list'; draft = null; render();
  } catch (e) {
    Log.add('err', 'publiceren: ' + (e.code || e.message));
    const err = $('pg-aerr');
    if (err) err.textContent = e.code === 'permission-denied' ? 'Geen toestemming. Staat jouw naam als beheerder in de Firestore-regels? (handleiding, stap 5)' : 'Publiceren lukte niet: ' + (e.code || e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Publiceren'; }
  }
  busy = false;
}
function askDelete(id) {
  const g = PG.def(id), builtin = !!PG.byId[id];
  PG.ui.openSheet(`<h3>${builtin ? 'Terug naar de ingebouwde ' + esc(PG.byId[id].name) + '?' : esc(g.name) + ' verwijderen?'}</h3>
    <p class="pg-sub">${builtin ? 'De geïmporteerde versie verdwijnt; iedereen krijgt weer de versie uit de app.' : 'De game verdwijnt voor iedereen uit de lijst. Je kunt hem later opnieuw importeren.'}</p>
    <button class="pg-btn pri" data-ad="delyes" data-id="${esc(id)}">${builtin ? 'Terugzetten' : 'Verwijderen'}</button><button class="pg-btn ghost" data-pg="sheetclose">Annuleren</button>`);
}

const ACT = {
  close: () => close(),
  list: () => { view = 'list'; draft = null; render(); },
  new: () => { draft = null; view = 'source'; render(); },
  update: el => { draft = { updateId: el.dataset.id }; view = 'source'; render(); },
  fetch: () => fromUrl(),
  hide: async el => {
    try { await B.setGameFlags(el.dataset.id, { hidden: el.dataset.v === '1' }); toast(el.dataset.v === '1' ? 'Verborgen voor iedereen' : 'Weer zichtbaar'); }
    catch (e) { toast('Lukte niet: ' + (e.code || e.message), 3500); }
  },
  del: el => askDelete(el.dataset.id),
  delyes: async el => { PG.ui.closeSheet(); try { await B.deleteGame(el.dataset.id); toast('Klaar'); } catch (e) { toast('Lukte niet: ' + (e.code || e.message), 3500); } },
  acc: el => { draft.accent = el.dataset.k; document.querySelectorAll('.pg-swatches button').forEach(b => b.setAttribute('aria-checked', String(b === el))); renderPreview(); },
  mode: el => { const m = el.dataset.m, i = draft.modes.indexOf(m); if (i >= 0) draft.modes.splice(i, 1); else draft.modes = MODES.filter(x => x === m || draft.modes.includes(x)); el.setAttribute('aria-pressed', String(i < 0)); renderPreview(); },
  try: () => tryOut(),
  publish: () => publish(),
  publishyes: () => { PG.ui.closeSheet(); if (draft) { draft.confirmed = true; publish(); } }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-ad]');
  if (!el) return;
  const f = ACT[el.dataset.ad]; if (f) { e.preventDefault(); f(el); }
});
document.addEventListener('change', e => { if (e.target.id === 'pg-afile') fromFile(e.target.files && e.target.files[0]); });
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#pg-abody') && view === 'form') renderPreview(); });
const obs = new MutationObserver(() => { if (view === 'form') renderPreview(); });
obs.observe(document.getElementById('pg-abody'), { childList: true });

PG.admin = { open, close, refresh };
})();
