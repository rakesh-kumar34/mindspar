# CLAUDE.md — Mindspar

iOS (SwiftUI, 17+) head-to-head quiz duel game, adults 18+ only. Working title —
rename before any App Store submission.

## Project setup

- `.xcodeproj` is **generated** by XcodeGen from `project.yml` — never hand-edit it;
  re-run `xcodegen generate` after adding/renaming files.
- Firebase (Auth + Firestore) comes via SPM. Without Xcode installed the only check
  is `swiftc -parse` (syntax only; Firebase imports don't resolve outside Xcode).

## Architecture invariants

- **Everything remote sits behind the `Backend` protocol** (Services/Backend.swift).
  `LocalBackend` must keep the entire single-player experience working with zero
  configuration; `FirebaseBackend` activates only when GoogleService-Info.plist is
  bundled (checked at launch in MindsparApp). Never let a view import Firebase.
- **`DuelEngine` doesn't know bots from humans.** Opponent answers arrive through a
  feed: a scheduled local timeline for bots, a Firestore listener for humans. Keep
  it that way — every gameplay feature must work against both.
- **Bots are numbers, not models.** Per-domain accuracy probabilities + an answer
  time range (Services/Bots.swift). No LLM calls; the user explicitly chose
  simulated bots to keep the game free to run.
- **Decks are seeded.** Human matches share a `seed`; `QuestionBank.deck(seed:)`
  must stay deterministic (SplitMix64) or the two players see different questions.
- **Mindspar Score** (Services/IQModel.swift) is an entertainment estimate: skill
  index (70% accuracy, 30% speed) → z vs age-group reference → 100±15 scale,
  clamped 70–145, hidden until 16 answers. The profile screen must always carry
  the "not a clinical assessment" disclaimer — this is a legal/ethical requirement,
  not styling.
- **18+ gate**: DOB + explicit confirmation at signup, enforced in both backends
  (`AgeCheck`), not just the UI.
- **Elo drives everything** (Models.swift): every duel settles rating (bots have
  calibrated ratings, so bot farming moves it honestly); matchmaking claims the
  closest-rated lobby candidate (±200 band, stretches only if empty); the tier
  name (Novice→Luminary) and deck difficulty both derive from rating. Don't add a
  separate "level" system — rating IS the level.
- **Adaptive difficulty**: questions carry `difficulty` 1–3;
  `DifficultyLadder.target(forRating:)` pulls decks toward the player's band. For
  human matches the target is computed once (average of both ratings) and stored
  in the match doc — both clients MUST use the stored value or seeded decks diverge.
- **Question freshness + repeat cap**: `UserProfile.seenQuestions` remembers when
  each ID was served (pruned after 14 days); `serveCounts` counts lifetime serves.
  `excludedQuestionIDs()` = seen in last 7 days OR served 3+ times ever. Applies to
  bot matches only — seeded human decks can't do per-user avoidance. Web mirrors
  this in `freshSeen()` (`P.seen[id] = {t, n}`). Keep both sides in sync.
- **Question bank is generated**: `tools/generate_questions.py` is the single
  source — it writes both `Mindspar/Resources/questions.json` and
  `web/questions.js` (1,200 questions — 150 per each of the 8 domains). Never
  hand-edit the outputs; change the generator and re-run.

## Content rules

- Every question, bot name, and visual must be original. Genre mechanics
  (timed quiz duels) are fine; never copy question text, art, sounds, or names
  from Brain Wars, QuizUp, or similar titles.
- Audience: intellectuals and college students. Quality bar for every question:
  exactly one defensible answer; distractors plausible (common mistakes, not
  jokes); no ambiguity, no trick wording, no facts that drift over time
  (avoid "currently has the most X"); solvable in under the time limit without
  paper; college-level vocabulary is fine, niche trivia is not.
- questions.json format: `{id, domain, prompt, options[4], correctIndex,
  difficulty(1–3)}`; verify `correctIndex` carefully — a wrong key is the worst
  bug this app can have. Keep domains balanced and difficulties spread as the
  bank grows.

## Design language

Porcelain light surfaces + deep ink text + single iris accent (`Theme`). The duel
arena is deliberately the only dark screen. Serif (design: .serif) for the wordmark
and result headlines; rounded monospaced digits for scores and timers.

## Firestore layout

`users/{uid}` (+ `users/{uid}/friends/{fid}` subcollection), `usernames/{lower}`
(iOS uniqueness), `lobby/{uid}` (matchmaking), `invites/{id}`, `matches/{id}`
with `answers_<uid>` arrays, `friendRequests/{fromId}__{toId}` (**deterministic
id** so rules can verify an invite exists), `chats/{a}__{b}/messages/{id}`
(E2E ciphertext only). Matchmaking is best-effort claim (no transactions yet).

## Security (web — `firestore.rules` is the source of truth, deployed)

- **Never** revert to `allow read, write: if request.auth != null`. The rules
  are per-collection and require `email_verified`. Two invariants that are easy
  to break when editing: (1) the friends-subcollection write rule lets the
  invited party write into the inviter's list only if
  `friendRequests/{uid}__{fid}` exists — that's why request ids are
  deterministic and why `acceptFriendRequest` writes both friend docs *before*
  deleting the request; (2) chat read/create requires the requester to have the
  peer in their own `friends` subcollection — friends-only chat is enforced
  server-side, not just in the UI.
- `users` allows single-doc `get` but caps `list` at `limit <= 1`, so email
  lookup works but the user/email table can't be enumerated.
- Rules changes must be validated against `tools`/scratch REST tests using
  admin-verified users (email gate blocks unverified writes).

## Web client (features beyond iOS — harmonize eventually)

Email verification gate, friends + friend-requests, E2E-encrypted text-only chat
(`e2e.js`: ECDH P-256 + AES-GCM via Web Crypto; static keys, no forward secrecy
by design; private key in localStorage, public key on the profile doc),
light/dark theming (`data-theme`, dark default), and a 30-min idle sign-out.
Chat is **text only** — never add media/file upload. These aren't in the iOS
app yet.
