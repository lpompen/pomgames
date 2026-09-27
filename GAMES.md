# Een game maken voor PomGames

Geef dit bestand aan Claude als je een nieuwe game laat maken, en zeg: "maak hem geschikt voor PomGames volgens GAMES.md". Daarna importeer je het HTML-bestand via **Games beheren**.

## Verplicht

- **Eén HTML-bestand** met alle CSS en JavaScript erin. Externe scripts en lettertypes alleen via `https://` (bijvoorbeeld cdnjs, jsDelivr, Google Fonts). Maximaal ongeveer 950 kB.
- **Mobiel eerst**: werkt op een telefoonscherm van 360 px breed, met duim te bedienen, licht en donker thema.
- De game draait in een eigen venster (iframe). Het adres is `…/spel/<code>/`, met eventueel `?join=CODE` of `?host=CODE` erachter.

## Aanbevolen (dan werkt alles samen met PomGames)

**Uitnodigingen.** Lees bij het starten de adresbalk:

```js
const params = new URLSearchParams(location.search);
const hostCode = params.get('host'); // maak meteen een online spel met precies deze code (4 letters)
const joinCode = params.get('join'); // doe meteen mee met deze code
```

Een game die `params.get('host')` gebruikt, kan in PomGames uitgenodigd worden: de uitnodiger start met `?host=ABCD`, de ander met `?join=ABCD`.

**Deellinks.** `location.origin + location.pathname + '?join=' + code` werkt: zo'n link opent PomGames met de juiste game (via `404.html`).

**Opslaan.** Gebruik `localStorage` met als voorvoegsel de code van de game, bijvoorbeeld `vlaggenrace.`. PomGames zet de spelersnaam vooraf in `<code>.nick` (als JSON-tekst).

**Log.** Bewaar de log van de laatste run in `localStorage['<code>.lastlog']` als `{ run, errors, entries: ['…', '…'] }`. PomGames voegt die toe aan "Kopieer log".

**PomGames-koppeling.** Als `window.PG_HOST` bestaat, draait de game in PomGames. PomGames laat dan de eigen balk bovenin weg, dus de game moet zelf een knop "Naar PomGames" tonen.

```js
const H = window.PG_HOST; // null buiten PomGames
if (H) {
  H.playerName;          // gebruikersnaam van deze speler
  H.opponent;            // { name } bij een uitnodiging, anders null
  H.join; H.host;        // spelcode uit de uitnodiging ('' als er geen is)
  H.canBuzz;             // true als buzzen kan
  H.exit();              // terug naar PomGames
  H.buzz();              // buzz de tegenstander (pushmelding)
  H.score({ mode: 'bot', result: { winner: 0, me: 0, score: [12, 9] } }); // uitslag melden (voor later)
  H.log('game', 'ronde 2 gewonnen'); // regel in de PomGames-log
  H.shareUrl('ABCD');    // uitnodigingslink voor deze game
}
```

**Online spelen** kan met PeerJS, zoals Blokduel, Mijnenduel, Tegelduel en Bommenduel: `https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js`, met de spelcode in de naam van de maker (bijvoorbeeld `vlaggenrace-v1-ABCD`).

## Controleren

In **Games beheren** tik je na het kiezen van het bestand op **Probeer uit**. Je ziet dan of uitnodigen mogelijk is (staat het vinkje aan) en of de game met PomGames samenwerkt.
