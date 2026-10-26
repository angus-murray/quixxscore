# Qwixx score sheet

A browser-based Qwixx score sheet that tallies your score as you play. It works on phones (portrait or landscape), tablets and desktop browsers, and has no build step.

There are two ways to play:

- Practice: one score sheet on this device, for playing round a table. No account needed.
- Online: sign in, challenge another player by username, and watch each other's sheets update live. Finished games are kept in your history, with head-to-head records.

## Use

- Tap a number to cross it out. Numbers to its left are greyed out, as they can no longer be used.
- The last number in a row (12 for red and yellow, 2 for green and blue) unlocks after five crosses. Crossing it also crosses the lock, which counts as an extra cross.
- Tap a penalty box for each failed throw (−5 each).
- Tap the rightmost cross in a row to remove it, or use Undo.
- The game ends when two colours are closed or a player takes four penalties.

In practice mode, tap a row's lock when another player closes that colour.

In an online game, a colour your opponent locks closes on your sheet automatically. You can still cross that colour's last number if you lock it on the same roll. When the game ends, each player can add crosses from the final roll and then taps Confirm final sheet. The result is saved once both have confirmed.

## Scoring

A row with n crosses scores n(n + 1)/2 points (1, 3, 6, 10 … 78). The total is the sum of the four rows minus 5 per penalty.

## Running it

The app uses JavaScript modules, so it has to be served over HTTP rather than opened as a file. Any static host works (GitHub Pages, Firebase Hosting, Netlify). Locally:

```
python3 -m http.server 8000
```

then open http://localhost:8000.

## Setting up online play (Firebase)

Online play uses Firebase Authentication and Cloud Firestore. The free Spark plan is enough.

1. Create a project at https://console.firebase.google.com.
2. Build > Authentication > Get started, then enable the Email/Password sign-in provider.
3. Build > Firestore Database > Create database. Pick a location near you and start in production mode.
4. Firestore Database > Rules: replace the rules with the contents of `firestore.rules` and publish. (Or run `firebase deploy --only firestore:rules` with the Firebase CLI.)
5. Project settings > General > Your apps: add a web app and copy its `firebaseConfig` values into `firebase-config.js`.
6. If you host the app somewhere other than Firebase Hosting, add that domain under Authentication > Settings > Authorized domains (for example `yourname.github.io`).

To host on Firebase as well, install the CLI (`npm install -g firebase-tools`), run `firebase login`, `firebase use --add` to pick your project, then `firebase deploy`.

Each player creates an account in the app with a name and a unique username. To start a game, enter your opponent's username and tap Challenge. They see the challenge on their home screen the next time they open the app.

### Security

The Firebase web config is not secret: access is controlled by `firestore.rules`. Only the two players in a game can read it, each player can only change their own sheet, only the invited player can accept a challenge, and usernames can't be taken twice.

### Testing locally

With the Firebase CLI installed, `firebase emulators:start --only auth,firestore --project demo-qwixx` starts local Auth and Firestore emulators. Open the app with `?emulator` in the URL (for example http://localhost:8000/?emulator) to use them instead of a real project.
