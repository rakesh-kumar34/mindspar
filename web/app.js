// Mindspar web client. Runs offline (local profile + bots) with no setup;
// real accounts, email invites, and live rating-matched duels switch on when
// firebase-config.js is filled in — same graceful degradation as the iOS app.
import { QUESTIONS } from "./questions.js";
import { firebaseConfig } from "./firebase-config.js";
import { createIdentity, unwrapIdentity, makeChannel } from "./e2e.js";
import { COUNTRIES, flagOf, countryName } from "./countries.js";
import { ic, BOT_ICON, DOMAIN_ICON } from "./icons.js";
import { characterAvatar, PICKER_SEEDS } from "./avatars.js";
import { sfx, isMuted, setMuted } from "./sound.js";

// ---------------- game math (mirrors the Swift services) ----------------
const LIMIT = 18, N = 10, MIN_ANSWERS = 16;
const DOMAINS = {
  reasoning: ["Reasoning", "#5457e8", "◫"], math: ["Math", "#0f85d4", "∑"],
  verbal: ["Verbal", "#cc5624", "❝"], knowledge: ["Knowledge", "#8c5cd4", "◍"],
  science: ["Science", "#219e78", "⚛"], patterns: ["Patterns", "#c48c1c", "≋"],
  history: ["History", "#b04458", "◔"], geography: ["Geography", "#0e8f8a", "◈"],
};
const BOTS = [
  { id: "vega", name: "Vega", tag: "Numbers move first", glyph: "∑", rating: 1150,
    acc: { math: .9, patterns: .85, reasoning: .7, verbal: .55, knowledge: .55, science: .65, history: .5, geography: .55 }, min: 2.5, max: 7 },
  { id: "lyra", name: "Lyra", tag: "Reads between every line", glyph: "❝", rating: 1100,
    acc: { verbal: .9, knowledge: .8, reasoning: .7, math: .55, patterns: .55, science: .65, history: .75, geography: .6 }, min: 3, max: 8 },
  { id: "atlas", name: "Atlas", tag: "Knows a little about everything", glyph: "◍", rating: 1050,
    acc: { knowledge: .88, science: .8, verbal: .7, reasoning: .6, math: .6, patterns: .6, history: .82, geography: .88 }, min: 2.5, max: 7.5 },
  { id: "kepler", name: "Kepler", tag: "Methodical, rarely wrong, never fast", glyph: "⚛", rating: 1250,
    acc: { science: .92, reasoning: .8, math: .75, patterns: .75, verbal: .65, knowledge: .7, history: .7, geography: .72 }, min: 6, max: 12 },
  { id: "dash", name: "Dash", tag: "Answers before you finish reading", glyph: "⚡", rating: 900,
    acc: { reasoning: .62, math: .62, verbal: .62, knowledge: .62, science: .62, patterns: .62, history: .62, geography: .62 }, min: 1.2, max: 3.5 },
];

const tier = r => r < 900 ? "Novice" : r < 1050 ? "Adept" : r < 1200 ? "Scholar" : r < 1350 ? "Sage" : "Luminary";
const ladder = r => r < 950 ? 1.5 : r < 1150 ? 2 : r < 1300 ? 2.4 : 2.8;
const eloDelta = (mine, theirs, actual) => Math.round(32 * (actual - 1 / (1 + 10 ** ((theirs - mine) / 400))));
const AGEREF = { "18–24": .63, "25–34": .64, "35–44": .62, "45–54": .60, "55+": .58 };
const yearsOld = dob => (Date.now() - new Date(dob)) / 31557600000;
const ageGroup = dob => { const y = yearsOld(dob); return y < 25 ? "18–24" : y < 35 ? "25–34" : y < 45 ? "35–44" : y < 55 ? "45–54" : "55+"; };
// Online profiles store only the coarse age band ("25–34"), never the exact
// date of birth — the DOB is used once at signup for the 18+ check. Older
// docs that still carry a dob are migrated on sign-in (see the backend).
const ageBand = p => p.age || (p.dob ? ageGroup(p.dob) : "25–34");
const speedF = ms => Math.max(0, Math.min(1, 1 - ms / 1000 / LIMIT));
const scoreFor = (ok, ms) => ok ? 100 + Math.round(50 * speedF(ms)) : 0;
const qById = Object.fromEntries(QUESTIONS.map(q => [q[0], q]));

function sparScore(P) {
  const answered = Object.values(P.dA).reduce((a, b) => a + b, 0);
  if (answered < MIN_ANSWERS) return null;
  const acc = Object.values(P.dC).reduce((a, b) => a + b, 0) / answered;
  const speed = P.sfN ? P.sfSum / P.sfN : .5;
  const z = ((acc * .7 + speed * .3) - (AGEREF[ageBand(P)] ?? .62)) / .14;
  return Math.max(70, Math.min(145, Math.round(100 + 15 * z)));
}

// P.seen[id] = {t: lastServedMs, n: timesServedEver}. Excluded when served
// within the 7-day freshness window OR served 3+ times ever (repeat cap).
// Older saves stored a bare timestamp; treat those as {t, n: 1}.
function seenEntry(v) { return typeof v === "number" ? { t: v, n: 1 } : v; }
function freshSeen(P) {
  const cutoff = Date.now() - 7 * 86400000;
  return new Set(Object.entries(P.seen || {})
    .filter(([, v]) => { const e = seenEntry(v); return e.t > cutoff || e.n >= 3; })
    .map(([k]) => k));
}

// Balanced (or subject-focused) deck near a difficulty target, avoiding
// recently seen questions. For human matches the creator builds the deck and
// shares the IDs, so both players see the identical questions.
function buildDeck({ domain = null, targetDifficulty = 2, seen = new Set() } = {}) {
  const cost = q => Math.abs(q[2] - targetDifficulty) + (seen.has(q[0]) ? 10 : 0);
  const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  if (domain) {
    return shuffle(shuffle(QUESTIONS.filter(q => q[1] === domain))
      .sort((a, b) => cost(a) - cost(b)).slice(0, N));
  }
  const byDomain = {};
  QUESTIONS.forEach(q => { (byDomain[q[1]] = byDomain[q[1]] || []).push(q); });
  Object.keys(byDomain).forEach(d => {
    byDomain[d] = shuffle(byDomain[d]).sort((a, b) => cost(b) - cost(a)); // best last, for pop()
  });
  const domains = shuffle(Object.keys(byDomain));
  const deck = [];
  while (deck.length < N) {
    let added = false;
    for (const d of domains) {
      if (deck.length >= N) break;
      const q = byDomain[d].pop();
      if (q) { deck.push(q); added = true; }
    }
    if (!added) break;
  }
  return shuffle(deck);
}

// Daily challenge: one deck per (UTC) day, identical for everyone, so scores are
// comparable. Seeded from the date via a deterministic RNG.
const todayKey = () => new Date().toISOString().slice(0, 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function dailyDeck() {
  const seed = [...todayKey()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seed);
  const arr = QUESTIONS.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, N);
}

// ---------------- backends ----------------
// Common surface: signUp, signIn, signOut, save, findMatch, cancelSearch,
// sendInvite, listenInvites, acceptInvite, submitAnswer, listenOpponent, stopMatch.

const localBackend = {
  isLive: false,
  async restore() { try { return JSON.parse(localStorage.getItem("mindspar-web")); } catch { return null; } },
  async signUp(fields) {
    const profile = newProfile(crypto.randomUUID(), fields);
    localStorage.setItem("mindspar-web", JSON.stringify(profile));
    return profile;
  },
  async signIn() { throw new Error("Offline mode has a single local profile — sign up to create it."); },
  async resetPassword() { throw new Error("Password reset needs online mode."); },
  // Offline has no email to verify — sign-up creates the profile directly.
  async resendVerification() {}, async refreshVerified() { return true; },
  async completeSignup() { return JSON.parse(localStorage.getItem("mindspar-web")); },
  async signOut() { localStorage.removeItem("mindspar-web"); },
  async save(profile) { localStorage.setItem("mindspar-web", JSON.stringify(profile)); },
  async findMatch() { throw new Error("Online play isn't enabled on this copy — bots are always ready!"); },
  async cancelSearch() {},
  async sendInvite() { throw new Error("Online play isn't available offline."); },
  async cancelInvite() {},
  listenInvites() {},
  async acceptInvite() { throw new Error("Online play needs Firebase."); },
  submitAnswer() {}, listenOpponent() {}, stopMatch() {},
  async createAsyncDuel() { throw new Error("Async duels need an online account."); },
  listenAsyncDuels() {}, async submitAsyncResult() {}, async markAsyncApplied() {},
  async deleteAsyncDuel() {},
  async reportQuestion() {},
  async deleteAccount() { localStorage.removeItem("mindspar-web"); },
  // Friends + chat require accounts, so they're online-only.
  async publishIdentity() {},
  async sendFriendRequest() { throw new Error("Friends need an online account."); },
  listenFriendRequests() {}, async acceptFriendRequest() {}, async declineFriendRequest() {},
  async listFriends() { return []; }, listenFriends() { return () => {}; },
  sendMessage() {}, listenMessages() { return () => {}; },
  markRead() {}, listenChatMeta() { return () => {}; }, listenLatest() { return () => {}; },
  async getPubKey() { return null; }, async getProfile() { return null; }, async heartbeat() {},
  async submitDaily() {}, async getDailyScores() { return []; },
  async findUser() { return null; },
};

function newProfile(id, { name, email, dob, country }) {
  return { id, name, email: email.toLowerCase(), dob, age: ageGroup(dob),
           country: country || "", photo: null, avatarSeed: null,
           pubKey: null, encPriv: null, encPrivIv: null, encPrivSalt: null,
           createdAt: Date.now(),
           rating: 1000, played: 0, won: 0, streak: 0, best: 0,
           dA: {}, dC: {}, sfSum: 0, sfN: 0, seen: {} };
}

async function makeFirebaseBackend(config) {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js");
  const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
          signOut, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
          EmailAuthProvider, reauthenticateWithCredential, deleteUser } =
    await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
  const { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, getDocs,
          collection, query, where, orderBy, limit, onSnapshot, arrayUnion,
          serverTimestamp, deleteField } =
    await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // Session listeners (invites, friend requests, friends) live for the whole
  // sign-in; match listeners (lobby, opponent feed) are torn down when a duel
  // ends. Keeping them separate means finishing a match no longer kills the
  // invite/friend feeds.
  let sessionSubs = [], matchSubs = [], pendingInvite = null;
  const stopSession = () => { sessionSubs.forEach(u => u()); sessionSubs = []; };
  const stopMatchSubs = () => { matchSubs.forEach(u => u()); matchSubs = []; };
  const chatId = (a, b) => [a, b].sort().join("__");

  const authReady = new Promise(resolve => {
    const stop = onAuthStateChanged(auth, user => { stop(); resolve(user); });
  });

  // Privacy migration: profiles used to store the exact date of birth; only
  // the coarse age band belongs in a doc other players can fetch. Runs once
  // per old account, on its own sign-in (only the owner may write the doc).
  async function scrubDob(profile) {
    if (!profile || !profile.dob) return profile;
    const age = profile.age || ageGroup(profile.dob);
    await updateDoc(doc(db, "users", profile.id), { age, dob: deleteField() })
      .catch(() => {});
    const { dob, ...rest } = profile;
    return { ...rest, age };
  }
  // Never let a dob reach Firestore, whatever path a profile object took.
  const publicDoc = profile => { const { dob, ...pub } = profile; return pub; };

  return {
    isLive: true,
    async restore() {
      const user = await authReady;
      if (!user) return null;
      // Not verified yet → tell the app to show the verification gate rather
      // than a usable profile (the security rules would block it anyway).
      if (!user.emailVerified) return { pendingVerification: true, uid: user.uid, email: user.email };
      // Force a token refresh so its email_verified claim matches the account
      // (the two can diverge right after verifying, which the rules would
      // otherwise reject).
      await user.getIdToken(true);
      const snap = await getDoc(doc(db, "users", user.uid));
      return snap.exists() ? await scrubDob(snap.data()) : null;
    },
    // Create the account and send the verification email, but DON'T create the
    // profile doc yet — that happens once the email is confirmed. Real, owned
    // email required; fake/random addresses can never verify.
    async signUp(fields) {
      const cred = await createUserWithEmailAndPassword(auth, fields.email, fields.password);
      await sendEmailVerification(cred.user);
      return { pendingVerification: true, uid: cred.user.uid, ...fields };
    },
    async resendVerification() {
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
    },
    async resetPassword(email) {
      await sendPasswordResetEmail(auth, email.toLowerCase().trim());
    },
    // Re-check verification; refresh the ID token so its email_verified claim
    // updates for the security rules. Returns true once verified.
    async refreshVerified() {
      const u = auth.currentUser;
      if (!u) return false;
      await u.reload();
      if (u.emailVerified) await u.getIdToken(true);
      return !!u.emailVerified;
    },
    // Called after the email is verified: writes the profile doc for real.
    // If a profile already exists (e.g. an older account that just verified),
    // keep it rather than overwriting with a fresh one.
    async completeSignup(pending) {
      const u = auth.currentUser;
      if (!u || !u.emailVerified) throw new Error("Email not verified yet.");
      await u.getIdToken(true);
      const existing = await getDoc(doc(db, "users", u.uid));
      if (existing.exists()) return await scrubDob(existing.data());
      if (!pending || !pending.name || !pending.dob)
        throw new Error("Let's set up your profile again — please sign up.");
      const profile = newProfile(u.uid, pending);
      if (pending.identity) Object.assign(profile, pending.identity); // pubKey + wrapped priv
      await setDoc(doc(db, "users", profile.id), publicDoc(profile));
      return profile;
    },
    async signIn(email, password) {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await cred.user.reload();
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user).catch(() => {});
        await signOut(auth);
        throw new Error("Please verify your email first — we've sent a fresh link to your inbox.");
      }
      await cred.user.getIdToken(true);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (!snap.exists()) throw new Error("Profile not found — please sign up again.");
      return await scrubDob(snap.data());
    },
    async signOut() { stopSession(); stopMatchSubs(); await signOut(auth); },
    async publishIdentity(uid, idn) {
      await updateDoc(doc(db, "users", uid), {
        pubKey: idn.pub, encPriv: idn.encPriv, encPrivIv: idn.encPrivIv, encPrivSalt: idn.encPrivSalt });
    },
    async save(profile) { await setDoc(doc(db, "users", profile.id), publicDoc(profile)); },

    // --- random matchmaking, rating-banded (mirrors FirebaseBackend.swift) ---
    async findMatch(P, onMatch) {
      const waiting = await getDocs(query(collection(db, "lobby"), orderBy("createdAt"), limit(5)));
      const candidates = waiting.docs
        .filter(d => d.id !== P.id && !d.get("matchId"))
        .sort((a, b) => Math.abs((a.get("rating") ?? 1000) - P.rating)
                      - Math.abs((b.get("rating") ?? 1000) - P.rating));
      const banded = candidates.find(d => Math.abs((d.get("rating") ?? 1000) - P.rating) <= 200);
      const claim = banded ?? candidates[0];

      if (claim) {
        const oppRating = claim.get("rating") ?? 1000;
        const target = ladder(Math.round((P.rating + oppRating) / 2));
        const deckIds = buildDeck({ targetDifficulty: target }).map(q => q[0]);
        const matchRef = await addDoc(collection(db, "matches"), {
          deckIds, targetDifficulty: target,
          players: { [P.id]: { name: P.name, rating: P.rating, country: P.country || "" },
                     [claim.id]: { name: claim.get("name") ?? "Player", rating: oppRating,
                                   country: claim.get("country") ?? "" } },
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "lobby", claim.id), { matchId: matchRef.id });
        onMatch({ matchId: matchRef.id, oppId: claim.id,
                  oppName: claim.get("name") ?? "Player", oppRating,
                  oppCountry: claim.get("country") ?? "", deckIds });
        return;
      }
      // Nobody suitable: wait in the lobby to be claimed.
      await setDoc(doc(db, "lobby", P.id), {
        name: P.name, rating: P.rating, country: P.country || "", createdAt: serverTimestamp(),
      });
      const stop = onSnapshot(doc(db, "lobby", P.id), async snap => {
        const matchId = snap.get("matchId");
        if (!matchId) return;
        stop();
        await deleteDoc(doc(db, "lobby", P.id));
        const match = await getDoc(doc(db, "matches", matchId));
        const players = match.get("players") ?? {};
        const oppId = Object.keys(players).find(k => k !== P.id);
        onMatch({ matchId, oppId,
                  oppName: players[oppId]?.name ?? "Player",
                  oppRating: players[oppId]?.rating ?? 1000,
                  oppCountry: players[oppId]?.country ?? "",
                  deckIds: match.get("deckIds") ?? [] });
      });
      matchSubs.push(stop);
    },
    async cancelSearch(P) { stopMatchSubs(); await deleteDoc(doc(db, "lobby", P.id)).catch(() => {}); },

    // --- email invites ---
    async sendInvite(email, P, onMatch) {
      const key = email.toLowerCase().trim();
      const found = await getDocs(query(collection(db, "users"), where("email", "==", key), limit(1)));
      if (found.empty) throw new Error("No player found with that email.");
      const inviteRef = await addDoc(collection(db, "invites"), {
        fromId: P.id, fromName: P.name, fromRating: P.rating, fromCountry: P.country || "",
        toEmail: key, status: "pending", createdAt: serverTimestamp(),
      });
      pendingInvite = inviteRef;
      const stop = onSnapshot(doc(db, "invites", inviteRef.id), async snap => {
        if (snap.get("status") !== "accepted") return;
        pendingInvite = null;
        stop();
        const matchId = snap.get("matchId");
        const match = await getDoc(doc(db, "matches", matchId));
        const players = match.get("players") ?? {};
        const oppId = Object.keys(players).find(k => k !== P.id);
        deleteDoc(snap.ref).catch(() => {});
        onMatch({ matchId, oppId,
                  oppName: players[oppId]?.name ?? "Player",
                  oppRating: players[oppId]?.rating ?? 1000,
                  oppCountry: players[oppId]?.country ?? "",
                  deckIds: match.get("deckIds") ?? [] });
      });
      matchSubs.push(stop);
    },
    listenInvites(P, onChange) {
      const stop = onSnapshot(
        query(collection(db, "invites"),
              where("toEmail", "==", P.email), where("status", "==", "pending")),
        snap => onChange(snap.docs.map(d => ({
          id: d.id, fromId: d.get("fromId"),
          fromName: d.get("fromName") ?? "Player", fromRating: d.get("fromRating") ?? 1000,
          fromCountry: d.get("fromCountry") ?? "",
        }))));
      sessionSubs.push(stop);
    },
    // Abandon a sent challenge (cancel button / acceptance timeout): stop the
    // listener AND remove the invite doc, so the friend isn't left with a
    // ghost challenge that would start a match nobody is waiting in.
    async cancelInvite() {
      stopMatchSubs();
      if (pendingInvite) {
        const ref = pendingInvite;
        pendingInvite = null;
        await deleteDoc(ref).catch(() => {});
      }
    },
    async acceptInvite(invite, P) {
      const target = ladder(Math.round((P.rating + invite.fromRating) / 2));
      const deckIds = buildDeck({ targetDifficulty: target }).map(q => q[0]);
      const matchRef = await addDoc(collection(db, "matches"), {
        deckIds, targetDifficulty: target,
        players: { [P.id]: { name: P.name, rating: P.rating, country: P.country || "" },
                   [invite.fromId]: { name: invite.fromName, rating: invite.fromRating,
                                      country: invite.fromCountry || "" } },
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "invites", invite.id), { status: "accepted", matchId: matchRef.id });
      return { matchId: matchRef.id, oppId: invite.fromId,
               oppName: invite.fromName, oppRating: invite.fromRating,
               oppCountry: invite.fromCountry || "", deckIds };
    },

    // --- async duels ---
    // Challenger plays now, the friend plays whenever they're next on; Elo
    // settles from the rating snapshots taken at creation. Stored in `matches`
    // with kind:"async" + a pids array (covered by the rules' array-contains
    // clause), so no new collection or index is needed.
    async createAsyncDuel(P, opp, deckIds, target) {
      const ref = await addDoc(collection(db, "matches"), {
        kind: "async", pids: [P.id, opp.id], fromId: P.id, toId: opp.id,
        deckIds, targetDifficulty: target,
        players: { [P.id]: { name: P.name, rating: P.rating, country: P.country || "" },
                   [opp.id]: { name: opp.name, rating: opp.rating ?? 1000, country: opp.country || "" } },
        createdAt: serverTimestamp(),
      });
      return ref.id;
    },
    listenAsyncDuels(P, onChange) {
      const stop = onSnapshot(query(collection(db, "matches"), where("pids", "array-contains", P.id)),
        snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m.kind === "async")));
      sessionSubs.push(stop);
    },
    async submitAsyncResult(id, P, result) {
      await updateDoc(doc(db, "matches", id), { ["result_" + P.id]: result });
    },
    async markAsyncApplied(id, uid) {
      await updateDoc(doc(db, "matches", id), { ["applied_" + uid]: true });
    },
    async deleteAsyncDuel(id) { await deleteDoc(doc(db, "matches", id)).catch(() => {}); },

    // --- question quality reports (write-only; reviewed in the console) ---
    async reportQuestion(qid, P) {
      await addDoc(collection(db, "reports"),
        { qid, by: P.id, createdAt: serverTimestamp() });
    },

    // --- account deletion: reauth with the password, then remove the profile
    // doc, own friends links, lobby entry, and finally the auth user. ---
    async deleteAccount(P, password) {
      const user = auth.currentUser;
      if (!user) throw new Error("Not signed in.");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(P.email, password));
      stopSession(); stopMatchSubs();
      const mine = await getDocs(collection(db, "users", P.id, "friends")).catch(() => null);
      if (mine) await Promise.all(mine.docs.map(d => deleteDoc(d.ref).catch(() => {})));
      await deleteDoc(doc(db, "lobby", P.id)).catch(() => {});
      await deleteDoc(doc(db, "users", P.id));
      await deleteUser(user);
    },

    // --- live answer sync ---
    submitAnswer(matchId, P, answer) {
      updateDoc(doc(db, "matches", matchId), { ["answers_" + P.id]: arrayUnion(answer) })
        .catch(() => {});
    },
    listenOpponent(matchId, oppId, onAnswer) {
      let delivered = 0;
      const stop = onSnapshot(doc(db, "matches", matchId), snap => {
        const raw = snap.get("answers_" + oppId) ?? [];
        raw.sort((a, b) => a.q - b.q);
        while (delivered < raw.length) onAnswer(raw[delivered++]);
      });
      matchSubs.push(stop);
    },
    stopMatch() { stopMatchSubs(); },

    // --- friends ---
    async sendFriendRequest(email, P) {
      const key = email.toLowerCase().trim();
      if (key === P.email) throw new Error("That's your own email — you can't friend yourself.");
      const found = await getDocs(query(collection(db, "users"), where("email", "==", key), limit(1)));
      if (found.empty) throw new Error("No player found with that email.");
      const toId = found.docs[0].id;
      if (toId === P.id) throw new Error("That's you — you can't friend yourself.");
      const already = await getDoc(doc(db, "users", P.id, "friends", toId));
      if (already.exists()) throw new Error("You're already friends.");
      // Request ids are deterministic ("<from>__<to>") so the security rules can
      // verify an invite exists before letting the accepter join a friend list.
      const reverse = await getDoc(doc(db, "friendRequests", `${toId}__${P.id}`));
      if (reverse.exists()) {                       // they already invited you — just accept
        await this.acceptFriendRequest({ fromId: toId, toId: P.id }, P);
        return found.docs[0].get("name") ?? "Player";
      }
      const dup = await getDoc(doc(db, "friendRequests", `${P.id}__${toId}`));
      if (dup.exists()) throw new Error("Request already sent.");
      await setDoc(doc(db, "friendRequests", `${P.id}__${toId}`), {
        fromId: P.id, fromName: P.name, fromEmail: P.email, fromRating: P.rating,
        toId, toEmail: key, createdAt: serverTimestamp(),
      });
      return found.docs[0].get("name") ?? "Player";
    },
    listenFriendRequests(P, onChange) {
      const stop = onSnapshot(query(collection(db, "friendRequests"), where("toId", "==", P.id)),
        snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      sessionSubs.push(stop);
    },
    async acceptFriendRequest(req, P) {
      const now = serverTimestamp();
      // Write both friend docs while the request still exists (the rule requires
      // it), then remove the request.
      await setDoc(doc(db, "users", P.id, "friends", req.fromId), { since: now });
      await setDoc(doc(db, "users", req.fromId, "friends", P.id), { since: now });
      await deleteDoc(doc(db, "friendRequests", `${req.fromId}__${P.id}`)).catch(() => {});
    },
    async declineFriendRequest(req) {
      await deleteDoc(doc(db, "friendRequests", req.id)).catch(() => {});
    },
    async listFriends(P) {
      const mine = await getDocs(collection(db, "users", P.id, "friends"));
      const docs = await Promise.all(mine.docs.map(d => getDoc(doc(db, "users", d.id))));
      return docs.filter(d => d.exists()).map(d => ({
        id: d.id, name: d.get("name") ?? "Player", rating: d.get("rating") ?? 1000,
        country: d.get("country") ?? "", lastActive: d.get("lastActive") ?? 0,
        photo: d.get("photo") ?? null, avatarSeed: d.get("avatarSeed") ?? null,
        email: d.get("email"), pubKey: d.get("pubKey") ?? null,
      })).sort((a, b) => a.name.localeCompare(b.name));
    },
    listenFriends(P, onChange) {
      const stop = onSnapshot(collection(db, "users", P.id, "friends"),
        async () => onChange(await this.listFriends(P)));
      sessionSubs.push(stop);
    },
    // The friend's CURRENT public key — fetched fresh when opening a chat, since
    // it can change (a re-key on their device) without our friends list seeing it.
    async getPubKey(uid) {
      const s = await getDoc(doc(db, "users", uid));
      return s.exists() ? (s.get("pubKey") || null) : null;
    },
    async getProfile(uid) {
      const s = await getDoc(doc(db, "users", uid));
      return s.exists() ? s.data() : null;
    },
    // Presence heartbeat: mark myself active now (used to decide live vs async).
    async heartbeat(uid) {
      await updateDoc(doc(db, "users", uid), { lastActive: Date.now() }).catch(() => {});
    },

    // --- daily challenge ---
    async submitDaily(date, P, score, correct) {
      await setDoc(doc(db, "daily", date, "scores", P.id),
        { name: P.name, country: P.country || "", score, correct, createdAt: serverTimestamp() });
    },
    async getDailyScores(date, ids) {
      const docs = await Promise.all(ids.map(id => getDoc(doc(db, "daily", date, "scores", id))));
      return docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() }));
    },

    // Look up a player by email (to challenge them live).
    async findUser(email) {
      const key = email.toLowerCase().trim();
      const found = await getDocs(query(collection(db, "users"), where("email", "==", key), limit(1)));
      if (found.empty) return null;
      const d = found.docs[0];
      return { id: d.id, name: d.get("name") ?? "Player", rating: d.get("rating") ?? 1000,
               country: d.get("country") ?? "", photo: d.get("photo") ?? null, email: key,
               lastActive: d.get("lastActive") ?? 0 };
    },

    // --- encrypted chat (payloads are ciphertext; see e2e.js) ---
    sendMessage(a, b, payload) {
      return addDoc(collection(db, "chats", chatId(a, b), "messages"),
        { ...payload, createdAt: serverTimestamp() });
    },
    listenMessages(a, b, onMsgs) {
      // Not a session sub: the app owns this and stops it on leaving the chat.
      return onSnapshot(query(collection(db, "chats", chatId(a, b), "messages"), orderBy("createdAt")),
        snap => onMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    },
    // Read receipts: each party records when they last read the chat, on the
    // chat doc. Used to show ✓✓ and to compute unread counts.
    markRead(a, b) {
      return setDoc(doc(db, "chats", chatId(a, b)),
        { ["read_" + a]: serverTimestamp() }, { merge: true }).catch(() => {});
    },
    listenChatMeta(a, b, onMeta) {
      return onSnapshot(doc(db, "chats", chatId(a, b)), snap => onMeta(snap.data() || {}));
    },
    // Latest message + my read time for one friend, to drive unread badges.
    listenLatest(me, friendId, onUpdate) {
      const cid = chatId(me, friendId);
      let latest = null, meta = {};
      const emit = () => onUpdate({ latest, readAt: meta["read_" + me] ?? null });
      const s1 = onSnapshot(query(collection(db, "chats", cid, "messages"),
        orderBy("createdAt", "desc"), limit(1)),
        snap => { latest = snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null; emit(); });
      const s2 = onSnapshot(doc(db, "chats", cid), snap => { meta = snap.data() || {}; emit(); });
      const stop = () => { s1(); s2(); };
      sessionSubs.push(stop);
      return stop;
    },
  };
}

// ---------------- app state & shell ----------------
const $ = id => document.getElementById(id);
const screen = $("screen"), tabs = $("tabs"), arena = $("arena"), overlay = $("overlay"),
      chatEl = $("chat");
let backend = localBackend, P = null, tab = "play", invites = [], subject = null;
let toastTimer;
let myKeys = null, friends = [], friendReqs = [], friendsLoaded = false;  // friends + E2E chat
let asyncDuels = []; const asyncApplying = new Set();     // play-by-mail duels
let chatFriend = null, chatUnsub = null, chatMetaUnsub = null, chatChannel = null, chatCache = new Map();
let chatMeta = {};                                       // read receipts for the open chat
const latestStops = new Map(), unreadBy = new Map(), lastSeenMsg = new Map();
let viewingFriend = null;                                // friend profile being viewed
let lastMatch = null;                                    // for the Rematch button
let pending = null;                                     // awaiting email verification

const PENDING_KEY = "mindspar-pending";
function setPending(p) {
  pending = p;
  if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  else localStorage.removeItem(PENDING_KEY);
}

// ---- theme (dark by default; the choice persists per browser) ----
let theme = localStorage.getItem("mindspar-theme") || "dark";
function applyTheme(t) {
  theme = t;
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("mindspar-theme", t);
  // Keep the browser/OS chrome (status bar, PWA title bar) matched to the
  // chosen theme, not just the OS preference.
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    m.removeAttribute("media");
    m.setAttribute("content", t === "dark" ? "#0e0f15" : "#f6f6f9");
  });
}
applyTheme(theme);

// ---- idle auto sign-out: 30 minutes with no interaction, an industry-standard
// session timeout. Any pointer/key/touch activity resets the clock. ----
const IDLE_MS = 30 * 60 * 1000;
let idleTimer;
function armIdleTimer() {
  clearTimeout(idleTimer);
  // Installed (home-screen) app stays signed in until you explicitly sign out —
  // it's your personal device. The idle timeout only guards browser sessions,
  // which may be on a shared/public computer.
  if (!P || isStandalone()) return;
  idleTimer = setTimeout(async () => {
    if (!P) return;
    await doSignOut();
    toast("Signed out after 30 minutes of inactivity.");
  }, IDLE_MS);
}
["pointerdown", "keydown", "touchstart", "visibilitychange"].forEach(ev =>
  window.addEventListener(ev, () => { if (P && document.visibilityState !== "hidden") armIdleTimer(); },
    { passive: true }));

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

$("t-play").onclick = () => setTab("play");
$("t-friends").onclick = () => setTab("friends");
$("t-prof").onclick = () => setTab("prof");
let animateNext = false;                     // one-shot slide-in on tab switches
function setTab(t) {
  tab = t;
  viewingFriend = null;
  $("t-play").classList.toggle("on", t === "play");
  $("t-friends").classList.toggle("on", t === "friends");
  $("t-prof").classList.toggle("on", t === "prof");
  animateNext = true;
  render();
}

async function boot() {
  if (firebaseConfig) {
    try { backend = await makeFirebaseBackend(firebaseConfig); }
    catch (e) { console.error(e); toast("Firebase failed to load — running offline."); }
  }
  try {
    const restored = await backend.restore();
    if (restored && restored.pendingVerification) {
      // Signed in but not verified — resume the verification gate.
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(PENDING_KEY)); } catch { /* ignore */ }
      setPending(saved || { uid: restored.uid, email: restored.email });
      return renderVerify();
    }
    P = restored;
    if (P && backend.isLive) { await setupIdentity(null); await startSession(); }
  } catch (e) {
    // A stale or broken session (e.g. a deleted account, or a permissions
    // change) must never leave a blank page: drop the session and show sign-in.
    console.error("Session restore failed — clearing it.", e);
    try { await backend.signOut(); } catch { /* ignore */ }
    P = null;
  }
  armIdleTimer();
  render();
}

// Bring up the live invite/friend feeds and per-friend unread listeners.
async function startSession() {
  backend.listenInvites(P, list => { invites = list; if (tab === "play" && !arena.classList.contains("on")) render(); });
  backend.listenAsyncDuels(P, list => {
    asyncDuels = list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    settleAsyncDuels();
    if (tab === "play" && !arena.classList.contains("on")) render();
  });
  backend.listenFriendRequests(P, list => { friendReqs = list; updateFriendBadge(); if (tab === "friends") renderFriends(); });
  backend.listenFriends(P, list => {
    friends = list;
    friendsLoaded = true;
    watchUnread();
    if (tab === "friends" && !chatFriend) renderFriends();
    else if (tab === "prof") renderProfile();
  });
  startHeartbeat();
}

let heartbeatTimer;
function startHeartbeat() {
  if (!backend.isLive || !P) return;
  backend.heartbeat(P.id);
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (P && document.visibilityState === "visible") backend.heartbeat(P.id);
  }, 25000);
}

// One "latest message + my read time" listener per friend, so we can show
// unread badges and pop an alert when a new message lands.
function watchUnread() {
  for (const f of friends) {
    if (latestStops.has(f.id)) continue;
    const stop = backend.listenLatest(P.id, f.id, ({ latest, readAt }) => {
      const rMs = readAt?.toMillis ? readAt.toMillis() : 0;
      const mMs = latest?.createdAt?.toMillis ? latest.createdAt.toMillis() : 0;
      const unread = !!latest && latest.from === f.id && mMs > rMs;
      const was = unreadBy.get(f.id);
      // The first callback per friend is the session's baseline: an old unread
      // gets the badge, but NOT a "new message" toast on every sign-in — only
      // messages that actually arrive during this session announce themselves.
      const isBaseline = !lastSeenMsg.has(f.id);
      unreadBy.set(f.id, unread);
      if (unread && !isBaseline && mMs > (lastSeenMsg.get(f.id) || 0) && chatFriend?.id !== f.id) {
        notifyMessage(f);
      }
      lastSeenMsg.set(f.id, mMs);
      updateFriendBadge();
      if (tab === "friends" && !chatFriend && (unread !== was)) renderFriends();
    });
    latestStops.set(f.id, stop);
  }
}

// Establish this session's chat identity. With a password (sign-in / sign-up)
// we can unwrap the stored key or mint one; on a silent restore we rely on the
// key cached on this device. The published public key never changes per device,
// so messages stay readable everywhere you log in.
// `trusted` = the password was just verified by Firebase (sign-in). Only then do
// we mint a fresh identity if the wrapped key won't unwrap — that's the
// password-was-reset case. On the untrusted enable-chat prompt a bad password
// simply fails (we don't want a typo to nuke the key).
async function setupIdentity(password, trusted = false) {
  if (!backend.isLive || !P) { myKeys = null; return; }
  let cache = cachedPriv(P.id);
  // Stale local key (identity re-established elsewhere) → re-derive from password.
  if (cache && P.pubKey && JSON.stringify(cache.pub) !== JSON.stringify(P.pubKey)) cache = null;
  try {
    if (P.encPriv && P.pubKey && !cache && password) {
      try {
        const priv = await unwrapIdentity(password, P);
        cache = { pub: P.pubKey, priv };
        cachePriv(P.id, cache);
      } catch (e) {
        // Wrapped key won't open with this password. After a verified sign-in
        // that means the password changed/reset → re-establish a new identity.
        if (trusted) cache = await mintIdentity(password);
      }
    } else if (!P.encPriv && password) {
      cache = await mintIdentity(password);      // new or legacy account
    }
  } catch (e) { console.error("Chat identity setup failed", e); }
  myKeys = cache && cache.priv ? { pub: cache.pub, priv: cache.priv } : null;
}

async function mintIdentity(password) {
  const idn = await createIdentity(password);
  P.pubKey = idn.pub; P.encPriv = idn.encPriv;
  P.encPrivIv = idn.encPrivIv; P.encPrivSalt = idn.encPrivSalt;
  await backend.publishIdentity(P.id, idn);
  const c = { pub: idn.pub, priv: idn.priv };
  cachePriv(P.id, c);
  return c;
}

const cachedPriv = uid => { try { return JSON.parse(localStorage.getItem("mindspar-e2e-" + uid)); } catch { return null; } };
const cachePriv = (uid, obj) => localStorage.setItem("mindspar-e2e-" + uid, JSON.stringify(obj));

// Alert about a new message: an in-app toast, plus a real OS notification if the
// tab is in the background and the user has granted permission.
function notifyMessage(friend) {
  toast(`New message from ${friend.name}`);
  if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
    try { new Notification("Mindspar", { body: `New message from ${friend.name}`, tag: "msg-" + friend.id }); }
    catch { /* ignore */ }
  }
}

function updateFriendBadge() {
  const anyUnread = [...unreadBy.values()].some(Boolean);
  const badge = $("fr-badge");
  if (badge) badge.style.display = (friendReqs.length || anyUnread) ? "block" : "none";
}

async function doSignOut() {
  leaveChat();
  clearInterval(heartbeatTimer);
  latestStops.forEach(s => s()); latestStops.clear();
  unreadBy.clear(); lastSeenMsg.clear();
  await backend.signOut();
  P = null; invites = []; friends = []; friendReqs = []; friendsLoaded = false; myKeys = null;
  asyncDuels = []; asyncApplying.clear(); lastRun = null; lastResults = null;
  setPending(null);
  chatCache.clear();
  clearTimeout(idleTimer);
  updateFriendBadge?.();
  render();
}

async function persist() { try { await backend.save(P); } catch (e) { console.error(e); } }

function render() {
  if (!P) { tabs.style.display = "none"; return renderAuth(); }
  tabs.style.display = "flex";
  updateFriendBadge();
  if (tab === "friends") renderFriends();
  else if (tab === "prof") renderProfile();
  else renderHome();
  if (animateNext) {                          // only on explicit tab switches,
    animateNext = false;                      // never on live-listener repaints
    screen.firstElementChild?.classList.add("tabin");
  }
}

// A password input with a show/hide eye toggle.
function pwField(id, ph, ac = "current-password") {
  return `<div class="pw-wrap">
    <input id="${id}" type="password" placeholder="${ph}" autocomplete="${ac}">
    <button type="button" class="pw-eye" id="${id}-eye" aria-label="Show password">${ic("eye", "20px")}</button>
  </div>`;
}
function wirePwEye(id) {
  const inp = $(id), btn = $(id + "-eye");
  if (!inp || !btn) return;
  btn.onclick = () => {
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    btn.innerHTML = ic(show ? "eyeOff" : "eye", "20px");
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  };
}

// ---------------- auth ----------------
// Default to sign-in (most opens are returning players); new players tap the
// "Create an account" link. Standard for mainstream apps.
let authMode = "signin";
function renderAuth() {
  const signup = authMode === "signup";
  screen.innerHTML = `<div class="pad" style="justify-content:center;gap:13px">
    <div style="text-align:center;margin-bottom:6px">
      <div class="serif" style="font-size:42px;font-weight:600">Mindspar</div>
      <div style="font-size:13px;color:var(--ink2);margin-top:6px;line-height:1.5">
        Head-to-head thinking duels.<br>${N} questions · 8 domains · speed counts</div>
    </div>
    ${signup ? `<input id="a-name" placeholder="Your name" autocomplete="name">` : ""}
    <input id="a-email" type="email" placeholder="Email" autocomplete="email">
    ${pwField("a-pass", "Password (6+ characters)", signup ? "new-password" : "current-password")}
    ${signup ? `
    <select id="a-country" class="select">
      <option value="" disabled selected>Your country</option>
      ${COUNTRIES.map(([c, n]) => `<option value="${c}">${flagOf(c)}  ${esc(n)}</option>`).join("")}
    </select>
    <div class="cardbox" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <label style="font-size:13px;color:var(--ink2)" for="a-dob">Date of birth</label>
      <input id="a-dob" type="date" max="${new Date().toISOString().slice(0, 10)}">
      <label class="check"><input id="a-adult" type="checkbox"> I confirm I am 18 years or older</label>
    </div>` : ""}
    <div class="err" id="a-err"></div>
    <button class="primary" id="a-go">${signup ? "Create Account" : "Sign In"}</button>
    ${!signup && backend.isLive ? `<button class="ghost" id="a-forgot">Forgot password?</button>` : ""}
    <button class="ghost" id="a-switch">${signup ? "Already have an account? Sign in" : "New here? Create an account"}</button>
    ${backend.isLive
      ? (signup ? `<div class="fine">We'll email you a link to confirm your address — you'll verify it before playing.</div>` : "")
      : `<div class="fine">Running offline — your profile stays in this browser. Bot duels and the daily challenge work fully.</div>`}
    <div class="fine">Mindspar is for adults 18 and over · <a href="privacy.html" style="color:inherit">Privacy</a></div>
    ${installBanner()}
  </div>`;
  $("a-switch").onclick = () => { authMode = signup ? "signin" : "signup"; renderAuth(); };
  $("a-go").onclick = submitAuth;
  wirePwEye("a-pass");
  const forgot = $("a-forgot");
  if (forgot) forgot.onclick = () => forgotPassword($("a-email").value.trim());
  wireInstallBanner();
}

// Send a password-reset email. Because chat keys are wrapped with the password,
// resetting means the old chat key can't be unwrapped — the next sign-in with
// the new password re-establishes a fresh chat identity automatically
// (setupIdentity's trusted path), so old messages become unreadable but new
// ones work. We tell the user that.
function forgotPassword(prefill) {
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel">
    <b>Reset your password</b>
    <span style="font-size:12.5px;color:var(--ink2);line-height:1.5">We'll email you a reset link.
      Heads up: because your chats are end-to-end encrypted with your password, resetting it starts
      a fresh chat key — past messages won't be readable, but new chats work normally.</span>
    <input id="fp-email" type="email" placeholder="Your email" value="${esc(prefill || "")}">
    <div class="err" id="fp-err"></div>
    <button class="primary" id="fp-go">Send reset link</button>
    <button class="ghost" id="fp-close">Cancel</button></div>`;
  $("fp-close").onclick = () => overlay.classList.remove("on");
  const go = async () => {
    const email = $("fp-email").value.trim();
    if (!email) return $("fp-err").textContent = "Enter your email.";
    try {
      await backend.resetPassword(email);
      overlay.classList.remove("on");
      toast("Reset link sent — check your email.");
    } catch (e) { $("fp-err").textContent = e.message.replace("Firebase: ", ""); }
  };
  $("fp-go").onclick = go;
  $("fp-email").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
}

async function submitAuth() {
  const err = $("a-err");
  const email = $("a-email").value.trim(), password = $("a-pass").value;
  try {
    if (authMode === "signin") {
      P = await backend.signIn(email, password);
      if (backend.isLive) await setupIdentity(password, true);
    } else {
      const name = $("a-name").value.trim(), dob = $("a-dob").value;
      const country = $("a-country").value;
      if (!name) return err.textContent = "Enter your name.";
      if (!email || password.length < 6) return err.textContent = "Enter your email and a 6+ character password.";
      if (!country) return err.textContent = "Choose your country.";
      if (!dob) return err.textContent = "Enter your date of birth.";
      if (yearsOld(dob) < 18) return err.textContent = "Mindspar is for adults 18 and over.";
      if (!$("a-adult").checked) return err.textContent = "Please confirm you are 18 or older.";
      const result = await backend.signUp({ name, email, password, dob, country });
      if (result && result.pendingVerification) {   // online: must confirm email first
        // Build the E2E identity now (we have the password); stash the wrapped
        // key for completeSignup to store, and cache the private key on-device.
        const idn = await createIdentity(password);
        cachePriv(result.uid, { pub: idn.pub, priv: idn.priv });
        setPending({ uid: result.uid, name, email: email.toLowerCase(), dob, country,
          identity: { pubKey: idn.pub, encPriv: idn.encPriv, encPrivIv: idn.encPrivIv, encPrivSalt: idn.encPrivSalt } });
        return renderVerify();
      }
      P = result;                                    // offline: profile created directly
    }
    if (backend.isLive) await startSession();
    armIdleTimer();
    render();
  } catch (e) { err.textContent = e.message.replace("Firebase: ", ""); }
}

// ---- email verification gate ----
function renderVerify() {
  tabs.style.display = "none";
  const email = pending?.email || "your email";
  screen.innerHTML = `<div class="pad" style="justify-content:center;gap:14px;text-align:center">
    <div style="font-size:52px">✉️</div>
    <div class="serif" style="font-size:28px;font-weight:600">Confirm your email</div>
    <div style="font-size:14px;color:var(--ink2);line-height:1.6">
      We sent a verification link to<br><b style="color:var(--ink)">${esc(email)}</b>.<br>
      Click it, then come back and continue. This keeps Mindspar to real,
      verified players only.</div>
    <div class="err" id="v-err"></div>
    <button class="primary" id="v-cont">I've verified — continue</button>
    <button class="ghost" id="v-resend">Resend the email</button>
    <button class="ghost" id="v-cancel">Use a different account</button>
  </div>`;
  $("v-cont").onclick = async () => {
    const err = $("v-err");
    err.textContent = "";
    try {
      const ok = await backend.refreshVerified();
      if (!ok) return err.textContent = "Not verified yet — click the link in your email, then try again.";
      P = await backend.completeSignup(pending);
      setPending(null);
      if (backend.isLive) { await setupIdentity(null); await startSession(); }
      armIdleTimer();
      render();
    } catch (e) { err.textContent = e.message.replace("Firebase: ", ""); }
  };
  $("v-resend").onclick = async () => {
    try { await backend.resendVerification(); toast("Verification email sent."); }
    catch (e) { toast(e.message); }
  };
  $("v-cancel").onclick = async () => { setPending(null); await doSignOut(); };
}

// ---------------- home ----------------
function renderHome() {
  screen.innerHTML = `<div class="pad">
    <div>
      <div class="serif" style="font-size:26px;font-weight:600">Ready, ${esc(P.name.split(" ")[0])}?</div>
      <div style="font-size:12.5px;color:var(--ink2);margin-top:4px">${N} questions · 8 domains · speed counts</div>
    </div>
    <div><span class="tierpill">${tier(P.rating).toUpperCase()} <i>${P.rating}</i></span></div>
    ${invites.map(inv => `
      <div class="invitecard"><div class="row">
        <span style="font-size:14px"><b>${flagOf(inv.fromCountry)} ${esc(inv.fromName)}</b> challenged you
          <span style="color:var(--ink2)">· ${inv.fromRating}</span></span>
        <button class="smallbtn" data-inv="${inv.id}">Accept</button>
      </div></div>`).join("")}
    ${asyncCards()}
    <button class="playrow" id="h-daily">
      <span class="sig" style="background:linear-gradient(135deg,#f6b73c,#ea5f2d);color:#fff">${ic("sun")}</span>
      <span><b>Daily Challenge${dailyStreakNow() > 1 ? ` <i style="font-style:normal;font-weight:600;font-size:11.5px;color:#e8843c">🔥 ${dailyStreakNow()}</i>` : ""}</b><span>${P.dailyDone === todayKey()
        ? `Done — you scored ${P.dailyScore}. Tap for the leaderboard`
        : `Everyone plays the same ${N} today — compare with friends`}</span></span></button>
    <button class="playrow" id="h-quick">
      <span class="sig hot">${ic("bolt")}</span>
      <span><b>Quick Match</b><span>${backend.isLive
        ? `A player near your rating · ${tier(P.rating)} band`
        : "Not available offline — duel a bot instead"}</span></span></button>
    <button class="playrow" id="h-invite">
      <span class="sig">${ic("send")}</span>
      <span><b>Challenge a Friend</b><span>Play live when they're online</span></span></button>
    <div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:14px">
        <span class="sig">${ic("bot")}</span>
        <span><b style="font-size:15px">Duel a Bot</b><br>
        <span style="font-size:12.5px;color:var(--ink2)">Pick a mind — and a subject</span></span>
      </div>
      <div class="chips">${[["All", "#5457e8", null],
        ...Object.entries(DOMAINS).map(([k, v]) => [v[0], v[1], k])].map(([t, c, k]) =>
        `<button class="chip" data-dom="${k ?? ""}" style="${subject === k
          ? `background:${c};color:#fff` : `background:${c}18;color:${c}`}">${t}</button>`).join("")}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${BOTS.map(b => `
        <button class="playrow" style="box-shadow:none;padding:12px 14px" data-bot="${b.id}">
          <span class="sig" style="width:40px;height:40px">${ic(BOT_ICON[b.id])}</span>
          <span><b style="font-size:14px">${b.name}
            <i style="font-style:normal;font-weight:500;font-size:11px;color:var(--ink2)">· ${b.rating}</i></b>
          <span>${b.tag}</span></span></button>`).join("")}</div>
    </div>
    ${P.played >= 1 ? installBanner() : ""}
  </div>`;
  wireInstallBanner();
  maybeIntro();
  $("h-daily").onclick = startDaily;
  $("h-quick").onclick = quickMatch;
  $("h-invite").onclick = inviteFlow;
  screen.querySelectorAll("[data-dom]").forEach(el =>
    el.onclick = () => { subject = el.dataset.dom || null; renderHome(); });
  screen.querySelectorAll("[data-bot]").forEach(el =>
    el.onclick = () => startBotDuel(el.dataset.bot));
  screen.querySelectorAll("[data-inv]").forEach(el =>
    el.onclick = () => acceptInvite(el.dataset.inv));
  screen.querySelectorAll("[data-async-play]").forEach(el =>
    el.onclick = () => { const d = asyncDuels.find(x => x.id === el.dataset.asyncPlay); if (d) startAsyncRun(d); });
  screen.querySelectorAll("[data-async-cancel]").forEach(el =>
    el.onclick = async () => { await backend.deleteAsyncDuel(el.dataset.asyncCancel); toast("Challenge withdrawn."); });
  screen.querySelectorAll("[data-news-x]").forEach(el =>
    el.onclick = () => { (P.asyncNews || []).splice(+el.dataset.newsX, 1); persist(); renderHome(); });
}

// One-time welcome: what a duel is, what the rating means, what unlocks.
// Shown once per browser, the first time the home screen renders.
function maybeIntro() {
  if (!P || localStorage.getItem("mindspar-intro")) return;
  localStorage.setItem("mindspar-intro", "1");
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel" style="width:330px;align-items:stretch;text-align:left">
    <div class="serif" style="font-size:24px;font-weight:600;text-align:center">Welcome to Mindspar</div>
    <div class="intro-row"><span class="intro-ic">${ic("bolt", "18px")}</span>
      <span><b>Duel in ${N} questions</b>8 domains, 18 seconds each — accuracy and speed both score.</span></div>
    <div class="intro-row"><span class="intro-ic">${ic("play", "18px")}</span>
      <span><b>Your rating is your level</b>Every duel — bot or human — moves your Elo rating through the tiers, Novice to Luminary.</span></div>
    <div class="intro-row"><span class="intro-ic">${ic("bulb", "18px")}</span>
      <span><b>Unlock your Mindspar Score</b>${MIN_ANSWERS} answers calibrate an IQ-style score, normalized for your age group.</span></div>
    <button class="primary" id="in-go">Let's duel</button></div>`;
  $("in-go").onclick = () => overlay.classList.remove("on");
}

// ---------------- matchmaking ----------------
function searchingPanel(text, sub, onCancel) {
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel"><div class="spin"></div>
    <b>${text}</b><span style="font-size:12.5px;color:var(--ink2)">${sub}</span>
    <button class="ghost" id="ov-cancel">Cancel</button></div>`;
  $("ov-cancel").onclick = onCancel;
}

async function quickMatch() {
  if (!backend.isLive) return toast("Online play isn't available offline — duel a bot!");
  let matched = false;
  // Nobody claimed us within 30s → say so honestly instead of spinning forever.
  const giveUp = setTimeout(async () => {
    if (matched || !overlay.classList.contains("on")) return;
    await backend.cancelSearch(P);
    const nearest = BOTS.slice().sort((a, b) =>
      Math.abs(a.rating - P.rating) - Math.abs(b.rating - P.rating))[0];
    overlay.innerHTML = `<div class="panel">
      <b>No opponents online right now</b>
      <span style="font-size:12.5px;color:var(--ink2);line-height:1.5">It's a quiet moment in the
        ${tier(P.rating)} band. ${esc(nearest.name)} (${nearest.rating}) is closest to your rating
        and always ready — or challenge a friend to an async duel they can play later.</span>
      <button class="primary" id="nm-bot">Duel ${esc(nearest.name)}</button>
      <button class="ghost" id="nm-close">Close</button></div>`;
    $("nm-close").onclick = () => overlay.classList.remove("on");
    $("nm-bot").onclick = () => { overlay.classList.remove("on"); startBotDuel(nearest.id); };
  }, 30000);
  searchingPanel("Finding an opponent…",
    `Searching the ${tier(P.rating)} band (${P.rating - 200}–${P.rating + 200})`,
    async () => { clearTimeout(giveUp); overlay.classList.remove("on"); await backend.cancelSearch(P); });
  try {
    await backend.findMatch(P, human => {
      matched = true;
      clearTimeout(giveUp);
      if (!overlay.classList.contains("on")) return;
      overlay.classList.remove("on");
      startHumanDuel(human);
    });
  } catch (e) { clearTimeout(giveUp); overlay.classList.remove("on"); toast(e.message); }
}

function inviteFlow() {
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel">
    <b>Challenge a Friend</b>
    <span style="font-size:12px;color:var(--ink2);line-height:1.5">You'll both play the same ${N} questions
      live — they just need to be online to accept.</span>
    <input id="inv-email" type="email" placeholder="Friend's email" autocomplete="off">
    <div class="err" id="inv-err"></div>
    <button class="primary" id="inv-send">Start challenge</button>
    <button class="ghost" id="inv-close">Close</button></div>`;
  $("inv-close").onclick = () => overlay.classList.remove("on");
  $("inv-send").onclick = async () => {
    const email = $("inv-email").value.trim();
    if (!email) return;
    if (!backend.isLive) return $("inv-err").textContent = "Online play isn't available offline.";
    $("inv-err").textContent = "Finding player…";
    try {
      const opp = await backend.findUser(email);
      if (!opp) return $("inv-err").textContent = "No player found with that email.";
      if (opp.id === P.id) return $("inv-err").textContent = "That's your own email.";
      overlay.classList.remove("on");
      challengeFriend(opp);
    } catch (e) { $("inv-err").textContent = e.message; }
  };
}


async function acceptInvite(id) {
  const invite = invites.find(i => i.id === id);
  if (!invite) return;
  try {
    const human = await backend.acceptInvite(invite, P);
    startHumanDuel(human);
  } catch (e) { toast(e.message); }
}

// ---------------- duel engine ----------------
let cards, idx, my, opp, timer, t0, botTimers, OPP, liveMatch;
let lastRun = null, lastResults = null;   // for the answer-review + share screens
// Solo runs (daily challenge, async duel) have no live opponent: `solo` on,
// `soloTitle` for the countdown, `soloEnd` called when the deck is finished.
let solo = false, soloTitle = "", soloEnd = null;

// A short "flag / bot" tag shown before the opponent's name.
const oppTag = o => o && o.isBot ? "🤖" : (o && o.country ? flagOf(o.country) : "");

// Daily challenge: a solo, timed run through today's shared deck.
function startDaily() {
  if (P.dailyDone === todayKey()) return showDailyResults();
  solo = true; soloTitle = "Today's Challenge"; soloEnd = endDaily;
  OPP = null; liveMatch = null; lastMatch = null;
  cards = dailyDeck();
  beginDuel(() => {});
}

function startBotDuel(botId) {
  solo = false;
  const bot = BOTS.find(b => b.id === botId);
  OPP = { name: bot.name, rating: bot.rating, isBot: true, botId };
  lastMatch = { bot: botId };
  liveMatch = null;
  cards = buildDeck({ domain: subject, targetDifficulty: ladder(P.rating), seen: freshSeen(P) });
  beginDuel(() => { // simulated feed: the bot races the deck on its own clock
    let cumulative = 2.4;
    cards.forEach(q => {
      const ok = Math.random() < (bot.acc[q[1]] ?? .6);
      const secs = Math.min(bot.min + Math.random() * (bot.max - bot.min), LIMIT - .2);
      cumulative += secs + 1.1;
      botTimers.push(setTimeout(() => receiveOpponent({ ok, pts: scoreFor(ok, secs * 1000) }), cumulative * 1000));
    });
  });
}

function startHumanDuel(human) {
  solo = false;
  OPP = { id: human.oppId, name: human.oppName, rating: human.oppRating, country: human.oppCountry || "" };
  lastMatch = { friendId: human.oppId };
  liveMatch = human;
  cards = human.deckIds.map(id => qById[id]).filter(Boolean);
  if (cards.length === 0) return toast("Match deck failed to load.");
  beginDuel(() => {
    backend.listenOpponent(human.matchId, human.oppId, a =>
      receiveOpponent({ ok: a.c, pts: a.p }));
  });
}

// The pre-duel screen: a proper face-off (avatars, names, ratings) rather
// than a line of text — solo runs (daily/async) keep their simple title.
function faceOffHTML() {
  if (solo) return `<div class="vs">${esc(soloTitle)}</div>`;
  const oppAv = OPP.isBot
    ? `<span class="favBig ic">${ic(BOT_ICON[OPP.botId] || "bot", "30px")}</span>`
    : `<span class="favBig">${characterAvatar(OPP.id || OPP.name)}</span>`;
  return `<div class="face">
    <div class="fp"><span class="favBig">${avatarHTML(P)}</span><b>You</b><span>${P.rating}</span></div>
    <div class="vsbig">vs</div>
    <div class="fp">${oppAv}<b>${oppTag(OPP)} ${esc(OPP.name)}</b><span>${OPP.rating}</span></div>
  </div>`;
}

function beginDuel(startFeed) {
  idx = 0; my = []; opp = []; botTimers = [];
  arena.classList.add("on");
  startFeed();
  let n = 3;
  const face = faceOffHTML();
  const countdown = () => {
    arena.innerHTML = `<div class="center">${face}<div class="big">${n}</div></div>`;
    if (n-- > 1) { sfx.count(); setTimeout(countdown, 800); }
    else { sfx.go(); setTimeout(ask, 800); }
  };
  countdown();
}

function receiveOpponent(answer) {
  opp.push(answer);
  paintBoard();
}

// Option strings that start with "<svg" are generator-produced figures
// (trusted, committed content) and render as-is; everything else is escaped.
const optHTML = o => String(o).startsWith("<svg") ? o : esc(o);

function ask() {
  const q = cards[idx], [label, color] = DOMAINS[q[1]];
  const visual = !!q[6];
  arena.innerHTML = `
    <div class="tbar"><i id="tfill"></i></div>
    <div class="meta"><span>Q${idx + 1}/${cards.length}</span>
      <span class="dchip" style="color:${color};background:${color}2e">${label}</span></div>
    <div class="prompt${visual ? " has-fig" : ""}">${visual ? `<div class="fig">${q[6]}</div>` : ""}
      <div>${esc(q[3])}</div></div>
    <div class="opts">${q[4].map((o, i) =>
      `<button class="opt${String(o).startsWith("<svg") ? " vopt" : ""}" data-i="${i}">${optHTML(o)}</button>`).join("")}</div>
    <div class="board" id="board"></div>`;
  arena.querySelectorAll(".opt").forEach(el => el.onclick = () => pick(+el.dataset.i));
  paintBoard();
  t0 = Date.now();
  const fill = $("tfill");
  let lastTick = 99;
  clearInterval(timer);
  timer = setInterval(() => {
    const left = Math.max(0, LIMIT - (Date.now() - t0) / 1000);
    fill.style.width = (left / LIMIT * 100) + "%";
    fill.style.background = left / LIMIT > .3 ? "var(--iris)" : "var(--bad)";
    const whole = Math.ceil(left);
    if (whole <= 3 && whole >= 1 && whole !== lastTick) { lastTick = whole; sfx.tick(); }
    if (left <= 0) pick(null);
  }, 50);
}

function pick(i) {
  clearInterval(timer);
  const q = cards[idx], ms = Math.min(Date.now() - t0, LIMIT * 1000), ok = i === q[5];
  const answer = { ok, ms, pts: scoreFor(ok, ms), pick: i };
  if (ok) sfx.correct(); else if (i === null) sfx.timeout(); else sfx.wrong();
  my.push(answer);
  if (liveMatch) backend.submitAnswer(liveMatch.matchId, P,
    { q: idx, s: i ?? -1, c: ok, t: ms, p: answer.pts });
  arena.querySelectorAll(".opt").forEach((el, j) => {
    el.disabled = true;
    if (j === q[5]) el.classList.add("correct");
    else if (j === i) el.classList.add("wrong");
    else el.classList.add("dim");
  });
  paintBoard();
  if (ok) {                                   // floating "+points" over your panel
    const side = $("board")?.querySelector(".side.me");
    if (side) {
      const pop = document.createElement("span");
      pop.className = "scorepop";
      pop.textContent = "+" + answer.pts;
      side.appendChild(pop);
      setTimeout(() => pop.remove(), 900);
    }
  }
  setTimeout(() => { idx++; idx < cards.length ? ask() : (solo ? soloEnd() : waitOrEnd()); }, 1100);
}

function waitOrEnd() {
  if (opp.length >= cards.length) return end();
  arena.innerHTML = `<div class="center"><div class="vs">You're done — waiting for ${esc(OPP.name)}…</div>
    <div class="board" style="width:100%" id="board"></div></div>`;
  paintBoard();
  const started = Date.now();
  const poll = setInterval(() => {
    if (opp.length >= cards.length || Date.now() - started > 45000) { clearInterval(poll); end(); }
  }, 200);
}

const total = list => list.reduce((s, x) => s + x.pts, 0);
// Per-question pips: both players' hits and misses fill in live, so a duel
// reads as a race you can watch, not just two counters.
const pips = list => cards.map((_, i) =>
  `<i class="pip${list[i] ? (list[i].ok ? " ok" : " no") : ""}"></i>`).join("");
function paintBoard() {
  const board = $("board");
  if (!board) return;
  const meSide = `<div class="side me"><div class="nm">YOU</div><div class="sc">${total(my)}</div>
      <div class="pips">${pips(my)}</div></div>`;
  board.innerHTML = solo ? meSide : meSide + `
    <div class="side"><div class="nm">${oppTag(OPP)} ${esc(OPP.name.toUpperCase())}</div><div class="sc">${total(opp)}</div>
      <div class="pips">${pips(opp)}</div></div>`;
}

function end() {
  botTimers.forEach(clearTimeout);
  if (liveMatch) {
    backend.stopMatch();
    // Both sides fully answered → the doc has served its purpose; whoever
    // finishes second clears it so matches don't pile up forever.
    if (opp.length >= cards.length && my.length >= cards.length)
      backend.deleteAsyncDuel?.(liveMatch.matchId);
  }
  const mine = total(my), theirs = total(opp);
  const actual = mine > theirs ? 1 : mine < theirs ? 0 : .5;
  const delta = eloDelta(P.rating, OPP.rating, actual);

  P.rating += delta;
  P.played++;
  if (actual === 1) { P.won++; P.streak++; P.best = Math.max(P.best, P.streak); }
  else if (actual === 0) P.streak = 0;
  cards.forEach((q, i) => {
    P.dA[q[1]] = (P.dA[q[1]] || 0) + 1;
    if (my[i]?.ok) { P.dC[q[1]] = (P.dC[q[1]] || 0) + 1; P.sfSum += speedF(my[i].ms); P.sfN++; }
    const prev = P.seen[q[0]] ? seenEntry(P.seen[q[0]]) : { t: 0, n: 0 };
    P.seen[q[0]] = { t: Date.now(), n: prev.n + 1 };
  });
  // Prune stale entries past the window — but keep repeat-capped ones forever.
  const cutoff = Date.now() - 14 * 86400000;
  Object.keys(P.seen).forEach(k => {
    const e = seenEntry(P.seen[k]);
    if (e.t < cutoff && e.n < 3) delete P.seen[k];
  });
  // Match history (last 20).
  P.history = [{ opp: OPP.name, country: OPP.country || "", bot: !!OPP.isBot,
                 mine, theirs, delta, ts: Date.now() }, ...(P.history || [])].slice(0, 20);
  persist();

  lastRun = { cards: cards.slice(), my: my.slice() };
  lastResults = { headline: actual === 1 ? "Victory" : actual === 0 ? "Defeat" : "Draw",
                  mine, theirs, delta, opp: OPP, now: P.rating };
  if (actual === 1) sfx.win(); else if (actual === 0) sfx.lose(); else sfx.draw();
  showResults();
}

function showResults() {
  const { headline, mine, theirs, delta, opp } = lastResults;
  const now = lastResults.now ?? P.rating;
  const dots = Object.keys(DOMAINS).map(d => {
    const row = lastRun.cards.map((q, i) => q[1] === d
      ? `<span class="dot" style="background:${lastRun.my[i]?.ok ? "var(--good)" : "var(--bad)"}"></span>` : "").join("");
    return row ? `<div class="row"><span class="lbl" style="color:${DOMAINS[d][1]}">${DOMAINS[d][0]}</span>${row}</div>` : "";
  }).join("");
  arena.innerHTML = `<div class="center">
    <div class="headline">${headline}</div>
    <div class="finals">
      <div class="fs ${mine >= theirs ? "win" : ""}"><div class="n">YOU</div><div class="v">${mine}</div></div>
      <div style="color:rgba(255,255,255,.4)">–</div>
      <div class="fs ${theirs > mine ? "win" : ""}"><div class="n">${oppTag(opp)} ${esc(opp.name.toUpperCase())}</div><div class="v">${theirs}</div></div>
    </div>
    <div class="delta" style="${delta >= 0
      ? "color:#7de0a8;background:rgba(33,176,107,.15)"
      : "color:#f29b9c;background:rgba(219,69,71,.15)"}">
      ${delta >= 0 ? "+" : ""}${delta} rating · now ${now} · ${tier(now)}</div>
    <div class="dots">${dots}</div>
    <div style="display:flex;gap:10px;width:100%;max-width:300px">
      <button class="lightbtn" id="d-rematch" style="flex:1;background:rgba(255,255,255,.14);color:#fff">Rematch</button>
      <button class="lightbtn" id="d-done" style="flex:1">Continue</button>
    </div>
    <div style="display:flex;gap:18px">
      <button class="arena-link" id="d-review">Review answers</button>
      <button class="arena-link" id="d-share">Share result</button>
    </div>
  </div>`;
  $("d-done").onclick = () => { arena.classList.remove("on"); render(); };
  $("d-rematch").onclick = rematch;
  $("d-review").onclick = () => renderReview(showResults);
  $("d-share").onclick = () => shareCard({
    headline, line: `You ${mine} — ${theirs} ${opp.name}`,
    sub: `${delta >= 0 ? "+" : ""}${delta} rating · ${tier(P.rating)} ${P.rating}` });
}

// ---- answer review: every question from the last run, your pick vs. the
// correct answer, with a per-question flag for anything that looks wrong. ----
function renderReview(back) {
  const rows = lastRun.cards.map((q, i) => {
    const a = lastRun.my[i];
    const [label, color] = DOMAINS[q[1]];
    const opts = q[4].map((o, j) => {
      const isCorrect = j === q[5];
      const wasPick = a && a.pick === j;
      return `<div class="rv-opt ${isCorrect ? "good" : ""} ${!isCorrect && wasPick ? "bad" : ""}">
        ${optHTML(o)}${isCorrect ? " ✓" : !isCorrect && wasPick ? " ✕" : ""}</div>`;
    }).join("");
    const meta = a && a.pick === null ? "no answer"
      : `${a?.ok ? `+${a.pts}` : "0"} pts · ${(a ? a.ms / 1000 : 0).toFixed(1)}s`;
    return `<div class="rv-card">
      <div class="rv-top"><span class="dchip" style="color:${color};background:${color}2e">${label}</span>
        <span class="rv-meta">${meta}</span>
        <button class="rv-flag" data-flag="${q[0]}" title="Report this question">${ic("flag", "15px")}</button></div>
      <div class="rv-q">${esc(q[3])}</div>${q[6] ? `<div class="fig rv-fig">${q[6]}</div>` : ""}${opts}</div>`;
  }).join("");
  arena.innerHTML = `
    <div class="rv-head"><button class="arena-link" id="rv-back">‹ Back</button>
      <span class="vs">Answer review</span><span style="width:52px"></span></div>
    <div class="rv-list">${rows}</div>`;
  $("rv-back").onclick = back;
  arena.querySelectorAll("[data-flag]").forEach(el => el.onclick = async () => {
    el.disabled = true;
    try { await backend.reportQuestion(el.dataset.flag, P); } catch { /* best effort */ }
    toast("Thanks — question flagged for review.");
  });
}

// ---- shareable result card: drawn on a canvas, shared as an image where the
// browser supports it, downloaded otherwise. ----
async function shareCard({ headline, line, sub }) {
  try { await document.fonts.load('700 110px "Fraunces"'); } catch { /* fallback font */ }
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1080;
  const x = c.getContext("2d");
  const bg = x.createLinearGradient(0, 0, 0, 1080);
  bg.addColorStop(0, "#12131c"); bg.addColorStop(1, "#0a0b10");
  x.fillStyle = bg; x.fillRect(0, 0, 1080, 1080);
  x.fillStyle = "#7d80f0"; x.fillRect(0, 0, 1080, 10);
  x.textAlign = "center";
  x.fillStyle = "rgba(255,255,255,.65)";
  x.font = '600 52px "Fraunces", Georgia, serif';
  x.fillText("Mindspar", 540, 200);
  x.fillStyle = "#fff";
  x.font = '700 130px "Fraunces", Georgia, serif';
  x.fillText(headline, 540, 480);
  x.font = "600 58px -apple-system, 'Segoe UI', sans-serif";
  x.fillText(line, 540, 620);
  x.fillStyle = "#9a9cfb";
  x.font = "600 44px -apple-system, 'Segoe UI', sans-serif";
  x.fillText(sub, 540, 710);
  x.fillStyle = "rgba(255,255,255,.45)";
  x.font = "500 34px -apple-system, 'Segoe UI', sans-serif";
  x.fillText("Head-to-head thinking duels — play free in your browser", 540, 920);
  x.fillStyle = "rgba(255,255,255,.6)";
  x.fillText("rakesh-kumar34.github.io/mindspar", 540, 975);
  const blob = await new Promise(res => c.toBlob(res, "image/png"));
  if (!blob) return toast("Couldn't build the share image.");
  const file = new File([blob], "mindspar-result.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Mindspar" }); return; }
    catch { /* user cancelled — fall through to download */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mindspar-result.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast("Result card saved as an image.");
}

function rematch() {
  arena.classList.remove("on");
  if (lastMatch?.bot) return startBotDuel(lastMatch.bot);
  if (lastMatch?.friendId) {
    const f = friends.find(x => x.id === lastMatch.friendId);
    if (f) return challengeFriend(f);
    toast("Add them as a friend to rematch.");
  }
  render();
}

// Daily challenge finished: fold the answers into stats (accuracy/speed count,
// but not rating), record today's score, and show the friends leaderboard.
function endDaily() {
  const mine = total(my);
  let correct = 0;
  cards.forEach((q, i) => {
    P.dA[q[1]] = (P.dA[q[1]] || 0) + 1;
    if (my[i]?.ok) { P.dC[q[1]] = (P.dC[q[1]] || 0) + 1; P.sfSum += speedF(my[i].ms); P.sfN++; correct++; }
    const prev = P.seen[q[0]] ? seenEntry(P.seen[q[0]]) : { t: 0, n: 0 };
    P.seen[q[0]] = { t: Date.now(), n: prev.n + 1 };
  });
  P.dailyDone = todayKey();
  P.dailyScore = mine;
  // Streak: consecutive (UTC) days with the daily challenge played.
  const y = new Date(); y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  P.dailyStreak = P.dailyLastDay === yesterday ? (P.dailyStreak || 0) + 1 : 1;
  P.dailyBestStreak = Math.max(P.dailyBestStreak || 0, P.dailyStreak);
  P.dailyLastDay = todayKey();
  lastRun = { cards: cards.slice(), my: my.slice() };
  persist();
  if (backend.isLive) backend.submitDaily(todayKey(), P, mine, correct).catch(() => {});
  showDailyResults();
}

// Current streak counts only if the chain is unbroken (played today, or the
// last play was yesterday and today is still open).
function dailyStreakNow() {
  if (!P || !P.dailyLastDay) return 0;
  const y = new Date(); y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  return (P.dailyLastDay === todayKey() || P.dailyLastDay === yesterday) ? (P.dailyStreak || 0) : 0;
}

async function showDailyResults() {
  arena.classList.add("on");
  arena.innerHTML = `<div class="center"><div class="spin"></div></div>`;
  const ids = [P.id, ...friends.map(f => f.id)];
  let scores = [];
  try { if (backend.isLive) scores = await backend.getDailyScores(todayKey(), ids); } catch { /* offline */ }
  if (!scores.find(s => s.id === P.id) && P.dailyDone === todayKey())
    scores.push({ id: P.id, name: P.name, country: P.country || "", score: P.dailyScore || 0 });
  scores.sort((a, b) => b.score - a.score);
  const rows = scores.map((s, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0">
      <span style="width:26px;text-align:center">${["🥇", "🥈", "🥉"][i] || `<b style="color:rgba(255,255,255,.5)">${i + 1}</b>`}</span>
      <span style="flex:1;color:#fff;font-weight:${s.id === P.id ? 700 : 500};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${flagOf(s.country)} ${esc(s.name)}${s.id === P.id ? ` <span style="font-size:9px;background:var(--iris);padding:1px 5px;border-radius:5px;vertical-align:middle">YOU</span>` : ""}</span>
      <span style="font-weight:700;font-variant-numeric:tabular-nums;color:#9a9cfb">${s.score}</span></div>`).join("");
  const streak = dailyStreakNow();
  arena.innerHTML = `<div class="center">
    <div class="headline">Daily Challenge</div>
    <div style="font-size:12.5px;color:rgba(255,255,255,.5);margin-top:-8px">${todayKey()}${
      streak > 1 ? ` · 🔥 ${streak}-day streak` : ""}</div>
    <div class="fs win" style="margin:6px 0"><div class="v">${P.dailyScore ?? "—"}</div>
      <div class="n">YOUR SCORE</div></div>
    <div style="width:280px;max-height:280px;overflow-y:auto">${scores.length ? rows
      : `<div style="color:rgba(255,255,255,.55);font-size:13px;text-align:center;line-height:1.5">
           You're first today — invite friends to play the same ${N} and compare.</div>`}</div>
    <button class="lightbtn" id="dl-done">Done</button>
    <div style="display:flex;gap:18px">
      ${lastRun ? `<button class="arena-link" id="dl-review">Review answers</button>` : ""}
      <button class="arena-link" id="dl-share">Share score</button>
    </div>
  </div>`;
  $("dl-done").onclick = () => { arena.classList.remove("on"); render(); };
  const rv = $("dl-review");
  if (rv) rv.onclick = () => renderReview(showDailyResults);
  $("dl-share").onclick = () => shareCard({
    headline: "Daily Challenge",
    line: `${P.dailyScore ?? 0} points · ${todayKey()}`,
    sub: streak > 1 ? `🔥 ${streak}-day streak` : `${tier(P.rating)} · ${P.rating}` });
}

// ---------------- async ("play-by-mail") duels ----------------
// You play your run of a shared deck now; your friend plays theirs whenever
// they're free. Scores are compared when both have played — no need to be
// online at the same time.
// Live head-to-head only: a challenge works when the friend is online (heartbeat
// under ~70s old). If they're offline, we say so — no async fallback.
async function challengeFriend(opp) {
  if (!backend.isLive) return toast("Online play isn't available offline — duel a bot!");
  if (!opp) return;
  if (opp.id === P.id) return toast("You can't challenge yourself.");
  const first = esc((opp.name || "They").split(" ")[0]);
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel"><div class="spin"></div><b>Reaching ${first}…</b></div>`;
  let online = false;
  try {
    const prof = await backend.getProfile(opp.id);
    online = !!(prof && prof.lastActive && Date.now() - prof.lastActive < 70000);
  } catch { /* treat as offline */ }
  if (online) return liveChallenge(opp);
  // Offline friend → offer an async duel: same deck, played on two schedules.
  overlay.innerHTML = `<div class="panel">
    <b>${first} isn't online</b>
    <span style="font-size:12.5px;color:var(--ink2);line-height:1.5">Send an async duel instead?
      You play your ${N} questions now; ${first} plays the same deck whenever they're next on,
      and ratings settle from today's standings.</span>
    <div class="err" id="as-err"></div>
    <button class="primary" id="as-send">Send & play now</button>
    <button class="ghost" id="as-close">Cancel</button></div>`;
  $("as-close").onclick = () => overlay.classList.remove("on");
  $("as-send").onclick = async () => {
    const err = $("as-err");
    $("as-send").disabled = true;
    err.textContent = "Setting up the duel…";
    try {
      const target = ladder(Math.round((P.rating + (opp.rating ?? 1000)) / 2));
      const deckIds = buildDeck({ targetDifficulty: target, seen: freshSeen(P) }).map(q => q[0]);
      const id = await backend.createAsyncDuel(P, opp, deckIds, target);
      overlay.classList.remove("on");
      startAsyncRun({ id, pids: [P.id, opp.id], fromId: P.id, deckIds,
        players: { [P.id]: { name: P.name }, [opp.id]: { name: opp.name, country: opp.country || "" } } });
    } catch (e) {
      $("as-send").disabled = false;
      err.textContent = (e.message || "Couldn't create the duel.").replace("Firebase: ", "");
    }
  };
}

// Send an invite the online friend accepts, then both play the same deck in
// real time.
function liveChallenge(opp) {
  const first = esc((opp.name || "They").split(" ")[0]);
  let timeout;
  const withdraw = () => (backend.cancelInvite ? backend.cancelInvite() : backend.stopMatch());
  searchingPanel(`Challenging ${first}…`, "They're online — waiting for them to accept",
    () => { clearTimeout(timeout); overlay.classList.remove("on"); withdraw(); });
  backend.sendInvite(opp.email, P, human => {
    clearTimeout(timeout);
    if (!overlay.classList.contains("on")) return;
    overlay.classList.remove("on");
    startHumanDuel(human);
  }).catch(e => { clearTimeout(timeout); overlay.classList.remove("on"); toast(e.message); });
  timeout = setTimeout(() => {
    if (!overlay.classList.contains("on")) return;
    overlay.classList.remove("on");
    withdraw();
    toast(`${first} didn't accept in time.`);
  }, 25000);
}

// ---------------- async ("play-by-mail") duels ----------------
const asyncOppId = d => (d.pids || []).find(x => x !== P.id);
const asyncShown = new Set();   // duels whose outcome we showed full-screen

// Both results are in and I haven't banked my side yet → settle Elo from the
// rating snapshots taken at creation (deterministic, so both clients agree),
// record the match, and clean the doc up once both sides have applied it.
function settleAsyncDuels() {
  for (const d of asyncDuels) {
    const oppId = asyncOppId(d);
    const mine = d["result_" + P.id], theirs = d["result_" + oppId];
    if (!mine || !theirs || d["applied_" + P.id] || asyncApplying.has(d.id)
        || P.asyncApplied?.[d.id]) continue;
    asyncApplying.add(d.id);
    const o = d.players?.[oppId] || {};
    const me0 = d.players?.[P.id]?.rating ?? 1000, opp0 = o.rating ?? 1000;
    const actual = mine.score > theirs.score ? 1 : mine.score < theirs.score ? 0 : .5;
    const delta = eloDelta(me0, opp0, actual);
    P.rating += delta;
    P.played++;
    if (actual === 1) { P.won++; P.streak++; P.best = Math.max(P.best, P.streak); }
    else if (actual === 0) P.streak = 0;
    P.history = [{ opp: o.name ?? "Player", country: o.country || "", bot: false,
                   mine: mine.score, theirs: theirs.score, delta, ts: Date.now() },
                 ...(P.history || [])].slice(0, 20);
    // Belt-and-braces: remember the settlement on the profile too, so a failed
    // applied_ write can never double-count the rating on a later session.
    P.asyncApplied = { ...(P.asyncApplied || {}), [d.id]: 1 };
    // If we didn't just watch this outcome full-screen (i.e. the opponent
    // finished while we were away), leave a persistent card on the home
    // screen — a 3-second toast is too easy to miss.
    if (!asyncShown.has(d.id)) {
      P.asyncNews = [{ opp: o.name ?? "Player", country: o.country || "",
                       mine: mine.score, theirs: theirs.score, delta, ts: Date.now() },
                     ...(P.asyncNews || [])].slice(0, 3);
    }
    persist();
    backend.markAsyncApplied(d.id, P.id)
      .then(() => { if (d["applied_" + oppId]) backend.deleteAsyncDuel(d.id); })
      .catch(() => {});
    const word = actual === 1 ? "Victory" : actual === 0 ? "Defeat" : "Draw";
    if (!asyncShown.has(d.id))
      toast(`Async duel vs ${o.name ?? "friend"} settled: ${word} ${mine.score}–${theirs.score} (${delta >= 0 ? "+" : ""}${delta})`);
  }
  // Keep the profile-side settlement memory from growing forever.
  if (P?.asyncApplied) {
    const live = new Set(asyncDuels.map(d => d.id));
    Object.keys(P.asyncApplied).forEach(id => { if (!live.has(id)) delete P.asyncApplied[id]; });
  }
}

// Play my run of a shared async deck (solo — the opponent plays on their own time).
function startAsyncRun(duel) {
  const o = duel.players?.[asyncOppId(duel)] || {};
  solo = true; soloTitle = `Async vs ${o.name ?? "friend"}`;
  soloEnd = () => finishAsyncRun(duel);
  OPP = null; liveMatch = null; lastMatch = null;
  cards = duel.deckIds.map(id => qById[id]).filter(Boolean);
  if (!cards.length) return toast("This challenge couldn't load — ask them to re-send it.");
  beginDuel(() => {});
}

function finishAsyncRun(duel) {
  const mine = total(my);
  let correct = 0;
  cards.forEach((q, i) => {
    P.dA[q[1]] = (P.dA[q[1]] || 0) + 1;
    if (my[i]?.ok) { P.dC[q[1]] = (P.dC[q[1]] || 0) + 1; P.sfSum += speedF(my[i].ms); P.sfN++; correct++; }
    const prev = P.seen[q[0]] ? seenEntry(P.seen[q[0]]) : { t: 0, n: 0 };
    P.seen[q[0]] = { t: Date.now(), n: prev.n + 1 };
  });
  lastRun = { cards: cards.slice(), my: my.slice() };
  persist();
  backend.submitAsyncResult(duel.id, P, { score: mine, correct, at: Date.now() }).catch(() => {});

  const oppId = asyncOppId(duel);
  const theirs = duel["result_" + oppId];
  if (theirs) {
    // I'm the second player — the duel is DECIDED right now. Show the real
    // result screen (the rating itself settles via the listener a moment
    // later, using these same snapshot numbers).
    asyncShown.add(duel.id);
    const o = duel.players?.[oppId] || {};
    const actual = mine > theirs.score ? 1 : mine < theirs.score ? 0 : .5;
    const delta = eloDelta(duel.players?.[P.id]?.rating ?? 1000, o.rating ?? 1000, actual);
    lastMatch = { friendId: oppId };
    lastResults = { headline: actual === 1 ? "Victory" : actual === 0 ? "Defeat" : "Draw",
                    mine, theirs: theirs.score, delta,
                    opp: { name: o.name ?? "Player", country: o.country || "" },
                    now: P.rating + delta };
    if (actual === 1) sfx.win(); else if (actual === 0) sfx.lose(); else sfx.draw();
    showResults();
    return;
  }
  sfx.send();
  showAsyncSent(duel, mine);
}

function showAsyncSent(duel, mine) {
  const name = duel.players?.[asyncOppId(duel)]?.name ?? "your friend";
  arena.innerHTML = `<div class="center">
    <div class="headline">Score sent</div>
    <div class="fs win"><div class="v">${mine}</div><div class="n">YOUR SCORE</div></div>
    <div class="vs" style="max-width:270px;text-align:center;line-height:1.55">The duel — and your
      rating — settles as soon as ${esc(name)} plays the same ${N} questions.</div>
    <button class="lightbtn" id="as-done">Done</button>
    <button class="arena-link" id="as-review">Review answers</button>
  </div>`;
  $("as-done").onclick = () => { arena.classList.remove("on"); render(); };
  $("as-review").onclick = () => renderReview(() => showAsyncSent(duel, mine));
}

// Home cards: incoming challenges to play, sent ones still waiting, and
// results that settled while you were away (dismissible).
function asyncCards() {
  const rows = [];
  (P.asyncNews || []).forEach((n, i) => {
    const win = n.mine > n.theirs, draw = n.mine === n.theirs;
    rows.push(`<div class="invitecard" style="background:${win ? "rgba(33,176,107,.10)" : "var(--iris-soft)"}"><div class="row">
      <span style="font-size:13.5px"><b>${win ? "Victory" : draw ? "Draw" : "Defeat"}</b>
        — async duel vs ${flagOf(n.country)} ${esc(n.opp)} ended ${n.mine}–${n.theirs}
        <b style="color:${n.delta >= 0 ? "var(--good)" : "var(--bad)"}">${n.delta >= 0 ? "+" : ""}${n.delta}</b></span>
      <button class="chip" style="background:var(--card);color:var(--ink2)" data-news-x="${i}">Dismiss</button>
    </div></div>`);
  });
  for (const d of asyncDuels) {
    const oppId = asyncOppId(d);
    const o = d.players?.[oppId] || {};
    const mine = d["result_" + P.id], theirs = d["result_" + oppId];
    if (mine && theirs) continue;                       // settling — no card needed
    if (!mine) {
      rows.push(`<div class="invitecard"><div class="row">
        <span style="font-size:14px"><b>${flagOf(o.country)} ${esc(o.name ?? "Player")}</b> sent an async duel
          <span style="color:var(--ink2)">· play your ${N} anytime</span></span>
        <button class="smallbtn" data-async-play="${d.id}">Play</button>
      </div></div>`);
    } else {
      rows.push(`<div class="invitecard" style="background:var(--card);border:1px solid var(--hair)"><div class="row">
        <span style="font-size:13px;color:var(--ink2)">You scored <b style="color:var(--ink)">${mine.score}</b> —
          waiting for ${flagOf(o.country)} ${esc(o.name ?? "them")} to play</span>
        ${d.fromId === P.id ? `<button class="chip" style="background:var(--iris-soft);color:var(--ink2)" data-async-cancel="${d.id}">Cancel</button>` : ""}
      </div></div>`);
    }
  }
  return rows.join("");
}

// ---------------- friends ----------------
function renderFriends() {
  if (!backend.isLive) {
    screen.innerHTML = `<div class="pad">
      <div class="serif" style="font-size:24px;font-weight:600">Friends</div>
      <div class="cardbox" style="padding:20px;font-size:13.5px;color:var(--ink2);line-height:1.6">
        Adding friends and end-to-end encrypted chat need an online account. This copy is
        running offline — bot duels and the daily challenge still work fully.</div></div>`;
    return;
  }
  if (viewingFriend) return renderFriendProfile(viewingFriend);
  if (!friendsLoaded) {
    screen.innerHTML = `<div class="pad"><div class="serif" style="font-size:24px;font-weight:600">Friends</div>
      <div class="loading"><span class="spin"></span></div></div>`;
    return;
  }

  // Leaderboard: me + friends ranked by rating.
  const board = [{ id: P.id, name: P.name, rating: P.rating, country: P.country, photo: P.photo, avatarSeed: P.avatarSeed, me: true },
    ...friends.map(f => ({ ...f, me: false }))].sort((a, b) => b.rating - a.rating);
  const medal = i => ["🥇", "🥈", "🥉"][i] || `<span class="lb-num">${i + 1}</span>`;
  const lbRows = board.map((p, i) => `
    <div class="lb-row ${p.me ? "me" : ""}">
      <span class="lb-rank">${medal(i)}</span>
      <span class="fav sm">${avatarHTML(p)}</span>
      <span class="lb-name"><b>${flagOf(p.country)} ${esc(p.name)}${p.me ? ` <span class="lb-you">you</span>` : ""}</b>
        <span>${tier(p.rating)}</span></span>
      <span class="lb-rating">${p.rating}</span></div>`).join("");

  const reqRows = friendReqs.map(r => `
    <div class="frow"><span class="fav">${avatarHTML({ name: r.fromName })}</span>
      <span class="fmeta"><b>${flagOf(r.fromCountry)} ${esc(r.fromName)}</b><span>wants to be friends · ${r.fromRating ?? 1000}</span></span>
      <span class="fbtns">
        <button class="smallbtn" data-acc="${r.id}">Accept</button>
        <button class="chip" style="background:var(--iris-soft);color:var(--ink2)" data-dec="${r.id}">Ignore</button>
      </span></div>`).join("");
  const friendRows = friends.length ? friends.map(f => {
    const unread = unreadBy.get(f.id);
    return `<div class="frow ${unread ? "unread" : ""}">
      <button class="fpeek" data-fprof="${f.id}">
        <span class="fav">${avatarHTML(f)}${unread ? `<i class="undot"></i>` : ""}</span>
        <span class="fmeta"><b>${flagOf(f.country)} ${esc(f.name)}</b>
          <span>${unread ? `<b style="color:var(--iris)">New message</b> · ` : ""}${tier(f.rating)} · ${f.rating}</span></span>
      </button>
      <span class="fbtns">
        <button class="smallbtn" data-chal="${f.id}">Challenge</button>
        <button class="smallbtn" data-chat="${f.id}">Message</button>
      </span></div>`;
  }).join("")
    : `<div class="cardbox" style="padding:18px;font-size:13px;color:var(--ink2);text-align:center">
         No friends yet — add someone by email above to challenge and chat.</div>`;

  screen.innerHTML = `<div class="pad" style="gap:14px">
    <div class="serif" style="font-size:24px;font-weight:600">Friends</div>
    ${friends.length ? `<div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:10px">
      <div class="eyebrow">LEADERBOARD</div>${lbRows}</div>` : ""}
    <div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:10px">
      <div class="eyebrow">ADD A FRIEND</div>
      <div style="display:flex;gap:8px">
        <input id="fr-email" type="email" placeholder="Friend's email" autocomplete="off" style="flex:1">
        <button class="smallbtn" id="fr-add" style="padding:0 18px">Add</button>
      </div>
      <div class="err" id="fr-err"></div>
    </div>
    ${friendReqs.length ? `<div class="eyebrow">REQUESTS</div>${reqRows}` : ""}
    <div class="eyebrow">YOUR FRIENDS</div>
    ${friendRows}
    <div class="fine">Chats are end-to-end encrypted on your device — Mindspar's
      servers only ever store scrambled text they can't read.</div>
  </div>`;

  $("fr-add").onclick = addFriend;
  $("fr-email").addEventListener("keydown", e => { if (e.key === "Enter") addFriend(); });
  screen.querySelectorAll("[data-acc]").forEach(el =>
    el.onclick = async () => { try { await backend.acceptFriendRequest(friendReqs.find(r => r.id === el.dataset.acc), P); toast("Friend added."); } catch (e) { toast(e.message); } });
  screen.querySelectorAll("[data-dec]").forEach(el =>
    el.onclick = () => backend.declineFriendRequest({ id: el.dataset.dec }));
  screen.querySelectorAll("[data-chal]").forEach(el =>
    el.onclick = () => challengeFriend(friends.find(x => x.id === el.dataset.chal)));
  screen.querySelectorAll("[data-chat]").forEach(el =>
    el.onclick = () => openChat(friends.find(x => x.id === el.dataset.chat)));
  screen.querySelectorAll("[data-fprof]").forEach(el =>
    el.onclick = () => openFriendProfile(friends.find(x => x.id === el.dataset.fprof)));
}

// A read-only look at a friend's stats + Mindspar Score.
async function openFriendProfile(friend) {
  if (!friend) return;
  viewingFriend = { ...friend, loading: true };
  renderFriends();
  try {
    const full = await backend.getProfile(friend.id);
    viewingFriend = { ...friend, full };
  } catch { viewingFriend = { ...friend, full: null }; }
  if (tab === "friends") renderFriends();
}

function renderFriendProfile(v) {
  const f = v.full || {};
  const score = v.full ? sparScore(f) : null;
  const answered = f.dA ? Object.values(f.dA).reduce((a, b) => a + b, 0) : 0;
  const bars = v.full ? Object.entries(DOMAINS).map(([k, [t, c, g]]) => {
    const n = (f.dA || {})[k] || 0;
    const pct = n ? Math.round(((f.dC || {})[k] || 0) / n * 100) : null;
    return `<div class="srow"><span style="color:${c};width:18px">${ic(DOMAIN_ICON[k], "18px")}</span><span class="sl">${t}</span>
      <span class="bar"><i style="width:${pct ?? 0}%;background:${c}"></i></span>
      <span class="pv">${pct === null ? "—" : pct + "%"}</span></div>`;
  }).join("") : "";
  screen.innerHTML = `<div class="pad" style="gap:14px">
    <button class="ghost" id="fp-back" style="align-self:flex-start;padding:4px 0">‹ Friends</button>
    <div style="text-align:center">
      <div class="avatar" style="cursor:default">${avatarHTML(v)}</div>
      <div class="serif" style="font-size:24px;font-weight:600;margin-top:8px">${flagOf(v.country)} ${esc(v.name)}</div>
      <div style="margin-top:8px"><span class="tierpill">${tier(v.rating).toUpperCase()} <i>${v.rating}${
        v.full?.country ? " · " + countryName(v.full.country) : ""}</i></span></div>
    </div>
    ${v.loading ? `<div class="cardbox" style="padding:24px;text-align:center;color:var(--ink2)">Loading…</div>` : `
    <div class="cardbox" style="padding:22px;text-align:center">
      <div class="eyebrow">MINDSPAR SCORE</div>
      ${score !== null ? `<div class="score">${score}</div>`
        : `<div class="serif" style="font-size:22px;font-weight:600;margin-top:8px">Not calibrated yet</div>`}
    </div>
    <div class="cardbox rec">
      <div><div class="v">${f.played ?? 0}</div><div class="l">Duels</div></div>
      <div><div class="v">${f.won ?? 0}</div><div class="l">Wins</div></div>
      <div><div class="v">${f.played ? Math.round((f.won || 0) / f.played * 100) + "%" : "—"}</div><div class="l">Win rate</div></div>
      <div><div class="v">${f.best ?? 0}</div><div class="l">Best streak</div></div>
    </div>
    ${answered ? `<div class="cardbox strengths"><div class="eyebrow">DOMAIN ACCURACY</div>${bars}</div>` : ""}`}
    <div style="display:flex;gap:8px">
      <button class="smallbtn" id="fp-chal" style="flex:1;padding:13px">Challenge</button>
      <button class="smallbtn" id="fp-msg" style="flex:1;padding:13px">Message</button>
    </div>
  </div>`;
  $("fp-back").onclick = () => { viewingFriend = null; renderFriends(); };
  $("fp-chal").onclick = () => challengeFriend(friends.find(x => x.id === v.id) || v);
  $("fp-msg").onclick = () => openChat(friends.find(x => x.id === v.id) || v);
}

async function addFriend() {
  const email = $("fr-email").value.trim();
  if (!email) return;
  try {
    const name = await backend.sendFriendRequest(email, P);
    $("fr-email").value = "";
    $("fr-err").textContent = "";
    toast(`Friend request sent to ${name}.`);
  } catch (e) { $("fr-err").textContent = e.message; }
}

// ---------------- encrypted chat ----------------
// Set up (or recover) this device's chat key by confirming the account
// password. Needed on a new device, or to upgrade an older account whose key
// predates cross-device backup. Then run `then` (e.g. open the chat).
function enableSecureChat(then) {
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel">
    <b>Enable secure chat</b>
    <span style="font-size:12.5px;color:var(--ink2);line-height:1.5">Enter your account password to set
      up end-to-end encrypted chat on this device — use the same password on each device so your
      messages stay readable everywhere.</span>
    ${pwField("ec-pass", "Your account password")}
    <div class="err" id="ec-err"></div>
    <button class="primary" id="ec-go">Enable secure chat</button>
    <button class="ghost" id="ec-close">Cancel</button></div>`;
  $("ec-close").onclick = () => overlay.classList.remove("on");
  const go = async () => {
    const pw = $("ec-pass").value;
    if (!pw) return;
    const errEl = $("ec-err");
    errEl.textContent = "Setting up…";
    // Derive the key straight from the password: a first-time device mints the
    // wrapped identity; a returning device unwraps it (wrong password just fails
    // to decrypt, leaving myKeys null). No re-auth needed.
    await setupIdentity(pw);
    if (myKeys) {
      overlay.classList.remove("on");
      toast("Secure chat is ready.");
      then && then();
    } else {
      errEl.textContent = "Couldn't unlock chat — if you've chatted before, use that same password.";
    }
  };
  $("ec-go").onclick = go;
  $("ec-pass").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  wirePwEye("ec-pass");
  $("ec-pass").focus();
}

let notifyAsked = false;
function requestNotifyPermission() {
  if (notifyAsked || !("Notification" in window)) return;
  notifyAsked = true;
  if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
}

async function openChat(friend) {
  if (!friend) return;
  // Chat keys not set up on this device yet → confirm password to enable, then reopen.
  if (!myKeys) return enableSecureChat(() => openChat(friend));
  // Always use the friend's latest published key (it may have changed on a re-key).
  const theirPub = (await backend.getPubKey(friend.id)) || friend.pubKey;
  if (!theirPub) return toast(`${friend.name} hasn't set up secure chat yet — ask them to sign in on Mindspar.`);
  chatFriend = friend; chatMeta = {};
  requestNotifyPermission();
  try {
    chatChannel = await makeChannel(myKeys.priv, theirPub);
  } catch (e) { console.error(e); return toast("Couldn't set up the secure channel."); }
  chatEl.classList.add("on");
  renderChatShell(friend);
  let msgs = [];
  const repaint = () => paintMessages(decorateTicks(msgs));
  chatUnsub = backend.listenMessages(P.id, friend.id, async raw => {
    msgs = await Promise.all(raw.map(async m => {
      if (!chatCache.has(m.id)) chatCache.set(m.id, await chatChannel.open(m));
      return { id: m.id, mine: m.from === P.id, text: chatCache.get(m.id),
               ts: m.createdAt?.toMillis ? m.createdAt.toMillis() : Date.now() };
    }));
    backend.markRead(P.id, friend.id);                  // I've now seen these
    unreadBy.set(friend.id, false); lastSeenMsg.set(friend.id, Date.now());
    updateFriendBadge();
    repaint();
  });
  chatMetaUnsub = backend.listenChatMeta(P.id, friend.id, meta => { chatMeta = meta || {}; repaint(); });
}

// Mark my own messages ✓ (sent) or ✓✓ (the friend has read up to that time).
function decorateTicks(msgs) {
  const r = chatMeta["read_" + (chatFriend?.id || "")];
  const readMs = r?.toMillis ? r.toMillis() : 0;
  return msgs.map(m => ({ ...m, read: m.mine && readMs >= m.ts }));
}

function leaveChat() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  if (chatMetaUnsub) { chatMetaUnsub(); chatMetaUnsub = null; }
  chatFriend = null; chatChannel = null; chatMeta = {};
  chatEl.classList.remove("on");
  if (tab === "friends") renderFriends();
}

// The chat shell is built once so the input keeps focus while messages stream.
function renderChatShell(f) {
  chatEl.innerHTML = `
    <div class="chat-head">
      <button class="iconbtn" id="c-back" title="Back">‹</button>
      <span class="fav sm">${avatarHTML(f)}</span>
      <span class="chat-who"><b>${flagOf(f.country)} ${esc(f.name)}</b><span>🔒 End-to-end encrypted</span></span>
    </div>
    <div class="msgs" id="c-msgs"><div class="chat-note">Setting up secure channel…</div></div>
    <div class="chat-input">
      <input id="c-text" placeholder="Message" autocomplete="off" maxlength="2000" enterkeyhint="send">
      <button class="smallbtn" id="c-send">Send</button>
    </div>`;
  $("c-back").onclick = leaveChat;
  const input = $("c-text"), send = $("c-send");
  const doSend = async () => {
    const text = input.value.trim();
    if (!text || !chatChannel) return;
    input.value = "";
    try {
      const sealed = await chatChannel.seal(text);
      await backend.sendMessage(P.id, chatFriend.id, { from: P.id, ...sealed });
    } catch (e) { toast("Message failed to send."); input.value = text; }
  };
  send.onclick = doSend;
  input.addEventListener("keydown", e => { if (e.key === "Enter") doSend(); });
  input.focus();
}

// Only the message list is re-rendered on updates, so typing isn't interrupted.
function paintMessages(rows) {
  const box = $("c-msgs");
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = rows.length
    ? rows.map(r => `<div class="bubble ${r.mine ? "me" : "them"}">${
        r.text === null ? `<i style="opacity:.6">🔒 can't decrypt</i>` : esc(r.text)
      }${r.mine ? `<span class="tick ${r.read ? "read" : ""}">${r.read ? "✓✓" : "✓"}</span>` : ""}</div>`).join("")
    : `<div class="chat-note">Say hello — messages are end-to-end encrypted.</div>`;
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

// ---------------- character avatars (original WSB-style, see avatars.js) ------
// Photo if uploaded, otherwise the player's chosen (or default) character.
// The photo string comes from OTHER users' profile docs, so treat it as
// hostile input: only data:image/ URLs, and escaped before hitting the DOM.
function avatarHTML(person) {
  const photo = person && typeof person.photo === "string"
    && /^data:image\//.test(person.photo) ? person.photo : null;
  if (photo) return `<img src="${esc(photo)}" alt="">`;
  return characterAvatar((person && (person.avatarSeed || person.id || person.name)) || "x");
}

function characterPicker() {
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel" style="width:330px">
    <b>Choose your character</b>
    <div class="charwrap">${PICKER_SEEDS.map(s =>
      `<button class="charopt${P.avatarSeed === s ? " on" : ""}" data-seed="${s}">${characterAvatar(s)}</button>`).join("")}</div>
    <button class="ghost" id="cp-close">Close</button></div>`;
  $("cp-close").onclick = () => overlay.classList.remove("on");
  overlay.querySelectorAll("[data-seed]").forEach(el => el.onclick = () => {
    P.avatarSeed = el.dataset.seed; P.photo = null; persist();
    overlay.classList.remove("on"); renderProfile();
  });
}

// ---------------- profile ----------------
const TIERS = [["Novice", 0, 900], ["Adept", 900, 1050], ["Scholar", 1050, 1200],
               ["Sage", 1200, 1350], ["Luminary", 1350, 1500]];
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";

// Rating trajectory reconstructed backwards from the stored per-match deltas —
// no schema change needed, the history already carries everything.
function sparklineCard() {
  if (!P.history || P.history.length < 2) return "";
  let r = P.rating;
  const pts = [r];
  for (const h of P.history) { r -= h.delta; pts.push(r); }
  pts.reverse();
  const lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(hi - lo, 8);
  const W = 300, H = 44, PAD = 4;
  const xy = pts.map((v, i) => [
    PAD + i * (W - 2 * PAD) / (pts.length - 1),
    H - PAD - (v - lo) / span * (H - 2 * PAD),
  ]);
  const line = xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  const up = pts[pts.length - 1] >= pts[0];
  return `<div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:8px">
    <div class="rank-top"><span class="eyebrow">RATING TREND</span>
      <span style="font-size:12px;color:${up ? "var(--good)" : "var(--bad)"};font-weight:600">
        ${up ? "▲" : "▼"} ${Math.abs(pts[pts.length - 1] - pts[0])} over ${pts.length - 1} duels</span></div>
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${line}" fill="none" stroke="var(--iris)" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.2" fill="var(--iris)"/>
    </svg></div>`;
}

function renderProfile() {
  const answered = Object.values(P.dA).reduce((a, b) => a + b, 0);
  const correct = Object.values(P.dC).reduce((a, b) => a + b, 0);
  const acc = answered ? Math.round(correct / answered * 100) : null;
  const avgSpeed = P.sfN ? (P.sfSum / P.sfN) : null;   // 0–1, higher = faster
  const score = sparScore(P);

  // Where the rating sits inside its tier, and what's next.
  const ti = TIERS.findIndex(([, lo, hi]) => P.rating >= lo && P.rating < hi);
  const [tName, tLo, tHi] = TIERS[Math.max(0, ti)];
  const tierPct = Math.max(0, Math.min(100, Math.round((P.rating - tLo) / (tHi - tLo) * 100)));
  const next = TIERS[ti + 1];
  const toNext = next ? next[1] - P.rating : 0;

  // Best and focus domains (need a little data before calling it).
  const accByDom = Object.entries(DOMAINS)
    .map(([k]) => [k, P.dA[k] ? (P.dC[k] || 0) / P.dA[k] : null, P.dA[k] || 0])
    .filter(([, a, n]) => a !== null && n >= 3);
  const best = accByDom.slice().sort((a, b) => b[1] - a[1])[0];
  const focus = accByDom.slice().sort((a, b) => a[1] - b[1])[0];

  const bars = Object.entries(DOMAINS).map(([k, [t, c, g]]) => {
    const n = P.dA[k] || 0;
    const pct = n ? Math.round((P.dC[k] || 0) / n * 100) : null;
    return `<div class="srow"><span style="color:${c};width:18px">${ic(DOMAIN_ICON[k], "18px")}</span>
      <span class="sl">${t}</span>
      <span class="bar"><i style="width:${pct ?? 0}%;background:${c}"></i></span>
      <span class="pv">${pct === null ? "—" : pct + "%"}</span>
      <span class="pn">${n || ""}</span></div>`;
  }).join("");

  screen.innerHTML = `<div class="pad" style="gap:14px">
    <div style="text-align:center;padding-top:6px">
      <div class="avatar" id="p-avatar" style="cursor:pointer" title="Change your picture">${avatarHTML(P)}</div>
      <input type="file" id="p-file" accept="image/*" style="display:none">
      <div style="display:flex;gap:10px;justify-content:center;margin-top:3px">
        <button class="ghost" id="p-char">Pick character</button>
        <button class="ghost" id="p-photo">${P.photo ? "Change photo" : "Upload photo"}</button>
      </div>
      <div class="serif" style="font-size:25px;font-weight:600">${P.country ? flagOf(P.country) + " " : ""}${esc(P.name)}</div>
      <div style="font-size:12px;color:var(--ink2);margin-top:3px">${esc(P.email || "")}${
        P.country ? " · " + countryName(P.country) : ""}</div>
      <div style="margin-top:8px"><span class="tierpill">${tName.toUpperCase()}
        <i>${P.rating} · ${ageBand(P)}</i></span></div>
      ${P.createdAt ? `<div style="font-size:11px;color:var(--ink2);margin-top:7px">Member since ${fmtDate(P.createdAt)}</div>` : ""}
    </div>

    <div class="cardbox" style="padding:24px;text-align:center">
      <div class="eyebrow">MINDSPAR SCORE</div>
      ${score !== null
        ? `<div class="score">${score}</div>
           <div style="font-size:11.5px;color:var(--ink2)">Normalized within ${ageBand(P)} · mean 100</div>`
        : `<div class="serif" style="font-size:27px;font-weight:600;margin:10px 0 2px">Calibrating</div>
           <div class="cal"><i style="width:${Math.min(100, answered / MIN_ANSWERS * 100)}%"></i></div>
           <div style="font-size:11.5px;color:var(--ink2)">${MIN_ANSWERS} answers unlock your score —
             ${Math.min(100, Math.round(answered / MIN_ANSWERS * 100))}% there</div>`}
    </div>

    <div class="cardbox" style="padding:18px;display:flex;flex-direction:column;gap:11px">
      <div class="rank-top"><span class="eyebrow">RANK</span>
        <span style="font-size:12.5px;color:var(--ink2)">${next
          ? `${toNext} to <b style="color:var(--ink)">${next[0]}</b>` : "Top tier"}</span></div>
      <div class="ladder"><i style="width:${tierPct}%"></i></div>
      <div class="ladder-lbl"><span>${tName}</span><span>${next ? next[0] : ""}</span></div>
    </div>

    ${sparklineCard()}

    <div class="cardbox rec">
      <div><div class="v">${P.played}</div><div class="l">Duels</div></div>
      <div><div class="v">${P.won}</div><div class="l">Wins</div></div>
      <div><div class="v">${P.played ? Math.round(P.won / P.played * 100) + "%" : "—"}</div><div class="l">Win rate</div></div>
      <div><div class="v">${P.streak}</div><div class="l">Streak</div></div>
      <div><div class="v">${P.best}</div><div class="l">Best</div></div>
    </div>

    <div class="cardbox rec">
      <div><div class="v">${answered}</div><div class="l">Answered</div></div>
      <div><div class="v">${acc === null ? "—" : acc + "%"}</div><div class="l">Accuracy</div></div>
      <div><div class="v">${avgSpeed === null ? "—" : Math.round(avgSpeed * 100) + "%"}</div><div class="l">Speed</div></div>
    </div>

    ${accByDom.length ? `<div class="cardbox" style="padding:16px;display:flex;gap:10px">
      <div class="hl"><div class="hl-l">STRONGEST</div>
        <div class="hl-v" style="color:${DOMAINS[best[0]][1]}">${DOMAINS[best[0]][0]}</div>
        <div class="hl-s">${Math.round(best[1] * 100)}% correct</div></div>
      <div class="hl"><div class="hl-l">FOCUS AREA</div>
        <div class="hl-v" style="color:${DOMAINS[focus[0]][1]}">${DOMAINS[focus[0]][0]}</div>
        <div class="hl-s">${Math.round(focus[1] * 100)}% correct</div></div>
    </div>` : ""}

    <div class="cardbox strengths"><div class="eyebrow">DOMAIN ACCURACY</div>${bars}</div>

    ${P.history?.length ? `<div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:9px">
      <div class="eyebrow">RECENT DUELS</div>
      ${P.history.slice(0, 8).map(h => {
        const win = h.mine > h.theirs, draw = h.mine === h.theirs;
        return `<div class="hist-row">
          <span class="hist-res ${win ? "w" : draw ? "d" : "l"}">${win ? "W" : draw ? "D" : "L"}</span>
          <span class="hist-opp">${h.bot ? "🤖" : flagOf(h.country)} ${esc(h.opp)}</span>
          <span class="hist-score">${h.mine}–${h.theirs}</span>
          <span class="hist-delta ${h.delta >= 0 ? "up" : "down"}">${h.delta >= 0 ? "+" : ""}${h.delta}</span></div>`;
      }).join("")}
    </div>` : ""}

    ${backend.isLive ? `<div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div class="rank-top"><span class="eyebrow">FRIENDS</span>
        <button class="ghost" id="p-friends-all" style="padding:0;font-weight:600;color:var(--iris)">Manage</button></div>
      ${friends.length ? friends.map(f => `
        <div class="frow" style="box-shadow:none;padding:0;border:none;background:none">
          <span class="fav sm">${avatarHTML(f)}${unreadBy.get(f.id) ? `<i class="undot"></i>` : ""}</span>
          <span class="fmeta"><b>${flagOf(f.country)} ${esc(f.name)}</b><span>${unreadBy.get(f.id) ? `<b style="color:var(--iris)">New message</b> · ` : ""}${tier(f.rating)} · ${f.rating}</span></span>
          <span class="fbtns">
            <button class="smallbtn" data-pchal="${f.id}">Challenge</button>
            <button class="smallbtn" data-pchat="${f.id}">Message</button>
          </span></div>`).join("")
        : `<div style="font-size:12.5px;color:var(--ink2)">No friends yet — add someone from the Friends tab.</div>`}
    </div>` : ""}

    <div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:14px;font-weight:500">Appearance</span>
        <div class="seg"><button class="seg-b ${theme === "light" ? "on" : ""}" data-th="light">Light</button>
          <button class="seg-b ${theme === "dark" ? "on" : ""}" data-th="dark">Dark</button></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:14px;font-weight:500">Sounds & haptics</span>
        <div class="seg"><button class="seg-b ${!isMuted() ? "on" : ""}" data-snd="on">On</button>
          <button class="seg-b ${isMuted() ? "on" : ""}" data-snd="off">Off</button></div>
      </div>
    </div>

    <div class="fine">The Mindspar Score reflects your relative performance in this game, normalized by
      age group. It is an entertainment estimate — not a clinical or psychometric IQ assessment
      · <a href="privacy.html" style="color:inherit">Privacy</a></div>
    <button class="signout" id="p-out">Sign out</button>
    <button class="ghost" id="p-del" style="color:var(--bad);opacity:.75">Delete account…</button>
  </div>`;

  const fileInput = $("p-file");
  $("p-avatar").onclick = characterPicker;
  $("p-char").onclick = characterPicker;
  $("p-photo").onclick = () => fileInput.click();
  fileInput.onchange = () => resizePhoto(fileInput.files[0]);
  screen.querySelectorAll("[data-th]").forEach(el =>
    el.onclick = () => { applyTheme(el.dataset.th); renderProfile(); });
  screen.querySelectorAll("[data-snd]").forEach(el =>
    el.onclick = () => { setMuted(el.dataset.snd === "off"); if (el.dataset.snd === "on") sfx.correct(); renderProfile(); });
  const allBtn = $("p-friends-all");
  if (allBtn) allBtn.onclick = () => setTab("friends");
  screen.querySelectorAll("[data-pchal]").forEach(el =>
    el.onclick = () => challengeFriend(friends.find(x => x.id === el.dataset.pchal)));
  screen.querySelectorAll("[data-pchat]").forEach(el =>
    el.onclick = () => openChat(friends.find(x => x.id === el.dataset.pchat)));
  $("p-out").onclick = doSignOut;
  $("p-del").onclick = deleteAccountFlow;
}

// Permanent account deletion. Online it needs the password (Firebase requires a
// recent sign-in to delete the auth user); offline it just clears the device.
function deleteAccountFlow() {
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel">
    <b>Delete your account?</b>
    <span style="font-size:12.5px;color:var(--ink2);line-height:1.5">This permanently removes your
      profile, rating, stats and friends links${backend.isLive ? " — enter your password to confirm" : ""}.
      It cannot be undone.</span>
    ${backend.isLive ? pwField("da-pass", "Your password") : ""}
    <div class="err" id="da-err"></div>
    <button class="primary" id="da-go" style="background:var(--bad);box-shadow:none">Delete forever</button>
    <button class="ghost" id="da-close">Keep my account</button></div>`;
  $("da-close").onclick = () => overlay.classList.remove("on");
  if (backend.isLive) { wirePwEye("da-pass"); $("da-pass").focus(); }
  $("da-go").onclick = async () => {
    const err = $("da-err");
    const pw = backend.isLive ? $("da-pass").value : null;
    if (backend.isLive && !pw) return err.textContent = "Enter your password to confirm.";
    $("da-go").disabled = true;
    err.textContent = "Deleting…";
    try {
      const uid = P.id;
      await backend.deleteAccount(P, pw);
      localStorage.removeItem("mindspar-e2e-" + uid);
      overlay.classList.remove("on");
      await doSignOut();
      toast("Your account has been deleted.");
    } catch (e) {
      $("da-go").disabled = false;
      err.textContent = (e.message || "Couldn't delete — try again.").replace("Firebase: ", "");
    }
  };
}

// Downscale to a small square JPEG data URL so the profile doc stays light.
function resizePhoto(file) {
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale, h = img.height * scale;
    canvas.getContext("2d").drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    P.photo = canvas.toDataURL("image/jpeg", .82);
    persist();
    renderProfile();
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
}

// ---------------- installable app (PWA) ----------------
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
let deferredInstall = null;

function initPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW register failed", e));
  }
  // Android/desktop Chrome fires this; stash it so our button can trigger install.
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredInstall = e;
    if (!arena.classList.contains("on") && !chatEl.classList.contains("on")) render();
  });
  window.addEventListener("appinstalled", () => { deferredInstall = null; toast("Mindspar installed 🎉"); });
}

// Home-screen banner: a real Install button where the browser supports it, or
// iOS "Add to Home Screen" guidance (Safari gives no install prompt). Shown
// until installed or dismissed.
function installBanner() {
  if (isStandalone() || localStorage.getItem("mindspar-install-x") === "1") return "";
  if (deferredInstall) {
    return `<div class="cardbox install-card">
      <div><b>Install Mindspar</b><span>Add it to your home screen — it opens full-screen like an app.</span></div>
      <div class="install-actions">
        <button class="smallbtn" id="pwa-install">Install</button>
        <button class="ghost" id="pwa-x">Not now</button></div></div>`;
  }
  if (isIOS()) {
    return `<div class="cardbox install-card ios">
      <b>Add Mindspar to your home screen</b>
      <div class="install-note">Open this page in <em>Safari</em> (not Chrome or an in-app browser),
        tap the <em>Share</em> button — the square with an up arrow — then scroll down and choose
        “Add to Home Screen.”</div>
      <button class="ghost" id="pwa-x" style="padding:8px 0 0">Got it</button></div>`;
  }
  return "";
}

function wireInstallBanner() {
  const x = $("pwa-x");
  if (x) x.onclick = () => { localStorage.setItem("mindspar-install-x", "1"); render(); };
  const btn = $("pwa-install");
  if (btn) btn.onclick = async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => {});
    deferredInstall = null;
    render();
  };
}

// Fill the bottom-tab icons (SVG, not glyphs).
document.querySelectorAll(".tico").forEach(el => { el.innerHTML = ic(el.dataset.ic, "23px"); });

initPWA();
boot();
