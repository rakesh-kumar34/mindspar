# Mindspar — web client

Static, no build step: `index.html` + ES modules. Works two ways:

- **No config (default):** offline mode. Sign-up/profile stored in
  `localStorage`, duels against the five bots only.
- **With Firebase:** real accounts, random matchmaking by rating, and
  email invites — same Firestore backend the iOS app uses.

## Run locally

Any static server works (modules won't load from `file://`):

```sh
cd web
python3 -m http.server 8080
# open http://localhost:8080
```

## Enable multiplayer (Firebase, free Spark tier)

1. [console.firebase.google.com](https://console.firebase.google.com) → Add project
   (Analytics optional).
2. **Build → Authentication → Sign-in method** → enable **Email/Password**.
3. **Build → Firestore Database** → Create database (production mode).
4. **Project settings → Your apps → Web app (</>)** → register, copy the
   `firebaseConfig` object into `firebase-config.js`:

   ```js
   export const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };
   ```

5. Firestore **Rules** → publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

   (v1: any signed-in player can read/write game docs. Tighten per-collection
   before opening to strangers.)

The Firebase web config is not a secret — it's shipped to every browser — so
it's fine to commit. Access control lives in the rules.

## Deploy

**GitHub Pages (simplest):** repo → Settings → Pages → deploy from branch,
folder `/web`... or copy `web/` to the repo root of a `gh-pages` branch.
Free, HTTPS, done.

**AWS free tier:**

- *Amplify Hosting* (easiest): Amplify console → Host web app → connect the
  GitHub repo, set base directory to `web`, no build command. Auto-deploys on
  push.
- *S3 + CloudFront*: create a bucket, upload `web/*`, enable static website
  hosting; put CloudFront in front for HTTPS. More knobs, same result.

**Firebase Hosting:** `npm i -g firebase-tools && firebase init hosting`
(public dir `web`, not SPA) → `firebase deploy`. Pairs naturally with the
Firestore backend.

## Files

| File | What |
| --- | --- |
| `app.js` | Entire game: auth, matchmaking, duel engine, Elo, profile |
| `questions.js` | 510-question bank — **generated** by `tools/generate_questions.py`, don't hand-edit |
| `firebase-config.js` | `null` = offline mode; paste config to go live |
| `style.css` | Design system (porcelain/ink/iris, dark arena) |

Human matches store the deck's question IDs (`deckIds`) in the match doc so
both players see identical questions. The iOS app still uses a shared seed —
harmonize before cross-platform play (see root README).
