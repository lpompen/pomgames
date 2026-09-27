import asyncio, os
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, 'uit'), exist_ok=True)
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/index.html?mock=1&net=bc&test=1'
SHOT = os.path.join(HERE, 'uit') + '/'
log = []
def say(*a): print(*a, flush=True); log.append(' '.join(map(str, a)))

async def signup(p, name, click=False):
    await p.wait_for_selector('#pg-auth.on')
    if click: await p.click('#pg-authseg [data-mode="signup"]')
    await p.fill('#pg-name', name); await p.fill('#pg-pass', 'geheim1'); await p.fill('#pg-pass2', 'geheim1')
    await p.click('#pg-authgo'); await p.wait_for_selector('#pg-home.on')

async def menu_exit(p):
    if await p.is_visible('#ov.on [data-a="view"]'): await p.click('#ov.on [data-a="view"]')
    if not await p.is_visible('#ov.on'): await p.click('[data-a="menu"]')
    await p.click('[data-a="pg"]'); await p.wait_for_selector('#pg-home.on')

async def games(p): return await p.eval_on_selector_all('#pg-list .pg-gname', 'e => e.map(x => x.textContent)')

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        ctx = await br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        errs = []
        a = await ctx.new_page(); b = await ctx.new_page()
        for nm, p in (('A', a), ('B', b)):
            p.on('pageerror', lambda e, nm=nm: errs.append(f'{nm} pageerror {e}'))
        await a.goto(URL); await a.evaluate('localStorage.clear()'); await a.reload()
        await signup(a, 'Sam'); await b.goto(URL); await signup(b, 'Pom', True)
        say('lijst A:', await games(a))
        await a.screenshot(path=SHOT + 'b1-lijst.png', full_page=True)

        # ---- Bommenduel tegen de computer
        await a.click('[data-id="bommenduel"]'); await a.wait_for_selector('#ov.on')
        say('bommenduel start:', await a.eval_on_selector_all('#panel button', 'e => e.map(x => x.textContent.trim())'))
        await a.click('[data-a="bot"]'); await a.click('[data-a="botgo"][data-level="1"]')
        await asyncio.sleep(3.5)
        say('bommenduel bot-spel loopt:', await a.evaluate('() => !!(window.__bm && window.__bm.G) && window.__bm.ui'))
        await a.screenshot(path=SHOT + 'b2-bommen-bot.png')
        await a.click('[data-a="menu"]'); await a.click('[data-a="pg"]'); await a.wait_for_selector('#pg-home.on')
        say('na sluiten: stage leeg', await a.evaluate('document.getElementById("pg-stage").children.length === 0'))

        # ---- Bommenduel online via uitnodiging (B nodigt A uit)
        await b.click('.pg-tabbar [data-tab="players"]'); await b.click('#pg-players [data-pg="player"]')
        await b.click('[data-pg="invitepick"]')
        say('uitnodig-keuze:', await b.eval_on_selector_all('[data-pg="invite"] > b', 'e => e.map(x => x.textContent)'))
        await b.click('[data-pg="invite"][data-game="bommenduel"]')
        await b.wait_for_selector('#ov.on .bigcode')
        await a.wait_for_selector('#pg-banner.on'); await a.click('#pg-banner [data-pg="bact"]')
        await b.wait_for_selector('[data-a="start"][data-mode="duel"]', timeout=8000)
        await b.click('[data-a="start"][data-mode="duel"]')
        await asyncio.sleep(3)
        sa = await a.evaluate('() => window.__bm && window.__bm.G && window.__bm.G.kind'); sb = await b.evaluate('() => window.__bm && window.__bm.G && window.__bm.G.kind')
        say('online bommenduel: A', sa, 'B', sb)
        await a.screenshot(path=SHOT + 'b3-bommen-online.png')
        await menu_exit(a); await menu_exit(b)

        # ---- Beheer: A is beheerder
        await a.click('#pg-mebtn'); await asyncio.sleep(0.2)
        say('profiel A knoppen:', await a.eval_on_selector_all('#pg-sheetbox button', 'e => e.map(x => x.textContent.trim())'))
        await a.click('[data-pg="admin"]'); await a.wait_for_selector('#pg-admin.on')
        await a.screenshot(path=SHOT + 'b4-beheer.png')
        await b.click('#pg-mebtn'); await asyncio.sleep(0.2)
        say('profiel B (geen beheerder):', await b.eval_on_selector_all('#pg-sheetbox button', 'e => e.map(x => x.textContent.trim())'))
        await b.click('[data-pg="sheetclose"]')

        # import 1: onbewerkte Bommenduel-artifact als 'bomtest'
        await a.click('[data-ad="new"]')
        await a.set_input_files('#pg-afile', os.path.join(HERE, '..', 'src', 'bommenduel.html'))
        await a.wait_for_selector('#pg-aname')
        say('import-form: naam', await a.input_value('#pg-aname'), 'code', await a.input_value('#pg-aid'), '| uitnodigen mogelijk:', not await a.is_disabled('#pg-ainv'))
        await a.fill('#pg-aid', 'bomtest'); await a.fill('#pg-aname', 'Bommen (import)')
        await a.screenshot(path=SHOT + 'b5-importform.png', full_page=True)
        await a.click('[data-ad="publish"]'); await asyncio.sleep(0.5)
        # import 2: PomGames-bewust testspel
        await a.click('[data-ad="new"]'); await a.set_input_files('#pg-afile', os.path.join(HERE, 'files', 'testspel.html'))
        await a.wait_for_selector('#pg-aname')
        say('testspel: uitnodigen mogelijk:', not await a.is_disabled('#pg-ainv'))
        await a.click('[data-ad="try"]'); await a.wait_for_selector('.pg-fbox iframe')
        await asyncio.sleep(0.5)
        say('proef:', await a.frame_locator('.pg-fbox iframe').locator('#who').inner_text())
        await a.frame_locator('.pg-fbox iframe').locator('#x').click(); await asyncio.sleep(0.3)
        say('na proef terug in formulier:', await a.is_visible('#pg-aname'))
        await a.click('[data-ad="publish"]'); await asyncio.sleep(0.5)
        say('beheerlijst:', await a.eval_on_selector_all('.pg-arow .pg-rtxt', 'e => e.map(x => x.innerText.replace(/\\n/g, " / "))'))

        # B ziet de nieuwe games
        await b.click('.pg-tabbar [data-tab="games"]'); await asyncio.sleep(0.4)
        say('lijst B:', await games(b))
        await b.screenshot(path=SHOT + 'b6-lijst-B.png', full_page=True)
        # B opent de onbewerkte import (met balk)
        await b.click('[data-id="bomtest"]'); await b.wait_for_selector('.pg-fbox iframe'); await asyncio.sleep(1.5)
        say('bomtest balk zichtbaar:', await b.is_visible('.pg-fbar'), '| game-scherm:', (await b.frame_locator('.pg-fbox iframe').locator('#panel').inner_text())[:60].replace('\n', ' '))
        await b.frame_locator('.pg-fbox iframe').locator('[data-a="bot"]').click()
        await b.frame_locator('.pg-fbox iframe').locator('[data-a="botgo"][data-level="0"]').click()
        await asyncio.sleep(2)
        await b.screenshot(path=SHOT + 'b7-import-iframe.png')
        await b.click('.pg-fback'); await b.wait_for_selector('#pg-home.on')
        # B nodigt A uit voor het testspel
        await b.click('.pg-tabbar [data-tab="players"]'); await b.click('#pg-players [data-pg="player"]'); await b.click('[data-pg="invitepick"]')
        say('uitnodig-keuze na import:', await b.eval_on_selector_all('[data-pg="invite"] > b', 'e => e.map(x => x.textContent)'))
        await b.click('[data-pg="invite"][data-game="testspel"]'); await b.wait_for_selector('.pg-fbox iframe'); await asyncio.sleep(0.5)
        say('B (maker):', await b.frame_locator('.pg-fbox iframe').locator('#q').inner_text(), '|', await b.frame_locator('.pg-fbox iframe').locator('#who').inner_text())
        try:
            await a.wait_for_selector('#pg-banner.on', timeout=5000)
        except Exception as e:
            say('GEEN BANNER. fouten:', errs); say('A log:', (await a.evaluate('() => PG.Log.text()')).split('\n')[-12:])
            say('A chats:', await a.evaluate('() => document.getElementById("pg-chats").innerText'))
            say('A banner html:', await a.evaluate('() => document.getElementById("pg-banner").outerHTML.slice(0, 300)')); raise
        say('A banner:', (await a.inner_text('#pg-banner')).replace('\n', ' | '))
        await a.click('#pg-banner [data-pg="bact"]'); await a.wait_for_selector('.pg-fbox iframe'); await asyncio.sleep(0.5)
        say('A (gast):', await a.frame_locator('.pg-fbox iframe').locator('#q').inner_text(), '|', await a.frame_locator('.pg-fbox iframe').locator('#who').inner_text())
        say('A balk verborgen (bewuste game):', not await a.is_visible('.pg-fbar'))
        await a.frame_locator('.pg-fbox iframe').locator('#x').click(); await a.wait_for_selector('#pg-admin.on')
        say('A na spel terug in beheer:', await a.is_visible('#pg-abody'))
        await a.click('[data-ad="close"]'); await a.wait_for_selector('#pg-home.on')
        await b.frame_locator('.pg-fbox iframe').locator('#x').click(); await b.wait_for_selector('#pg-home.on')

        # nieuwe versie, verbergen, verwijderen
        await a.click('#pg-mebtn'); await a.click('[data-pg="admin"]')
        await a.click('[data-ad="update"][data-id="testspel"]'); await a.set_input_files('#pg-afile', os.path.join(HERE, 'files', 'testspel2.html'))
        await a.wait_for_selector('#pg-aname'); say('update: code vast:', await a.is_disabled('#pg-aid'))
        await a.click('[data-ad="publish"]'); await asyncio.sleep(0.4)
        await a.click('[data-ad="hide"][data-id="mijnenduel"]'); await asyncio.sleep(0.3)
        await a.click('[data-ad="del"][data-id="bomtest"]'); await a.click('[data-ad="delyes"]'); await asyncio.sleep(0.4)
        await b.click('.pg-tabbar [data-tab="games"]'); await asyncio.sleep(0.3)
        say('lijst B na beheer:', await games(b))
        await b.click('[data-id="testspel"]'); await b.wait_for_selector('.pg-fbox iframe'); await asyncio.sleep(0.4)
        say('B ziet versie:', await b.frame_locator('.pg-fbox iframe').locator('#h').inner_text())
        await b.frame_locator('.pg-fbox iframe').locator('#x').click(); await b.wait_for_selector('#pg-home.on')
        # deellink via 404-route simuleren: ?g=testspel&join=ABCD
        await b.goto('http://localhost:8765/index.html?mock=1&g=testspel&join=ABCD'); await b.wait_for_selector('.pg-fbox iframe', timeout=8000); await asyncio.sleep(0.4)
        say('deeplink import:', await b.frame_locator('.pg-fbox iframe').locator('#q').inner_text())
        await b.frame_locator('.pg-fbox iframe').locator('#x').click()
        await a.screenshot(path=SHOT + 'b8-beheer-na.png', full_page=True)
        for nm, p in (('A', a), ('B', b)):
            t = await p.evaluate('() => PG.Log.text()')
            bad = [l for l in t.split('\n') if ' err ' in l]
            say(f'log {nm}: fouten {len(bad)}'); [say('   ', l) for l in bad[:8]]
            open(SHOT + f'log2-{nm}.txt', 'w').write(t)
        say('pagina-fouten:', errs or 'geen')
        await br.close()
    open(SHOT + 'testlog2.txt', 'w').write('\n'.join(log))
asyncio.run(main())
