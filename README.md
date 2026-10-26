# Qwixx score sheet

A browser-based Qwixx score sheet that tallies your score as you play. It works on phones (portrait or landscape), tablets and desktop browsers, and has no build step.

There are two ways to play:

- Practice: one score sheet on this device, for playing round a table. No account needed.
- Online: sign in with Google, challenge another player by username, and watch each other's sheets update live. Finished games are kept in your history, with head-to-head records.

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

Online play uses Firebase Authentication (Google sign-in) and Cloud Firestore (games). The free Spark plan is enough; no billing details are needed. Everything below is done in a web browser. Button names in the Firebase console change from time to time, so a label may differ slightly from what is written here.

### 1. Create the Firebase project

1. Go to https://console.firebase.google.com and sign in with a Google account.
2. Click Create a project (or Get started by setting up a Firebase project).
3. Enter a project name, for example `qwixx-score`, accept the terms and click Continue.
4. If asked about Gemini in Firebase or Google Analytics, turn them off and continue. Neither is needed.
5. Click Create project, wait for it to finish, then click Continue. You are now on the project overview page.

### 2. Turn on Google sign-in

1. In the left menu, open Build (or All products), then Authentication.
2. Click Get started.
3. On the Sign-in method tab, under Additional providers, click Google.
4. Turn on the Enable switch.
5. Under Support email for project, choose your email address. Google shows this on the sign-in screen.
6. Leave the public-facing name as it is (or change it to something like `Qwixx`; this is the name players see on Google's sign-in screen) and click Save.

### 3. Create the database

1. In the left menu, open Build, then Firestore Database.
2. Click Create database.
3. If asked for an edition, choose Standard. Leave the database ID as `(default)`.
4. Choose a location close to the players, for example `australia-southeast1 (Sydney)`. This cannot be changed later.
5. Choose Start in production mode and click Create.

### 4. Add the security rules

1. In Firestore Database, open the Rules tab.
2. Delete everything in the editor.
3. Open `firestore.rules` from this repository, copy all of it and paste it into the editor.
4. Click Publish. Without this step, every online action fails with a "Missing or insufficient permissions" error.

### 5. Register the app and copy its settings

1. Click Project Overview at the top of the left menu.
2. Click Add app (or the `</>` web icon under "Get started by adding Firebase to your app").
3. Enter a nickname such as `Qwixx`. Leave "Also set up Firebase Hosting" unticked. Click Register app.
4. Firebase shows some code containing `const firebaseConfig = { ... }`. You need the values for `apiKey`, `authDomain`, `projectId` and `appId`. Click Continue to console when done.
5. If you lose this page, it is under the gear icon > Project settings > General > Your apps > SDK setup and configuration > Config.

Now put those values into `firebase-config.js`. On GitHub you can do this in the browser: open the file, click the pencil icon, fill in the four values between the quotes, then click Commit changes. It should end up looking like this (with your own values):

```js
export var firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "qwixx-score.firebaseapp.com",
  projectId: "qwixx-score",
  appId: "1:1234567890:web:abc123..."
};
```

Pasting the whole object from Firebase is also fine; the extra fields (`storageBucket`, `messagingSenderId`) are ignored.

### 6. Put the app online

Both players need to open the app from the same web address. Choose one of these.

GitHub Pages (simplest; needs the repository to be public, or a paid GitHub plan for a private one):

1. In the repository on GitHub, go to Settings > Pages.
2. Under Build and deployment, set Source to Deploy from a branch.
3. Choose the branch that holds the app (for example `main`) and the `/ (root)` folder, then click Save.
4. After a minute or two the page shows the address, for example `https://angus-murray.github.io/quixxscore/`.
5. Back in Firebase, go to Authentication > Settings > Authorized domains, click Add domain and enter `angus-murray.github.io` (no `https://` and no path). Sign-in fails with an "unauthorized domain" error until this is done.

Firebase Hosting (works with a private repository; needs Node.js on your computer):

1. Install Node.js from https://nodejs.org, then in a terminal run `npm install -g firebase-tools`.
2. Download this repository (Code > Download ZIP on GitHub, then unzip it) and open a terminal in that folder.
3. Run `firebase login` and sign in with the same Google account.
4. Run `firebase use --add`, pick your project and give it the alias `default`.
5. Run `firebase deploy`. This uploads the app and the security rules, and prints the address, for example `https://qwixx-score.web.app`. Firebase Hosting domains are already authorised for sign-in.
6. Run `firebase deploy` again whenever the app changes.

Vercel (works with a private repository; free Hobby plan; redeploys automatically on every push):

1. Go to https://vercel.com, click Sign Up and continue with GitHub.
2. Click Add New > Project. If the repository is not listed, click Configure GitHub App (or Adjust GitHub App Permissions) and give Vercel access to it.
3. Click Import next to the repository.
4. Set Framework Preset to Other. Leave Root Directory as `./` and leave the build and output settings empty (there is no build step).
5. Click Deploy. When it finishes, Vercel shows the address, for example `https://quixxscore.vercel.app`.
6. Vercel publishes the repository's default branch to that address; pushes to other branches get separate preview addresses. To publish a different branch, go to the project's Settings > Git (or Settings > Environments > Production) and change the production branch, then redeploy.
7. In Firebase, go to Authentication > Settings > Authorized domains, click Add domain and enter the address without `https://`, for example `quixxscore.vercel.app`. Preview addresses are not authorised, so test online play on the main address.

### 7. Try it

1. Open the address on your phone. The home screen should show a Sign in with Google button under Play online. If it says online play is not set up, `firebase-config.js` has not been filled in (or the old version is still cached; reload the page).
2. Tap Sign in with Google and choose your Google account.
3. The first time, choose the name and username other players will see. Your opponent does the same on their phone.
4. Enter their username and tap Challenge. They see it under Challenges for you and tap Accept.
5. To add the app to the home screen: in Safari, Share > Add to Home Screen; in Chrome, the menu > Add to Home screen.

You can see the accounts in Firebase under Authentication > Users, and the games under Firestore Database > Data.

### Troubleshooting

- "Missing or insufficient permissions": the rules from step 4 have not been published.
- "Google sign-in is not turned on in Firebase": step 2 has not been done.
- Nothing happens when tapping Sign in with Google: the browser may be blocking pop-ups. Allow pop-ups for the app's address and try again.
- "This web address is not allowed to sign in": the app's domain is not in the authorised domains list (step 6).
- GitHub may email you about an exposed Google API key once `firebase-config.js` is committed. A Firebase web key is meant to be public, so this is expected. To limit it anyway, open https://console.cloud.google.com/apis/credentials (select your project), edit the Browser key, choose Websites under Application restrictions and add your app's address followed by `*` (for example `https://angus-murray.github.io/*`) and `https://<project-id>.firebaseapp.com/*`.

### Security

The Firebase web config is not secret: access is controlled by `firestore.rules`. Only the two players in a game can read it, each player can only change their own sheet, only the invited player can accept a challenge, and usernames can't be taken twice.

### Testing locally

With the Firebase CLI installed, `firebase emulators:start --only auth,firestore --project demo-qwixx` starts local Auth and Firestore emulators. Open the app with `?emulator` in the URL (for example http://localhost:8000/?emulator) to use them instead of a real project.
