/* PomGames instellingen.
   Vul dit in met de gegevens uit je eigen Firebase-project (HANDLEIDING.md, stap 3 en 6).
   Deze gegevens zijn niet geheim: de beveiliging zit in de Firestore-regels.
   Zolang dit leeg is, werken alleen de games (zonder accounts, berichten en meldingen). */
self.PG_CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  },
  // Projectinstellingen > Cloud Messaging > Web Push-certificaten > sleutelpaar
  vapidKey: ''
};
