# PomGames (voor Claude Code)

PomGames is een webapp (PWA) op GitHub Pages met Blokduel, Mijnenduel, Tegelduel en Bommenduel, plus accounts, spelerslijst, berichten, uitnodigingen, buzzers en pushmeldingen via Firebase. De beheerder kan in de app zelf games importeren (Games beheren).

- **Eerste keer installeren:** volg `OPDRACHT-CLAUDE-CODE.md` van begin tot eind.
- **Status en gegevens** (project-ID, adres, beheerder): `DEPLOY.md` (maak je in de opdracht aan).
- **Log:** houd bij elke run `setup-log.txt` bij (commando's, resultaat, geen geheimen). Zegt de gebruiker "log", lees dan dat bestand en de log die hij uit de app plakt, en geef feedback.
- **Taal:** praat Nederlands met de gebruiker, kort. Hij wil zo min mogelijk zelf doen; vraag alleen iets bij de stoppunten uit de opdracht.
- **Nooit** zelf betaalgegevens invoeren of een abonnement afsluiten.

## Mappen

| Pad | Wat |
|---|---|
| `index.html`, `404.html` | De app (gebouwd uit `bron/`, niet met de hand wijzigen als je `bron/` gebruikt) |
| `config.js` | Firebase-gegevens en `vapidKey` (niet geheim) |
| `sw.js`, `manifest.webmanifest`, `icons/` | App-schil; bij wijziging van `sw.js` de cachenaam `pomgames-v1` ophogen |
| `firebase/` | `firestore.rules` (beheerder bij `isAdmin`), `firebase.json`, `functions/` (pushmeldingen, Node 22, regio europe-west1) |
| `bron/` | Broncode: `build.py` bouwt `index.html`; `core.js`, `backend.js`, `social.js`, `admin.js`, `hub.css`; Tegelduel in `td.*`; de andere games in `src/` |
| `bron/test/` | Playwright-tests (`e2e.py`, `e2e2.py`) tegen `python3 -m http.server 8765` in deze map, met `?mock=1&net=bc` |
| `HANDLEIDING.md`, `GAMES.md` | Uitleg voor mensen; `GAMES.md` beschrijft hoe een nieuwe game samenwerkt met PomGames |

## Vaste commando's

- Bouwen: `python3 bron/build.py`
- Testen: `python3 -m http.server 8765 &` en dan `python3 bron/test/e2e.py && python3 bron/test/e2e2.py`
- Publiceren van de app: `git add -A && git commit -m "…" && git push`
- Regels en pushfunctie: `cd firebase && npx -y firebase-tools@latest deploy --only firestore:rules,functions --project <PROJECT>`
