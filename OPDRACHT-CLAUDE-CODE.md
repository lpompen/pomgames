# Opdracht voor Claude Code: PomGames online zetten

Je bent Claude Code. De gebruiker wil zelf zo min mogelijk doen. Voer deze opdracht van begin tot eind uit in deze map (de map met `index.html`). Praat Nederlands met de gebruiker, kort en duidelijk.

## Spelregels

- **Log.** Houd in `setup-log.txt` bij wat je doet: per stap het commando, of het lukte, en belangrijke uitkomsten (project-ID, adressen). Geen wachtwoorden of tokens erin. Zegt de gebruiker later "log", lees dan dit bestand en geef feedback.
- **Stoppunten.** Alleen bij de stappen met **STOP** vraag je iets aan de gebruiker. Bundel wat je nodig hebt in één vraag. Doe al het andere zelf.
- **Nooit** betaalgegevens invoeren of een betaalabonnement afsluiten; dat doet de gebruiker zelf (stap 6).
- **Hervatten.** Kijk bij de start in `setup-log.txt` en `DEPLOY.md`: wat al klaar is, sla je over.
- **Fouten.** Probeer een fout eerst zelf op te lossen (zie de tips per stap). Lukt het na twee pogingen niet, leg dan in één zin uit wat de gebruiker moet doen.
- Werk met de nieuwste Firebase-CLI: `npx -y firebase-tools@latest …` (hieronder kort `firebase`).

## Stap 0. Controleren en twee vragen

1. Controleer: `node -v` (minimaal 22), `git --version`, `gh --version`, `firebase --version`. Ontbreekt er iets, installeer het (Node LTS; GitHub CLI via de pakketbeheerder van het systeem; de Firebase-CLI via `npx`). `gcloud` is handig maar niet verplicht.
2. **STOP**, stel deze twee vragen in één bericht:
   - "Welke gebruikersnaam ga jij zelf kiezen in PomGames? (3 tot 16 letters, cijfers of _) Die naam wordt beheerder." Bewaar als `ADMIN` (in kleine letters).
   - "Mag het Firebase-project `pomgames-xxxxxx` heten (xxxxxx is willekeurig)?" Standaard ja. Bewaar als `PROJECT` (6 tot 30 tekens, kleine letters, cijfers en streepjes, wereldwijd uniek).

## Stap 1. Inloggen (STOP als het nodig is)

- `gh auth status`. Niet ingelogd: `gh auth login --web --git-protocol https` en laat de gebruiker de code in de browser bevestigen.
- `firebase login:list`. Niet ingelogd: `firebase login` (op een externe of cloudomgeving: `firebase login --no-localhost`, de gebruiker plakt de code terug).
- Als `gcloud` er is: `gcloud auth list`; zo nodig `gcloud auth login` (op afstand: `--no-launch-browser`). Alleen nodig voor stap 4b en de controles.

Zeg de gebruiker vooraf in één zin dat er één of twee keer een browservenster opent om in te loggen.

## Stap 2. GitHub: repository en Pages

```bash
GHUSER=$(gh api user -q .login)
git init -b main 2>/dev/null || true
git config user.name >/dev/null || git config user.name "$GHUSER"
git config user.email >/dev/null || git config user.email "$GHUSER@users.noreply.github.com"
git add -A && git commit -m "PomGames 1.1.0" || true
if gh repo view "$GHUSER/pomgames" >/dev/null 2>&1; then
  git remote add origin "https://github.com/$GHUSER/pomgames.git" 2>/dev/null || true
else
  gh repo create pomgames --public --source=. --remote=origin
fi
git push -u origin main
gh api -X POST "repos/$GHUSER/pomgames/pages" -f "source[branch]=main" -f "source[path]=/" || true
APP_URL=$(gh api "repos/$GHUSER/pomgames/pages" -q .html_url)
```

- Weigert `git push` omdat `pomgames` al bestaat met andere inhoud: **STOP**, vraag of je die repository mag overschrijven (`git push -f`), of gebruik de naam `pomgames-app` en pas de commando's en `APP_URL` aan.
- Wacht tot `curl -s -o /dev/null -w "%{http_code}" "$APP_URL"` 200 geeft (elke 20 s, maximaal 10 minuten).
- `APP_URL` eindigt op `/`. Het domein voor stap 4b is het hostdeel, bijvoorbeeld `naam.github.io`.

## Stap 3. Firebase-project en web-app

```bash
firebase projects:create "$PROJECT" --display-name "PomGames"
firebase apps:create WEB "PomGames" --project "$PROJECT" --json          # lees appId uit het resultaat
firebase apps:sdkconfig WEB "$APPID" --project "$PROJECT" --json         # lees de config (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)
```

- Vul die zes waarden in `config.js` in (laat `vapidKey` voorlopig leeg).
- Zet `PROJECT` in `firebase/.firebaserc` in plaats van `JOUW-PROJECT-ID`.
- Faalt `projects:create` omdat de voorwaarden nog niet geaccepteerd zijn: **STOP**, vraag de gebruiker één keer https://console.firebase.google.com te openen, de voorwaarden te accepteren en terug te komen. Is de ID bezet, kies een nieuwe willekeurige.

## Stap 4. Inloggen met wachtwoord, database en regels

a. **Inloggen met naam en wachtwoord.** `firebase/firebase.json` bevat al `"auth": {"providers": {"emailPassword": true}}`.
```bash
cd firebase && firebase deploy --only auth --project "$PROJECT"; cd ..
```
Lukt dat niet en is er `gcloud`: zet het aan via de Identity Toolkit (`PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired` met `{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}`, header `Authorization: Bearer $(gcloud auth print-access-token)` en `X-Goog-User-Project: $PROJECT`). Lukt ook dat niet: **STOP**, laat de gebruiker in de console bij Authentication → Aanmeldmethode "E-mailadres/wachtwoord" aanzetten (link: https://console.firebase.google.com/project/$PROJECT/authentication/providers).

b. **Toegestaan domein.** Als `gcloud` er is: lees `GET …/admin/v2/projects/$PROJECT/config`, voeg het domein uit `APP_URL` toe aan `authorizedDomains` en stuur `PATCH …/config?updateMask=authorizedDomains` met de hele lijst. Zonder `gcloud`: sla over; inloggen met wachtwoord werkt meestal ook zonder. Stap 8 test het.

c. **Database** (regio europe-west1 is verplicht, de pushfunctie draait daar ook):
```bash
firebase firestore:databases:create "(default)" --location=europe-west1 --project "$PROJECT"
```
Bestaat hij al, ga door. Staat hij in een andere regio, zet dan `region` in `firebase/functions/index.js` (`setGlobalOptions`) op diezelfde regio en noteer dat in de log.

d. **Regels met beheerder.** Vervang in `firebase/firestore.rules` de tekst `jouwnaam@pomgames.example` door `ADMIN@pomgames.example`. Daarna:
```bash
cd firebase && firebase deploy --only firestore:rules --project "$PROJECT"; cd ..
```

e. Commit en push (`config.js`, `firebase/.firebaserc`, `firebase/firestore.rules`): `git add -A && git commit -m "Firebase ingesteld" && git push`.

## Stap 5. Tussenstand

Vanaf nu werken accounts, spelers, berichten, uitnodigingen en buzzers al. Schrijf `DEPLOY.md` met: project-ID, APP_URL, GitHub-repo, beheerder, datum, wat nog open staat (stap 6 en 7).

## Stap 6. STOP: twee dingen die alleen de gebruiker kan doen

Stuur de gebruiker precies dit (vul de links in), in één bericht:

> Nog twee dingen, dan zijn ook de meldingen klaar. Het kan allebei op je telefoon.
> 1. **Blaze-abonnement** (nodig voor meldingen; voor een vriendengroep kost dit normaal niets): open https://console.firebase.google.com/project/PROJECT/usage/details → *Abonnement wijzigen* → Blaze → betaalkaart. Zet daarna een budgetmelding van €1.
> 2. **Meldingen-sleutel**: open https://console.firebase.google.com/project/PROJECT/settings/cloudmessaging → onder *Web Push-certificaten* → *Sleutelpaar genereren*. Kopieer de lange sleutel en plak hem hier.
> Wil je (nog) geen meldingen? Zeg dan "sla over"; de rest werkt al.

- Heb je zelf toegang tot een browser (Claude in Chrome) en is de gebruiker daar ingelogd, dan mag je het sleutelpaar (punt 2) zelf genereren en kopiëren, maar **alleen na toestemming** van de gebruiker. Punt 1 (betalen) doe je nooit zelf.
- Controleer Blaze met `gcloud billing projects describe "$PROJECT"` (`billingEnabled: true`) als `gcloud` er is; anders merk je het bij stap 7.

## Stap 7. Meldingen versturen (Cloud Function)

1. Zet de sleutel in `config.js` bij `vapidKey`.
2. `firebase/functions/.env`: `APP_URL=<APP_URL>` (met `/` aan het eind).
3. Deploy:
```bash
cd firebase/functions && npm install && cd ..
firebase deploy --only functions --project "$PROJECT"
cd ..
```
   - Vraagt de CLI hoeveel dagen containerimages bewaard moeten worden: antwoord `1`. In niet-interactieve modus met een foutmelding daarover: voer hetzelfde commando uit met `--force`.
   - Rechtenfout met Eventarc of "service agent" bij de eerste keer: wacht 5 minuten en probeer opnieuw (maximaal 3 keer).
   - Fout "billing" of "Blaze": terug naar stap 6, punt 1.
4. Controle: `firebase functions:list --project "$PROJECT"` toont `stuurMelding` in `europe-west1`.
5. Commit en push `config.js`.

## Stap 8. Testen

1. Wacht tot GitHub Pages de nieuwe `config.js` serveert: `curl -s "${APP_URL}config.js"` bevat de project-ID.
2. `curl -s -o /dev/null -w "%{http_code}" "${APP_URL}spel/test/"` geeft 404 (dat is goed: `404.html` stuurt door).
3. Als Playwright beschikbaar is (`npx playwright install chromium`): open `APP_URL` op 390×844, maak account `claudetest` + 4 willekeurige cijfers met een willekeurig wachtwoord, controleer dat het hoofdscherm met vier games verschijnt en dat `PG.Log.text()` geen regels met ` err ` bevat. Ruim daarna op: verwijder de gebruiker (met `gcloud`: `POST https://identitytoolkit.googleapis.com/v1/projects/$PROJECT/accounts:delete` met `{"localId": UID}`) en voor elk van `usernames/<naam>`, `users/<UID>` en `logs/<UID>`: `firebase firestore:delete <pad> -y --project "$PROJECT"`. Kan opruimen niet, meld het de gebruiker (hij kan het account laten staan of in de console weghalen).
4. Lokale regressietest (optioneel, zonder Firebase): `python3 -m http.server 8765` in deze map en dan `python3 bron/test/e2e.py` en `python3 bron/test/e2e2.py`. Er mogen geen fouten in staan, alleen geblokkeerde lettertypes mogen als 403 verschijnen.

## Stap 9. Afronden

Werk `DEPLOY.md` en `setup-log.txt` bij. Stuur de gebruiker dan alleen dit:

> PomGames staat online: APP_URL
> Op je telefoon:
> 1. Open de link in **Safari** (iPhone) of **Chrome** (Android).
> 2. iPhone: Deel → *Zet op beginscherm*. Android: menu ⋮ → *App installeren*.
> 3. Open PomGames vanaf je beginscherm, maak een account met de naam **ADMIN** en tik op *Meldingen aanzetten*.
> 4. Stuur je vrienden alleen de link.
> Nieuwe games zet je erbij via je naam → *Games beheren*.

---

## Later: vaste taken (voor Claude Code)

- **"Update PomGames met dit bestand"** (een nieuwe `index.html` van Claude): vervang `index.html`, controleer met `node --check` op de losse scripts, commit en push. Iedereen krijgt hem bij de volgende keer openen.
- **Broncode aanpassen**: wijzig bestanden in `bron/` en bouw met `python3 bron/build.py` (schrijft `index.html` en `404.html` in deze map). Test lokaal met `?mock=1&net=bc` en de tests in `bron/test/`. Commit en push.
- **Regels of pushfunctie gewijzigd**: `cd firebase && firebase deploy --only firestore:rules,functions --project <PROJECT>`.
- **Extra beheerder**: voeg `naam@pomgames.example` toe in de lijst bij `isAdmin` in `firebase/firestore.rules` en deploy de regels.
- **Wachtwoord vergeten** (speler X): verwijder de gebruiker `x@pomgames.example` (console of Identity Toolkit met `gcloud`) en de documenten `usernames/x` en `users/<uid>`. Daarna kan X opnieuw beginnen.
