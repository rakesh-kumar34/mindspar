// Mindspar Firebase configuration.
//
// Without this, the game runs in offline mode: local profile + bot duels only.
// To enable real accounts, invites, and live human matches:
//
//   1. console.firebase.google.com → Add project (free Spark plan).
//   2. Project settings → Your apps → Add app → Web (</>) → copy the config.
//   3. Replace `null` below with that config object.
//   4. Build → Authentication → Sign-in method → enable Email/Password.
//   5. Build → Firestore Database → Create database (production mode),
//      then paste the security rules from web/README.md.
//
// export const firebaseConfig = {
//   apiKey: "...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   storageBucket: "your-project.firebasestorage.app",
//   messagingSenderId: "...",
//   appId: "...",
// };

export const firebaseConfig = null;
