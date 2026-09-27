# PomGames — deploystatus

- **Datum:** 2026-09-27
- **Firebase project-ID:** pomgames-82aa0
- **GitHub-repo:** https://github.com/lpompen/pomgames
- **App-adres (GitHub Pages):** https://lpompen.github.io/pomgames/
- **Beheerder:** pompie
- **Firestore-regio:** europe-west1

## Wat werkt al
- GitHub Pages: live, HTTP 200.
- Firebase Authentication: e-mail/wachtwoord aan.
- Firestore-database: aangemaakt in europe-west1, regels gedeployed met `pompie` als beheerder.
- Accounts, spelers, berichten, uitnodigingen en buzzers werken vanaf nu.

## Nog open (alleen door de gebruiker te doen)
1. **Blaze-abonnement** nodig voor pushmeldingen (stap 6, punt 1).
2. **Meldingen-sleutel** (VAPID key) genereren en doorgeven (stap 6, punt 2).
3. Daarna: Cloud Function `stuurMelding` deployen (stap 7).

## Bekende restjes
- Losse, ongebruikte lege Google Cloud-projecten `pomgames-8mun2q` en `pomgames-tk39rz` zijn per ongeluk aangemaakt
  tijdens het zoeken naar de juiste manier om de Firebase-voorwaarden te accepteren. Geen kosten, mogen verwijderd
  worden via https://console.cloud.google.com/cloud-resource-manager (login: ludackgpt@gmail.com).
- Een eerder Firebase-project `pomgames-69e53` is per ongeluk aangemaakt onder een ánder Google-account (niet
  ludackgpt@gmail.com). Wordt niet gebruikt door PomGames; kan door de eigenaar van dat account worden opgeruimd.
- De oude inhoud van de GitHub-repo `lpompen/pomgames` (losse bestanden, een meegecommit pomgames.zip) is
  overschreven via een force-push. De git-historie daarvan is niet meer terug te halen.
