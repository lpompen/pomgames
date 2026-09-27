import asyncio, os
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, 'uit'), exist_ok=True), json, sys, time
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/index.html?mock=1&net=bc&test=1'
SHOT = os.path.join(HERE, 'uit') + '/'
log = []
def say(*a): print(*a, flush=True); log.append(' '.join(map(str, a)))

async def signup(p, name, mode_click=False):
    await p.wait_for_selector('#pg-auth.on', timeout=5000)
    if mode_click: await p.click('#pg-authseg [data-mode="signup"]')
    await p.fill('#pg-name', name); await p.fill('#pg-pass', 'geheim1'); await p.fill('#pg-pass2', 'geheim1')
    await p.click('#pg-authgo')
    await p.wait_for_selector('#pg-home.on', timeout=5000)
    say('account', name, 'ok')

async def open_menu(p):
    if await p.is_visible('#ov.on [data-a="view"]'): await p.click('#ov.on [data-a="view"]')
    if not await p.is_visible('#ov.on'): await p.click('[data-a="menu"]')
    await p.wait_for_selector('#ov.on')

async def play_online(a, b):
    for i in range(400):
        done = 0
        for p in (a, b):
            r = await p.evaluate("""() => { const t = window.__td; if (!t || !t.G) return 'nog'; const G = t.G, st = G.view().st;
              if (st.done) return 'klaar';
              if (!G.canInteract()) return 'wacht';
              const ms = t.legalMoves(st); const pref = ms.filter(m => m[2] < 5); const m = (pref.length ? pref : ms)[Math.floor(Math.random() * (pref.length ? pref.length : ms.length))];
              return G.play(m) ? 'zet' : 'fout'; }""")
            if r == 'klaar': done += 1
            if r == 'fout': say('FOUT: zet geweigerd')
        if done == 2: return i
        await asyncio.sleep(0.03)
    return -1

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(executable_path=None)
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        errs = []
        a = await ctx.new_page(); b = await ctx.new_page()
        for nm, p in (('A', a), ('B', b)):
            p.on('pageerror', lambda e, nm=nm: errs.append(f'{nm} pageerror {e}'))
            p.on('console', lambda m, nm=nm: errs.append(f'{nm} console.{m.type} {m.text}') if m.type == 'error' and 'fonts' not in m.text and 'ERR_' not in m.text else None)
        await a.goto(URL); await signup(a, 'Sam')
        await a.screenshot(path=SHOT + '1-hub.png')
        await b.goto(URL); await signup(b, 'Pom', mode_click=True)
        # B: spelers -> Sam -> bericht
        await b.click('.pg-tabbar [data-tab="players"]')
        await b.wait_for_selector('#pg-players [data-pg="player"]')
        await b.screenshot(path=SHOT + '2-spelers.png')
        await b.click('#pg-players [data-pg="player"]')
        await b.click('[data-pg="chatwith"]')
        await b.wait_for_selector('#pg-chat.on')
        await b.fill('#pg-input', 'Hoi Sam! Zin in een potje?'); await b.click('[data-pg="send"]')
        await a.wait_for_selector('#pg-banner.on', timeout=4000)
        say('A banner:', (await a.inner_text('#pg-banner')).replace('\n', ' | '))
        say('screenshot 3...'); await a.screenshot(path=SHOT + '3-banner.png', timeout=8000); say('screenshot 3 ok')
        await a.bring_to_front()
        await a.click('#pg-banner [data-pg="bact"]', timeout=5000)
        await asyncio.sleep(0.6)
        say('A na klik:', await a.evaluate("document.getElementById('pg-chat').className + ' | ' + PG.Log.text().split('\\n').slice(-5).join(' / ')"))
        await a.wait_for_selector('#pg-chat.on', timeout=3000)
        say('A chat-state:', await a.evaluate('''() => { const i=document.getElementById('pg-input'); const r=i.getBoundingClientRect(); return [document.getElementById('pg-chat').className, getComputedStyle(document.getElementById('pg-chat')).display, r.y, r.height, document.body.className, document.querySelectorAll('#pg-input').length] }'''))
        await a.screenshot(path=SHOT + '3b-chatA.png')
        await a.fill('#pg-input', 'Ja leuk!'); await a.keyboard.press('Enter')
        await asyncio.sleep(0.3)
        await b.screenshot(path=SHOT + '4-chat.png')
        # B nodigt uit voor Tegelduel
        await b.click('[data-pg="chatinvite"]'); await b.click('[data-pg="invite"][data-game="tegelduel"]')
        await b.wait_for_selector('#pg-stage #app', timeout=4000)
        await b.wait_for_selector('#ov.on .bigcode')
        say('B wacht, code', await b.inner_text('.bigcode'), '| knoppen:', await b.eval_on_selector_all('#panel button', 'e => e.map(x => x.textContent)'))
        await a.wait_for_selector('#pg-banner.on', timeout=4000)
        say('A banner:', (await a.inner_text('#pg-banner')).replace('\n', ' | '))
        await a.click('#pg-banner [data-pg="bact"]')
        await a.wait_for_selector('#pg-stage #app', timeout=4000)
        await b.wait_for_selector('[data-a="start"]', timeout=6000)
        say('lobby ok, B start')
        await b.click('[data-a="start"]')
        await a.wait_for_function('() => window.__td && window.__td.G && window.__td.G.kind === "online"', timeout=5000)
        await asyncio.sleep(0.4)
        await a.screenshot(path=SHOT + '5-tegelduel.png')
        # handmatig: tik tegel en rij
        n = await play_online(a, b)
        say('online spel klaar na', n, 'rondes van de lus')
        sa = await a.evaluate('() => window.__td.G.view().st.pl.map(p => p.score)')
        sb = await b.evaluate('() => window.__td.G.view().st.pl.map(p => p.score)')
        say('scores A', sa, 'B', sb, 'GELIJK' if sa == sb else 'VERSCHIL!')
        await asyncio.sleep(1.8)
        await a.screenshot(path=SHOT + '6-uitslag.png')
        # buzz vanuit het spel (B -> Sam)
        await open_menu(b)
        say('B menu:', await b.eval_on_selector_all('#panel button', 'e => e.map(x => x.textContent.trim())'))
        await b.click('[data-a="pgbuzz"]')
        await a.wait_for_selector('#pg-banner.buzz.on', timeout=4000)
        say('A buzz banner:', (await a.inner_text('#pg-banner')).replace('\n', ' | '))
        await a.screenshot(path=SHOT + '7-buzz.png')
        # A terug naar hub
        await a.click('#pg-banner [data-pg="bclose"]')
        await open_menu(a)
        await a.click('[data-a="pg"]')
        await a.wait_for_selector('#pg-home.on'); say('A terug in hub, stage leeg:', await a.evaluate('() => document.getElementById("pg-stage").children.length === 0'))
        # Blokduel en Mijnenduel openen en sluiten
        await a.click('.pg-tabbar [data-tab="games"]')
        for gid in ('blokduel', 'mijnenduel'):
            await a.click(f'[data-pg="open"][data-id="{gid}"]'); await asyncio.sleep(0.5)
            await a.screenshot(path=SHOT + f'8-{gid}.png')
            btns = await a.eval_on_selector_all('#panel button', 'e => e.map(x => x.textContent.trim())')
            say(gid, 'startknoppen:', btns)
            await a.click('[data-a="pg"]'); await a.wait_for_selector('#pg-home.on')
        # Tegelduel tegen de computer: een paar zetten
        await a.click('[data-pg="open"][data-id="tegelduel"]'); await a.click('[data-a="bot"]'); await a.click('[data-a="botgo"][data-level="slim"]')
        await asyncio.sleep(0.3)
        for k in range(6):
            await a.wait_for_function('() => window.__td.G.canInteract() || window.__td.G.view().st.done', timeout=6000)
            await a.click('#facs button.t, #pool button.t'); await asyncio.sleep(0.1)
            ok = await a.eval_on_selector_all('#myBoard button.ln.ok', 'e => e.length')
            await (a.click('#myBoard button.ln.ok') if ok else a.click('#floor'))
            await asyncio.sleep(0.1)
        await a.screenshot(path=SHOT + '9-bot.png')
        say('bot-spel: zetten', await a.evaluate('() => window.__td.G.view().k'))
        # profiel
        await open_menu(a); await a.click('[data-a="pg"]'); await a.wait_for_selector('#pg-home.on')
        await a.click('#pg-mebtn'); await asyncio.sleep(0.2); await a.screenshot(path=SHOT + '10-profiel.png'); await a.click('[data-pg="sheetclose"]')
        for nm, p in (('A', a), ('B', b)):
            t = await p.evaluate('() => PG.Log.text()')
            bad = [l for l in t.split('\n') if ' err ' in l]
            say(f'log {nm}: {len(t.splitlines())} regels, fouten: {len(bad)}'); [say('   ', l) for l in bad[:10]]
            open(SHOT + f'log-{nm}.txt', 'w').write(t)
        say('pagina-fouten:', errs if errs else 'geen')
        # uitloggen
        await a.click('#pg-mebtn'); await a.click('[data-pg="logout"]'); await a.click('[data-pg="logoutyes"]')
        await a.wait_for_selector('#pg-auth.on'); say('uitloggen ok, loginmodus:', await a.inner_text('#pg-authgo'))
        await br.close()
    open(SHOT + 'testlog.txt', 'w').write('\n'.join(log))
asyncio.run(main())
