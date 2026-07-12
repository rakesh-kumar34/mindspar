# Synapse native migration (Expo / React Native)

**Decision (2026-07-12):** one TypeScript codebase for iOS + Android + Web,
built on Expo SDK 57+ / React Native New Architecture / Expo Router.
Strangler-fig migration: the live PWA in `web/` keeps serving users
unchanged until this app reaches feature parity; nothing is cut over early.

Why Expo over Flutter: web is our primary live platform and Flutter's
canvas-rendered web target is its weakest (payload, SEO, a11y); RN ports our
existing JS logic and Firebase stack nearly 1:1; EAS Update restores
instant-deploy for store builds (OTA JS updates without review).

## Status
- [x] Phase 1 — scaffold: Expo + Router + TS, core game logic ported
      (`src/core/game.ts`: Elo, decks, daily, Rivals, score model; the full
      1,500-question bank), Synapse theme tokens (`src/core/theme.ts`),
      Home + Rivals screens, web export verified.
- [ ] Phase 2 — the duel: engine (port of web beginDuel/ask/pick/end),
      Reanimated timer + reveal states, results/review, visual questions
      via react-native-svg SvgXml.
- [ ] Phase 3 — accounts: Firebase JS SDK (auth + Firestore work on all
      three targets), profile, seen-question sync, Stats/Profile tabs,
      achievements.
- [ ] Phase 4 — social: friends, async duels, live duels, invites; E2E chat
      is the hard one (no Web Crypto on native — use
      react-native-quick-crypto; keep wire format identical so web and
      native chats interoperate).
- [ ] Phase 5 — parity + cutover: push (expo-notifications), sounds
      (expo-audio), Lottie (lottie-react-native), EAS Build to TestFlight /
      Play internal track; deploy Expo web export in place of `web/` only
      when a full parity checklist passes.

## Conventions
- `src/core/` stays platform-free (no RN imports) — it is the product.
- Design tokens mirror `web/style.css` exactly; change both or neither.
- Local runs: `npm run web` today; iOS/Android need Xcode/Android Studio
  (not yet installed on this machine) or EAS cloud builds.
