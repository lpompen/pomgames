# PomGames installeren

PomGames is één app met Blokduel, Mijnenduel, Tegelduel en Bommenduel, plus accounts, een spelerslijst, berichten, uitnodigingen, buzzers en pushmeldingen. De app staat op GitHub Pages; accounts, berichten en meldingen lopen via Firebase (gratis dienst van Google).

**Liever niks zelf doen?** Open deze map in Claude Code en zeg: *"Voer OPDRACHT-CLAUDE-CODE.md uit."* Claude Code zet dan alles online. Jij hoeft alleen twee keer in te loggen, het Blaze-abonnement af te sluiten (betaalkaart) en één sleutel te laten genereren; daarna zet je de app op je telefoon.

Wil je het toch zelf doen, volg dan de stappen hieronder. Je doet dit één keer. Reken op ongeveer een uur. Stap 1 tot en met 6 kan op je telefoon, voor stap 7 heb je eenmalig een computer nodig.

**Wat je nodig hebt:** je GitHub-account, een Google-account, een betaalkaart (alleen voor stap 7; voor een vriendengroep kost het normaal gesproken niets) en eenmalig een computer.

---

## 1. De app op GitHub zetten

1. Maak op GitHub een nieuwe repository met de naam `pomgames` (Public).
2. Upload alles uit de map `pomgames` van de zip: `index.html`, `404.html`, `config.js`, `sw.js`, `manifest.webmanifest` en de mappen `icons` en `firebase`. (`404.html` zorgt dat deellinks van geïmporteerde games in PomGames uitkomen.)
3. Ga naar **Settings → Pages**. Kies bij *Branch* `main` en `/ (root)` en tik op **Save**.
4. Na een minuut staat de app op `https://JOUWNAAM.github.io/pomgames/`.

Open dat adres. Je ziet de vier games en een kaartje "Accounts en berichten staan nog uit". De games werken nu al; de rest zet je hieronder aan.

## 2. Een Firebase-project maken

1. Ga naar [console.firebase.google.com](https://console.firebase.google.com) en log in met je Google-account.
2. Tik op **Project maken** (Create a project), noem het `pomgames`. Google Analytics mag uit.

## 3. De web-app koppelen

1. Tik in het projectoverzicht op het icoontje **`</>`** (Web).
2. Bijnaam: `PomGames`. Vink *Firebase Hosting* niet aan. Tik op **App registreren**.
3. Je ziet een blok `const firebaseConfig = { ... }` met zes waarden.
4. Open in GitHub het bestand `config.js`, tik op het potloodje en vul de zes waarden in tussen de aanhalingstekens:

```js
firebase: {
  apiKey: 'AIza...',
  authDomain: 'pomgames-xxxx.firebaseapp.com',
  projectId: 'pomgames-xxxx',
  storageBucket: 'pomgames-xxxx.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123'
},
```

Sla op met **Commit changes**. Deze gegevens zijn niet geheim; de beveiliging zit in de regels van stap 5.

## 4. Inloggen met naam en wachtwoord aanzetten

1. Ga in Firebase naar **Build → Authentication → Aan de slag** (Get started).
2. Tabblad **Aanmeldmethode** (Sign-in method): kies **E-mailadres/wachtwoord**, zet alleen de bovenste schakelaar aan en sla op.
3. Tabblad **Instellingen → Geautoriseerde domeinen** (Authorized domains): voeg `JOUWNAAM.github.io` toe.

Spelers kiezen in de app alleen een gebruikersnaam en wachtwoord. Achter de schermen maakt de app daar `naam@pomgames.example` van; dat adres ziet niemand en er wordt nooit mail naartoe gestuurd.

## 5. De database aanmaken

1. Ga naar **Build → Firestore Database → Database maken**.
2. Krijg je de keuze *Standard* of *Enterprise*: kies **Standard**.
3. Locatie: **europe-west1 (Belgium)**. Dit is belangrijk voor stap 7 en kun je later niet meer wijzigen.
4. Kies **productiemodus** en maak de database.
5. Ga naar het tabblad **Regels** (Rules), vervang alles door de inhoud van `firebase/firestore.rules`.
6. Zoek in die regels `jouwnaam@pomgames.example` en vervang `jouwnaam` door **jouw gebruikersnaam in kleine letters** (de naam die je straks in de app kiest). Daarmee word jij beheerder en kun je games importeren. Tik op **Publiceren**.

Doe je stap 7 later ook, zet dan dezelfde naam in `firebase/firestore.rules` op je computer, anders overschrijft de deploy je beheerder weer.

## 6. De sleutel voor meldingen

1. Tandwiel linksboven → **Projectinstellingen → Cloud Messaging**.
2. Onder **Web Push-certificaten** (Web configuration) tik je op **Sleutelpaar genereren**.
3. Kopieer de lange sleutel en zet hem in `config.js` bij `vapidKey: '...'`. Commit.

Vanaf nu werken accounts, de spelerslijst, berichten, uitnodigingen en buzzers. Alleen de pushmeldingen (als de app dicht is) komen pas na stap 7.

## 7. Pushmeldingen laten versturen (eenmalig, op een computer)

Een klein programmaatje bij Firebase stuurt de melding zodra iemand een bericht, uitnodiging of buzz verstuurt.

1. **Blaze-abonnement.** Tik in Firebase linksonder op **Upgraden** en kies *Blaze* (betalen naar gebruik). Stel meteen een **budgetmelding** in, bijvoorbeeld €1. Voor een groep vrienden blijf je normaal gesproken binnen het gratis deel.
2. **Node.js.** Installeer op je computer Node.js (versie 22 of nieuwer) van [nodejs.org](https://nodejs.org).
3. **Firebase-tools.** Open een terminal (Mac: Terminal, Windows: PowerShell) en typ:
   ```
   npm install -g firebase-tools
   firebase login
   ```
4. **Instellen.** Pak de zip uit en open de map `pomgames/firebase`:
   - In `.firebaserc` vervang je `JOUW-PROJECT-ID` door je project-ID (staat bij Projectinstellingen, bijvoorbeeld `pomgames-xxxx`).
   - In `functions/.env` vul je je adres in: `APP_URL=https://JOUWNAAM.github.io/pomgames/`
5. **Versturen naar Firebase.** Ga in de terminal naar die map en typ:
   ```
   cd functions
   npm install
   cd ..
   firebase deploy --only functions,firestore:rules
   ```
   - Vraagt hij om diensten aan te zetten: antwoord **ja**.
   - Vraagt hij hoeveel dagen hij containerimages moet bewaren: antwoord **1**.
   - Krijg je bij de allereerste keer een fout over rechten (Eventarc): wacht vijf minuten en voer de laatste regel nog een keer uit. Dat is bekend gedrag bij een nieuw project.

## 8. Op je telefoon zetten

Stuur je vrienden alleen de link `https://JOUWNAAM.github.io/pomgames/`.

- **iPhone:** open de link in **Safari** → tik op **Deel** (vierkantje met pijl) → **Zet op beginscherm**. Open PomGames daarna vanaf het beginscherm. Meldingen werken op de iPhone alleen zo, en vanaf iOS 16.4.
- **Android:** open de link in **Chrome** → menu **⋮** → **App installeren** (of *Toevoegen aan startscherm*).

Daarna: account maken → de app vraagt meteen of meldingen aan mogen → **Meldingen aanzetten** → toestaan. Een webapp mag die vraag pas stellen na een tik van de speler, niet al tijdens het installeren; daarom verschijnt hij direct na het maken van het account.

## 9. Updates

Je past alleen de bestanden in GitHub aan (meestal `index.html`). Iedereen krijgt de nieuwe versie de volgende keer dat de app opent; wie de app lang open heeft laten staan, krijgt hem als hij na een uur terugkomt. Niemand hoeft opnieuw te installeren.

- Heb je `sw.js` veranderd? Verhoog dan `pomgames-v1` naar `pomgames-v2`.
- Heb je `firestore.rules` of de map `functions` veranderd? Voer dan stap 7.5 opnieuw uit (alleen de laatste regel).

**Van versie 1.0 naar 1.1** (Bommenduel en games importeren): upload de nieuwe `index.html` en `404.html`, plak de nieuwe regels uit `firebase/firestore.rules` met jouw naam erin (stap 5.5 en 5.6), en voer als je stap 7 al had gedaan de deploy nog één keer uit, zodat meldingen ook de namen van geïmporteerde games noemen.

## 9b. Games toevoegen en bijwerken (beheer)

Nieuwe games zet je er zonder GitHub bij, gewoon vanaf je telefoon.

1. Laat Claude een game maken en vraag om de game **als HTML-bestand**. Bewaar dat bestand op je telefoon. Wil je dat de game ook met uitnodigingen en buzzers werkt, zeg dan: "maak hem geschikt voor PomGames volgens GAMES.md" en plak de inhoud van `GAMES.md` erbij.
2. Open PomGames → tik rechtsboven op je naam → **Games beheren**. (Die knop zie je alleen als je naam als beheerder in de regels staat.)
3. **Nieuwe game importeren** → kies het bestand, of plak een link (bijvoorbeeld van GitHub).
4. Controleer naam, beschrijving, kleur en speelvormen. Tik op **Probeer uit** om hem eerst zelf te spelen.
5. Tik op **Publiceren**. De game staat meteen bij iedereen in de lijst, met het label *Nieuw*.

Bij elke game kun je ook:
- **Nieuwe versie**: kies een nieuw bestand; wie de game opent krijgt meteen de nieuwe versie (label *Bijgewerkt*). Dit kan ook bij de ingebouwde games; met **Terug naar ingebouwd** zet je die weer terug.
- **Verbergen / Tonen**: haal een game tijdelijk uit de lijst voor iedereen.
- **Verwijderen**: alleen bij geïmporteerde games.

Een geïmporteerde game draait in zijn eigen venster met bovenaan een balk **‹ PomGames** om terug te gaan. Games die volgens `GAMES.md` zijn gemaakt, krijgen je spelersnaam, uitnodigingen en buzzers, en tonen die balk niet. Een game mag maximaal ongeveer 950 kB zijn en moet in één HTML-bestand zitten.

## 10. Beheer

- **Wachtwoord vergeten** (er is bewust geen "wachtwoord vergeten"): ga naar **Authentication → Gebruikers**, zoek `naam@pomgames.example` en verwijder het account. Verwijder in **Firestore** ook `usernames/<naam in kleine letters>` en `users/<uid>`. Daarna kan diegene opnieuw beginnen, ook met dezelfde naam.
- **Iemand weren:** in Authentication het account uitschakelen.
- **Log van een speler:** Firestore → `logs` → het uid van die speler.
- **Nog een beheerder:** zet diens naam erbij in de regels: `['sam@pomgames.example', 'pom@pomgames.example']`.

## 11. De log

In elk spel zit **Menu → Kopieer log**, en in PomGames onderaan en bij je profiel. Plak die in je chat met Claude en zeg "log", dan zoekt Claude uit wat er misging. De log van PomGames bevat ook de log van geïmporteerde games die je in die sessie speelde.

## 12. Als iets niet werkt

| Wat je ziet | Oplossing |
|---|---|
| "Dit webadres staat nog niet bij de toegestane domeinen" | Stap 4.3 |
| "Inloggen met wachtwoord staat nog uit" | Stap 4.2 |
| "Geen toegang tot de database" | Stap 5.5: regels gepubliceerd? |
| Berichten werken, maar geen melding als de app dicht is | Stap 6 en 7 gedaan? Kijk in Firebase bij **Functions → Logs** |
| iPhone krijgt geen meldingen | Staat PomGames op het beginscherm en open je hem daarvandaan? Staan meldingen aan bij Instellingen → Meldingen → PomGames? |
| Geen knop **Games beheren** | Staat jouw naam (kleine letters) in de regels bij `isAdmin`? Log daarna uit en weer in. |
| "Geen toestemming" bij publiceren | Zelfde oorzaak: je naam staat niet als beheerder in de regels. |
| Geïmporteerde game blijft op "Laden" | Internet nodig bij de eerste keer openen; daarna werkt hij ook offline. |
| Online spel vindt de ander niet | Beide met internet? Vraag om een nieuwe uitnodiging; een uitnodiging is 30 minuten geldig |

**Proberen zonder Firebase:** open `https://JOUWNAAM.github.io/pomgames/?mock=1&net=bc` in twee tabbladen van dezelfde browser. Dan werkt alles nep binnen die ene browser, handig om de schermen te bekijken.
