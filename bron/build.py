#!/usr/bin/env python3
"""Bouwt PomGames: haalt Blokduel en Mijnenduel uit hun losse bestanden, past ze aan
voor de hub, voegt Tegelduel toe en zet alles in één index.html."""
import re, sys, os, json

ROOT = os.path.dirname(os.path.abspath(__file__))
# In de repository staat dit script in bron/ en schrijft het naar de hoofdmap; hier in de werkmap naar out/pomgames.
OUT = os.environ.get('PG_OUT') or (os.path.dirname(ROOT) if os.path.basename(ROOT) == 'bron' else os.path.join(ROOT, 'out', 'pomgames'))
VERSION = '1.1.0'
LOG = []

def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()

def between(s, a, b, start=0):
    i = s.index(a, start) + len(a); j = s.index(b, i); return s[i:j]

def rep(s, old, new, count=1, label=''):
    return rep0(s, old, new, count, label)

def rep0(s, old, new, count=1, label=''):
    n = s.count(old)
    if n != count:
        raise SystemExit(f'PATCH MISLUKT [{label}]: verwacht {count}x, gevonden {n}x: {old[:80]!r}')
    LOG.append(f'ok  {label}')
    return s.replace(old, new)

ENV = "'use strict';\nconst { document, addEventListener, removeEventListener, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver } = HUB.env;\n"

def extract(path):
    s = rd(path)
    css = between(s, '<style>', '</style>')
    body = between(s, '<body>', '<script>')
    js = between(s, "<script>\n(() => {\n'use strict';\n", "\n})();\n</script>")
    return css, body.strip(), js

def patch_common(js, name, tag, testvar, H='ctx', end='/* ---------------- ENGINE ---------------- */'):
    def rep(s, old, new, count=1, label=''):
        return rep0(s, old, new.replace('ctx.', H + '.'), count, label)
    # log: gedeeld met PomGames
    i = js.index('/* ---------------- LOG van de laatste run ---------------- */')
    j = js.index(end)
    js = js[:i] + ("/* ---------------- LOG: gedeeld met PomGames ---------------- */\nconst Log = " + H + ".log;\n"
                   "Log.add('info', `start v${VERSION} omgeving=${FORCE_BC ? 'test' : IN_CLAUDE ? 'claude' : 'web'}`);\n\n") + js[j:]
    LOG.append(f'ok  {tag}: log vervangen')
    js = rep(js, "const params = new URLSearchParams(location.search);", "const params = ctx.params;", label=f'{tag}: params')
    js = rep(js, "  const room = await roomP;", "  const room = await ctx.room();", label=f'{tag}: kamer')
    js = rep(js, f"  del(k) {{ try {{ localStorage.removeItem('{name}.' + k); }} catch (e) {{}} }}\n}};\n",
             f"  del(k) {{ try {{ localStorage.removeItem('{name}.' + k); }} catch (e) {{}} }}\n}};\nif (ctx.playerName) ls.set('nick', String(ctx.playerName).slice(0, 14));\n", label=f'{tag}: naam van account')
    js = rep(js, "cleanNick(($('#nick') && $('#nick').value) || ls.get('nick', ''))",
             "cleanNick(($('#nick') && $('#nick').value) || ctx.playerName || ls.get('nick', ''))", label=f'{tag}: nick bij verbinden')
    js = rep(js, "cleanNick(Net.opp.nick)) || 'Tegenstander';", "cleanNick(Net.opp.nick)) || (ctx.opponent && ctx.opponent.name) || 'Tegenstander';", label=f'{tag}: naam tegenstander')
    js = rep(js, "value=\"${esc(ls.get('nick', ''))}\"", "value=\"${esc(ls.get('nick', '') || ctx.playerName || '')}\"", label=f'{tag}: naamveld')
    # menu, start en wachten
    js = rep(js, """    <button class="btn ghost" data-a="home">${online ? 'Stoppen en naar start' : 'Naar start'}</button>""",
             """    ${ctx.extraButtons('menu')}\n    <button class="btn ghost" data-a="home">${online ? 'Stoppen en naar start' : 'Naar start'}</button>""", label=f'{tag}: menu')
    h = js.index('function showHome()'); e = js.index("`, 'home');\n}", h)
    js = js[:e] + "${" + H + ".extraButtons('home')}" + js[e:]
    LOG.append(f'ok  {tag}: startscherm-knoppen')
    js = rep(js, "<p>Laat de ander op <b>Doe mee</b> tikken en deze code invullen.</p>",
             "<p>${ctx.opponent ? esc(ctx.opponent.name) + ' krijgt een uitnodiging en komt er zo bij.' : 'Laat de ander op <b>Doe mee</b> tikken en deze code invullen.'}</p>", label=f'{tag}: wachttekst')
    js = rep(js, """${canShare ? '<button class="btn sec" data-a="share">Deel uitnodiging</button>' : ''}""",
             """${canShare && !ctx.opponent ? '<button class="btn sec" data-a="share">Deel uitnodiging</button>' : ''}""", label=f'{tag}: deelknop')
    js = rep(js, """<p class="status wait" id="netStatus">Wachten op tegenstander</p>""",
             """<p class="status wait" id="netStatus">Wachten op ${ctx.opponent ? esc(ctx.opponent.name) : 'tegenstander'}</p>${ctx.extraButtons('wait')}""", label=f'{tag}: wachten host')
    js = rep(js, """<p class="status wait" id="netStatus">Verbinden</p>""", """<p class="status wait" id="netStatus">Verbinden</p>${ctx.extraButtons('wait')}""", label=f'{tag}: wachten gast')
    js = rep(js, """    <button class="btn ghost" data-a="home">Naar start</button>`, 'neterr');""",
             """    ${ctx.extraButtons('wait')}\n    <button class="btn ghost" data-a="home">Naar start</button>`, 'neterr');""", label=f'{tag}: netfout')
    js = rep(js, "  home: () => showHome(),\n", "  home: () => showHome(),\n  pg: () => ctx.exit(),\n  pgbuzz: () => ctx.buzz(),\n", label=f'{tag}: acties')
    js = rep(js, "location.origin + location.pathname + '?join=' + Net.code", "ctx.shareUrl(Net.code)", label=f'{tag}: deellink')
    js = rep(js, "je tegenstander opent deze zelfde pagina (deel hem via de deelknop van Claude).", "je tegenstander opent PomGames en kiest deze game.", label=f'{tag}: tekst claude')
    js = rep(js, "'Werkt via internet en op dezelfde wifi. Deel de code of de uitnodigingslink.'", "'Werkt via internet. Deel de code, of nodig iemand uit via Spelers in PomGames.'", label=f'{tag}: tekst web')
    js = rep(js, "const joinCode = cleanCode(params.get('join'));\nif (joinCode.length === 4) {",
             "const joinCode = cleanCode(params.get('join')), hostCode = cleanCode(params.get('host'));\nif (hostCode.length === 4) goOnline('h', hostCode);\nelse if (joinCode.length === 4) {", label=f'{tag}: uitnodiging starten')
    js = rep(js, "'peer-unavailable': `Geen spel gevonden met code ${Net.code}. Controleer de code, of laat de ander opnieuw een spel maken.`",
             "'peer-unavailable': `Geen spel gevonden met code ${Net.code}. Misschien heeft de ander het spel al gesloten. Vraag om een nieuwe uitnodiging.`", label=f'{tag}: foutmelding code')
    return js

def build_blok():
    css, body, js = extract('src/blokduel.html')
    js = patch_common(js, 'blokduel', 'bd', '__bd')
    js = rep(js, "      Log.add('game', `solo afgelopen: score=${st.score} zetten=${st.moves} lijnen=${st.lines}`);\n",
             "      Log.add('game', `solo afgelopen: score=${st.score} zetten=${st.moves} lijnen=${st.lines}`);\n      ctx.score({ mode: 'solo', points: st.score, moves: st.moves, lines: st.lines });\n", label='bd: score solo')
    js = rep(js, "  let title, rows = '', btns = ''; clearToast();\n", "  let title, rows = '', btns = ''; clearToast();\n  ctx.score({ mode: r.mode, result: r });\n", label='bd: score duel')
    js += "\nreturn {\n  unmount() {\n    try { leaveOnline(); } catch (e) {}\n    G = null;\n    if (AC) { try { AC.close(); } catch (e) {} AC = null; }\n    delete window.__bd;\n  }\n};"
    meta = dict(id='blokduel', short='bd', name='Blokduel', accent='var(--pg-k2)', tagline='Leg blokken en maak rijen vol. Alleen, of tegen elkaar met stenen als wapen.',
                modes=['Solo', 'Online', 'Samen'], thumb=dict(type='blocks', rows=['.5...', '.55.4', '...44', '22.4.', '33333']))
    return css, body, js, meta

def build_mijn():
    css, body, js = extract('src/mijnenduel.html')
    js = patch_common(js, 'mijnenduel', 'md', '__md')
    js = rep(js, "function showResult(r) {\n  lastResult = r;\n", "function showResult(r) {\n  lastResult = r;\n  ctx.score({ mode: r.kind, result: r });\n", label='md: score')
    js += "\nreturn {\n  unmount() {\n    try { leaveOnline(); } catch (e) {}\n    try { stopGame(); } catch (e) {}\n    if (AC) { try { AC.close(); } catch (e) {} AC = null; }\n    delete window.__md;\n  }\n};"
    meta = dict(id='mijnenduel', short='md', name='Mijnenduel', accent='var(--pg-k1)', tagline='Mijnenveger voor twee: wie vindt de meeste mijnen?',
                modes=['Tegen computer', 'Online', 'Samen'], thumb=dict(type='mines', rows=['hhfhh', 'h2111', 'g2000', 'h1011', 'h101h']))
    return css, body, js, meta

def build_bomb():
    css, body, js = extract('src/bommenduel.html')
    js = patch_common(js, 'bommenduel', 'bm', '__bm', H='hub', end='/* ---------------- REGELS & ARENA ---------------- */')
    js = rep(js, "function showMatchResult(r) {\n  clearToast();\n", "function showMatchResult(r) {\n  clearToast();\n  hub.score({ mode: r.mode, result: r });\n", label='bm: score')
    js += "\nreturn {\n  unmount() {\n    try { leaveOnline(); } catch (e) {}\n    try { stopGame(); } catch (e) {}\n    if (AC) { try { AC.close(); } catch (e) {} AC = null; }\n    delete window.__bm;\n  }\n};"
    meta = dict(id='bommenduel', short='bm', name='Bommenduel', accent='var(--pg-k7)', tagline='Leg bommen, blaas blokken op en blijf als laatste over.',
                modes=['Tegen computer', 'Online', 'Samen'], thumb=dict(type='bombs', rows=['x#+#x', '..+.r', '++o++', 'b.+..', 'x#.#x']), hub='hub')
    return css, body, js, meta

def build_tegel():
    meta = dict(id='tegelduel', short='td', name='Tegelduel', accent='var(--pg-k3)', tagline='Pak tegels, vul je rijen en bouw de mooiste muur.',
                modes=['Tegen computer', 'Online', 'Samen'], thumb=dict(type='tiles', rows=['x.x..', '.xxx.', '..xx.', 'x..x.', '.x.xx']))
    return rd('td.css'), rd('td.html').strip(), rd('td.js'), meta

def wrap(meta, js):
    H = meta.pop('hub', 'ctx')
    meta['builtin'] = True
    return f"PG.register(Object.assign({json.dumps(meta, ensure_ascii=False)}, {{\n  mount({H}) {{\n{ENV.replace('HUB', H)}{js}\n  }}\n}}));"

ICON = {
  'games': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 7h11a4 4 0 0 1 3.9 4.8l-1 5a2.6 2.6 0 0 1-4.5 1.2L14 16h-4l-1.9 2a2.6 2.6 0 0 1-4.5-1.2l-1-5A4 4 0 0 1 6.5 7z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".6" fill="currentColor"/><circle cx="17.5" cy="13" r=".6" fill="currentColor"/></svg>',
  'players': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.4"/></svg>',
  'chats': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  'back': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  'send': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4l.1 6.7L15 12 3.5 13.9z"/></svg>',
  'buzz': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4.5 8v8M1.8 10v4M19.5 8v8M22.2 10v4"/></svg>',
}
MONO = '<div class="pg-mono" aria-hidden="true"><span>P</span><span>G</span></div>'

SHELL = f"""<section id="pg-boot" class="pg-screen"><div class="pg-wrap">
  <header class="pg-brand">{MONO}<div><h1 class="pg-name">PomGames</h1></div></header>
  <p id="pg-bootmsg" class="pg-lead">Laden…</p>
</div></section>

<section id="pg-auth" class="pg-screen"><div class="pg-wrap">
  <header class="pg-brand">{MONO}<div><h1 class="pg-name">PomGames</h1><p class="pg-lead">Spelen, uitdagen en buzzen met je vrienden.</p></div></header>
  <div class="pg-seg" id="pg-authseg" role="group" aria-label="Account">
    <button type="button" data-pg="authmode" data-mode="signup" aria-pressed="true">Nieuw account</button>
    <button type="button" data-pg="authmode" data-mode="login" aria-pressed="false">Inloggen</button>
  </div>
  <form id="pg-authform" novalidate>
    <label class="pg-lab" for="pg-name">Gebruikersnaam</label>
    <input id="pg-name" class="pg-field" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="16">
    <label class="pg-lab" for="pg-pass">Wachtwoord</label>
    <input id="pg-pass" class="pg-field" type="password" autocomplete="new-password">
    <div id="pg-pass2wrap"><label class="pg-lab" for="pg-pass2">Herhaal wachtwoord</label><input id="pg-pass2" class="pg-field" type="password" autocomplete="new-password"></div>
    <p id="pg-signupnote" class="pg-fine" style="margin-top:12px">Je naam staat vast: die kun je later niet veranderen. Gebruik 3 tot 16 letters, cijfers of _. Er is geen 'wachtwoord vergeten', dus bewaar je wachtwoord goed.</p>
    <p id="pg-autherr" class="pg-err" role="alert"></p>
    <button id="pg-authgo" class="pg-btn pri" type="submit">Account maken</button>
  </form>
</div></section>

<section id="pg-home" class="pg-screen"><div class="pg-wrap">
  <header class="pg-top">
    <div class="pg-brand small">{MONO}<h1 class="pg-name">PomGames</h1></div>
    <button id="pg-mebtn" class="pg-me" data-pg="profile" hidden aria-label="Jouw profiel"></button>
  </header>
  <div id="pg-notice"></div>
  <div id="pg-tab-games"><h2 class="pg-h2">Kies een spel</h2><nav id="pg-list" class="pg-list" aria-label="Games"></nav></div>
  <div id="pg-tab-players" hidden><h2 class="pg-h2">Spelers</h2><div id="pg-players" class="pg-rows"></div></div>
  <div id="pg-tab-chats" hidden><h2 class="pg-h2">Berichten</h2><div id="pg-chats" class="pg-rows"></div></div>
  <footer class="pg-foot"><span>PomGames {VERSION}</span><button data-pg="copylog">Kopieer log</button></footer>
</div></section>

<nav class="pg-tabbar" aria-label="Hoofdmenu">
  <button data-pg="tab" data-tab="games" aria-current="page">{ICON['games']}Games</button>
  <button data-pg="tab" data-tab="players">{ICON['players']}Spelers</button>
  <button data-pg="tab" data-tab="chats">{ICON['chats']}Berichten<span class="pg-badge" id="pg-unread"></span></button>
</nav>

<section id="pg-chat" aria-label="Gesprek">
  <header class="pg-chead">
    <button class="pg-icon" data-pg="chatback" aria-label="Terug">{ICON['back']}</button>
    <span class="pg-rtxt" id="pg-chatname"></span>
    <button class="pg-icon" data-pg="chatinvite" aria-label="Nodig uit voor een game">{ICON['games']}</button>
    <button class="pg-icon" data-pg="buzz" aria-label="Buzz">{ICON['buzz']}</button>
  </header>
  <div class="pg-msgs" id="pg-msgs"></div>
  <div class="pg-compose"><input id="pg-input" class="pg-field" maxlength="500" placeholder="Typ een bericht" autocomplete="off" enterkeyhint="send" aria-label="Bericht"><button class="pg-icon" data-pg="send" aria-label="Versturen">{ICON['send']}</button></div>
</section>

<section id="pg-admin" aria-label="Games beheren">
  <header class="pg-chead"><button class="pg-icon" data-ad="close" aria-label="Terug">{ICON['back']}</button><span class="pg-rtxt"><b>Games beheren</b><span>Alleen zichtbaar voor de beheerder</span></span></header>
  <div class="pg-abody" id="pg-abody"></div>
</section>

<div id="pg-sheet"><div class="pg-sheet" id="pg-sheetbox" role="dialog" aria-modal="true"></div></div>
<div id="pg-banner" role="status" aria-live="polite"></div>
<div id="pg-toast" role="status" aria-live="polite"></div>
<div id="pg-stage"></div>
"""

PAGE404 = """<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PomGames</title>
<script>
/* Deellinks van games die in PomGames draaien zien eruit als .../spel/<game>/?join=CODE.
   GitHub Pages kent dat adres niet en toont deze pagina; die stuurt door naar PomGames. */
(function () {
  var p = location.pathname, i = p.indexOf('/spel/');
  if (i < 0) { location.replace(p.replace(/[^/]*$/, '') || '/'); return; }
  var base = p.slice(0, i + 1), id = p.slice(i + 6).split('/')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  var q = location.search.slice(1);
  location.replace(base + '?g=' + id + (q ? '&' + q : ''));
})();
</script></head><body style="background:#150F26;color:#F2EDFF;font-family:system-ui,sans-serif;text-align:center;padding:40px 16px">PomGames openen…</body></html>
"""

def main():
    parts = [build_blok(), build_mijn(), build_tegel(), build_bomb()]
    head_styles = ''.join(f'<style id="pgcss-{m["id"]}" media="not all">\n{css}\n</style>\n' for css, body, js, m in parts)
    templates = ''.join(f'<template id="pgtpl-{m["id"]}">\n{body}\n</template>\n' for css, body, js, m in parts)
    scripts = ''.join(f'<script>\n{wrap(m, js)}\n</script>\n' for css, body, js, m in parts)
    html = f"""<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="PomGames">
<meta name="theme-color" content="#150F26">
<meta name="description" content="PomGames: Blokduel, Mijnenduel en Tegelduel in één app. Speel samen, nodig uit en buzz je vrienden.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<title>PomGames</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=Rubik:wght@400;500;600;700&display=swap">
<style>
{rd('hub.css')}
</style>
{head_styles}</head>
<body>
{SHELL}
{templates}<script src="config.js"></script>
<script>
{rd('core.js')}
</script>
<script>
{rd('backend.js')}
</script>
<script>
{rd('social.js')}
</script>
<script>
{rd('admin.js')}
</script>
{scripts}<script>PG.boot();</script>
</body>
</html>
"""
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
    open(os.path.join(OUT, '404.html'), 'w', encoding='utf-8').write(PAGE404)
    print('\n'.join(LOG))
    print(f'index.html: {len(html)//1024} kB')

if __name__ == '__main__':
    main()
