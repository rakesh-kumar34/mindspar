// Mindspar web client. Runs offline (local profile + bots) with no setup;
// real accounts, email invites, and live rating-matched duels switch on when
// firebase-config.js is filled in — same graceful degradation as the iOS app.
import { QUESTIONS } from "./questions.js";
import { firebaseConfig } from "./firebase-config.js";
import { createIdentity, unwrapIdentity, makeChannel } from "./e2e.js";
import { COUNTRIES, flagOf, countryName } from "./countries.js";

// ---------------- game math (mirrors the Swift services) ----------------
const LIMIT = 18, N = 8, MIN_ANSWERS = 16;
const DOMAINS = {
  reasoning: ["Reasoning", "#5457e8", "◫"], math: ["Math", "#0f85d4", "∑"],
  verbal: ["Verbal", "#cc5624", "❝"], knowledge: ["Knowledge", "#8c5cd4", "◍"],
  science: ["Science", "#219e78", "⚛"], patterns: ["Patterns", "#c48c1c", "≋"],
};
const BOTS = [
  { id: "vega", name: "Vega", tag: "Numbers move first", glyph: "∑", rating: 1150,
    acc: { math: .9, patterns: .85, reasoning: .7, verbal: .55, knowledge: .55, science: .65 }, min: 2.5, max: 7 },
  { id: "lyra", name: "Lyra", tag: "Reads between every line", glyph: "❝", rating: 1100,
    acc: { verbal: .9, knowledge: .8, reasoning: .7, math: .55, patterns: .55, science: .65 }, min: 3, max: 8 },
  { id: "atlas", name: "Atlas", tag: "Knows a little about everything", glyph: "◍", rating: 1050,
    acc: { knowledge: .88, science: .8, verbal: .7, reasoning: .6, math: .6, patterns: .6 }, min: 2.5, max: 7.5 },
  { id: "kepler", name: "Kepler", tag: "Methodical, rarely wrong, never fast", glyph: "⚛", rating: 1250,
    acc: { science: .92, reasoning: .8, math: .75, patterns: .75, verbal: .65, knowledge: .7 }, min: 6, max: 12 },
  { id: "dash", name: "Dash", tag: "Answers before you finish reading", glyph: "⚡", rating: 900,
    acc: { reasoning: .62, math: .62, verbal: .62, knowledge: .62, science: .62, patterns: .62 }, min: 1.2, max: 3.5 },
];

const tier = r => r < 900 ? "Novice" : r < 1050 ? "Adept" : r < 1200 ? "Scholar" : r < 1350 ? "Sage" : "Luminary";
const ladder = r => r < 950 ? 1.5 : r < 1150 ? 2 : r < 1300 ? 2.4 : 2.8;
const eloDelta = (mine, theirs, actual) => Math.round(32 * (actual - 1 / (1 + 10 ** ((theirs - mine) / 400))));
const AGEREF = { "18–24": .63, "25–34": .64, "35–44": .62, "45–54": .60, "55+": .58 };
const yearsOld = dob => (Date.now() - new Date(dob)) / 31557600000;
const ageGroup = dob => { const y = yearsOld(dob); return y < 25 ? "18–24" : y < 35 ? "25–34" : y < 45 ? "35–44" : y < 55 ? "45–54" : "55+"; };
const speedF = ms => Math.max(0, Math.min(1, 1 - ms / 1000 / LIMIT));
const scoreFor = (ok, ms) => ok ? 100 + Math.round(50 * speedF(ms)) : 0;
const qById = Object.fromEntries(QUESTIONS.map(q => [q[0], q]));

function sparScore(P) {
  const answered = Object.values(P.dA).reduce((a, b) => a + b, 0);
  if (answered < MIN_ANSWERS) return null;
  const acc = Object.values(P.dC).reduce((a, b) => a + b, 0) / answered;
  const speed = P.sfN ? P.sfSum / P.sfN : .5;
  const z = ((acc * .7 + speed * .3) - AGEREF[ageGroup(P.dob)]) / .14;
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
  // Offline has no email to verify — sign-up creates the profile directly.
  async resendVerification() {}, async refreshVerified() { return true; },
  async completeSignup() { return JSON.parse(localStorage.getItem("mindspar-web")); },
  async signOut() { localStorage.removeItem("mindspar-web"); },
  async save(profile) { localStorage.setItem("mindspar-web", JSON.stringify(profile)); },
  async findMatch() { throw new Error("Online play needs Firebase — see web/README.md. Bots are ready!"); },
  async cancelSearch() {},
  async sendInvite() { throw new Error("Online play needs Firebase — see web/README.md."); },
  listenInvites() {},
  async acceptInvite() { throw new Error("Online play needs Firebase."); },
  submitAnswer() {}, listenOpponent() {}, stopMatch() {},
  // Friends + chat require accounts, so they're online-only.
  async publishIdentity() {},
  async sendFriendRequest() { throw new Error("Friends need Firebase — see web/README.md."); },
  listenFriendRequests() {}, async acceptFriendRequest() {}, async declineFriendRequest() {},
  async listFriends() { return []; }, listenFriends() { return () => {}; },
  sendMessage() {}, listenMessages() { return () => {}; },
  markRead() {}, listenChatMeta() { return () => {}; }, listenLatest() { return () => {}; },
  async getPubKey() { return null; },
};

function newProfile(id, { name, email, dob, country }) {
  return { id, name, email: email.toLowerCase(), dob, country: country || "", photo: null,
           pubKey: null, encPriv: null, encPrivIv: null, encPrivSalt: null,
           createdAt: Date.now(),
           rating: 1000, played: 0, won: 0, streak: 0, best: 0,
           dA: {}, dC: {}, sfSum: 0, sfN: 0, seen: {} };
}

async function makeFirebaseBackend(config) {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js");
  const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
          signOut, onAuthStateChanged, sendEmailVerification } =
    await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
  const { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, getDocs,
          collection, query, where, orderBy, limit, onSnapshot, arrayUnion, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // Session listeners (invites, friend requests, friends) live for the whole
  // sign-in; match listeners (lobby, opponent feed) are torn down when a duel
  // ends. Keeping them separate means finishing a match no longer kills the
  // invite/friend feeds.
  let sessionSubs = [], matchSubs = [];
  const stopSession = () => { sessionSubs.forEach(u => u()); sessionSubs = []; };
  const stopMatchSubs = () => { matchSubs.forEach(u => u()); matchSubs = []; };
  const chatId = (a, b) => [a, b].sort().join("__");

  const authReady = new Promise(resolve => {
    const stop = onAuthStateChanged(auth, user => { stop(); resolve(user); });
  });

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
      return snap.exists() ? snap.data() : null;
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
      if (existing.exists()) return existing.data();
      if (!pending || !pending.name || !pending.dob)
        throw new Error("Let's set up your profile again — please sign up.");
      const profile = newProfile(u.uid, pending);
      if (pending.identity) Object.assign(profile, pending.identity); // pubKey + wrapped priv
      await setDoc(doc(db, "users", profile.id), profile);
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
      return snap.data();
    },
    async signOut() { stopSession(); stopMatchSubs(); await signOut(auth); },
    async publishIdentity(uid, idn) {
      await updateDoc(doc(db, "users", uid), {
        pubKey: idn.pub, encPriv: idn.encPriv, encPrivIv: idn.encPrivIv, encPrivSalt: idn.encPrivSalt });
    },
    async save(profile) { await setDoc(doc(db, "users", profile.id), profile); },

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
      const stop = onSnapshot(doc(db, "invites", inviteRef.id), async snap => {
        if (snap.get("status") !== "accepted") return;
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
        country: d.get("country") ?? "",
        photo: d.get("photo") ?? null, email: d.get("email"), pubKey: d.get("pubKey") ?? null,
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
let myKeys = null, friends = [], friendReqs = [];       // friends + E2E chat
let chatFriend = null, chatUnsub = null, chatMetaUnsub = null, chatChannel = null, chatCache = new Map();
let chatMeta = {};                                       // read receipts for the open chat
const latestStops = new Map(), unreadBy = new Map(), lastSeenMsg = new Map();
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
}
applyTheme(theme);

// ---- idle auto sign-out: 30 minutes with no interaction, an industry-standard
// session timeout. Any pointer/key/touch activity resets the clock. ----
const IDLE_MS = 30 * 60 * 1000;
let idleTimer;
function armIdleTimer() {
  clearTimeout(idleTimer);
  if (!P) return;
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
function setTab(t) {
  tab = t;
  $("t-play").classList.toggle("on", t === "play");
  $("t-friends").classList.toggle("on", t === "friends");
  $("t-prof").classList.toggle("on", t === "prof");
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
  backend.listenFriendRequests(P, list => { friendReqs = list; updateFriendBadge(); if (tab === "friends") renderFriends(); });
  backend.listenFriends(P, list => {
    friends = list;
    watchUnread();
    if (tab === "friends" && !chatFriend) renderFriends();
    else if (tab === "prof") renderProfile();
  });
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
      unreadBy.set(f.id, unread);
      // A newly-arrived unread message from someone we're not chatting with → alert.
      if (unread && mMs > (lastSeenMsg.get(f.id) || 0) && chatFriend?.id !== f.id) {
        notifyMessage(f);
      }
      if (mMs) lastSeenMsg.set(f.id, mMs);
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
async function setupIdentity(password) {
  if (!backend.isLive || !P) { myKeys = null; return; }
  let cache = cachedPriv(P.id);
  // If the published public key no longer matches the locally cached one, this
  // device's key is stale (e.g. the identity was re-established elsewhere) —
  // drop it and re-unwrap from the password so all devices converge.
  if (cache && P.pubKey && JSON.stringify(cache.pub) !== JSON.stringify(P.pubKey)) cache = null;
  try {
    if (P.encPriv && P.pubKey) {
      if (!cache && password) {
        const priv = await unwrapIdentity(password, P);
        cache = { pub: P.pubKey, priv };
        cachePriv(P.id, cache);
      }
    } else if (password) {
      // No wrapped identity yet (new or legacy account) — create one now.
      const idn = await createIdentity(password);
      P.pubKey = idn.pub; P.encPriv = idn.encPriv;
      P.encPrivIv = idn.encPrivIv; P.encPrivSalt = idn.encPrivSalt;
      await backend.publishIdentity(P.id, idn);
      cache = { pub: idn.pub, priv: idn.priv };
      cachePriv(P.id, cache);
    }
  } catch (e) { console.error("Chat identity setup failed", e); }
  myKeys = cache && cache.priv ? { pub: cache.pub, priv: cache.priv } : null;
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
  latestStops.forEach(s => s()); latestStops.clear();
  unreadBy.clear(); lastSeenMsg.clear();
  await backend.signOut();
  P = null; invites = []; friends = []; friendReqs = []; myKeys = null;
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
}

// ---------------- auth ----------------
let authMode = "signup";
function renderAuth() {
  const signup = authMode === "signup";
  screen.innerHTML = `<div class="pad" style="justify-content:center;gap:13px">
    <div style="text-align:center;margin-bottom:6px">
      <div class="serif" style="font-size:42px;font-weight:600">Mindspar</div>
      <div style="font-size:13px;color:var(--ink2);margin-top:6px;line-height:1.5">
        Head-to-head thinking duels.<br>Reasoning · Math · Verbal · Knowledge · Science · Patterns</div>
    </div>
    ${signup ? `<input id="a-name" placeholder="Your name" autocomplete="name">` : ""}
    <input id="a-email" type="email" placeholder="Email" autocomplete="email">
    <input id="a-pass" type="password" placeholder="Password (6+ characters)">
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
    <button class="ghost" id="a-switch">${signup ? "Already have an account? Sign in" : "New here? Create an account"}</button>
    ${backend.isLive
      ? (signup ? `<div class="fine">We'll email you a link to confirm your address — you'll verify it before playing.</div>` : "")
      : `<div class="fine">Running offline — your profile stays in this browser. Online play switches on once Firebase is configured (web/README.md).</div>`}
    <div class="fine">Mindspar is for adults 18 and over.</div>
  </div>`;
  $("a-switch").onclick = () => { authMode = signup ? "signin" : "signup"; renderAuth(); };
  $("a-go").onclick = submitAuth;
}

async function submitAuth() {
  const err = $("a-err");
  const email = $("a-email").value.trim(), password = $("a-pass").value;
  try {
    if (authMode === "signin") {
      P = await backend.signIn(email, password);
      if (backend.isLive) await setupIdentity(password);
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
      <div style="font-size:12.5px;color:var(--ink2);margin-top:4px">${N} questions · six domains · speed counts</div>
    </div>
    <div><span class="tierpill">${tier(P.rating).toUpperCase()} <i>${P.rating}</i></span></div>
    ${invites.map(inv => `
      <div class="invitecard"><div class="row">
        <span style="font-size:14px"><b>${flagOf(inv.fromCountry)} ${esc(inv.fromName)}</b> challenged you
          <span style="color:var(--ink2)">· ${inv.fromRating}</span></span>
        <button class="smallbtn" data-inv="${inv.id}">Accept</button>
      </div></div>`).join("")}
    <button class="playrow" id="h-quick">
      <span class="sig hot">⚔︎</span>
      <span><b>Quick Match</b><span>${backend.isLive
        ? `A player near your rating · ${tier(P.rating)} band`
        : "Needs online play — see web/README.md"}</span></span></button>
    <button class="playrow" id="h-invite">
      <span class="sig">✉︎</span>
      <span><b>Challenge a Friend</b><span>Invite by email</span></span></button>
    <div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:14px">
        <span class="sig">▣</span>
        <span><b style="font-size:15px">Duel a Bot</b><br>
        <span style="font-size:12.5px;color:var(--ink2)">Pick a mind — and a subject</span></span>
      </div>
      <div class="chips">${[["All", "#5457e8", null],
        ...Object.entries(DOMAINS).map(([k, v]) => [v[0], v[1], k])].map(([t, c, k]) =>
        `<button class="chip" data-dom="${k ?? ""}" style="${subject === k
          ? `background:${c};color:#fff` : `background:${c}18;color:${c}`}">${t}</button>`).join("")}</div>
      <div style="display:flex;flex-direction:column;gap:8px">${BOTS.map(b => `
        <button class="playrow" style="box-shadow:none;padding:12px 14px" data-bot="${b.id}">
          <span class="sig" style="width:40px;height:40px">${b.glyph}</span>
          <span><b style="font-size:14px">${b.name}
            <i style="font-style:normal;font-weight:500;font-size:11px;color:var(--ink2)">· ${b.rating}</i></b>
          <span>${b.tag}</span></span></button>`).join("")}</div>
    </div>
  </div>`;
  $("h-quick").onclick = quickMatch;
  $("h-invite").onclick = inviteFlow;
  screen.querySelectorAll("[data-dom]").forEach(el =>
    el.onclick = () => { subject = el.dataset.dom || null; renderHome(); });
  screen.querySelectorAll("[data-bot]").forEach(el =>
    el.onclick = () => startBotDuel(el.dataset.bot));
  screen.querySelectorAll("[data-inv]").forEach(el =>
    el.onclick = () => acceptInvite(el.dataset.inv));
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
  if (!backend.isLive) return toast("Online play needs Firebase — duel a bot meanwhile!");
  searchingPanel("Finding an opponent…",
    `Searching the ${tier(P.rating)} band (${P.rating - 200}–${P.rating + 200})`,
    async () => { overlay.classList.remove("on"); await backend.cancelSearch(P); });
  try {
    await backend.findMatch(P, human => {
      if (!overlay.classList.contains("on")) return;
      overlay.classList.remove("on");
      startHumanDuel(human);
    });
  } catch (e) { overlay.classList.remove("on"); toast(e.message); }
}

function inviteFlow() {
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel">
    <b>Challenge a Friend</b>
    <input id="inv-email" type="email" placeholder="Friend's email" autocomplete="off">
    <div class="err" id="inv-err"></div>
    <button class="primary" id="inv-send">Send Challenge</button>
    <button class="ghost" id="inv-close">Close</button></div>`;
  $("inv-close").onclick = () => overlay.classList.remove("on");
  $("inv-send").onclick = () => {
    const email = $("inv-email").value.trim();
    if (!email) return;
    if (!backend.isLive) return $("inv-err").textContent = "Online play needs Firebase — see web/README.md.";
    startInvite(email);
  };
}

// Send a challenge and give immediate feedback: confirm it went out, then show
// a waiting panel that times out instead of spinning forever if they're away.
async function startInvite(email, name) {
  if (!backend.isLive) return toast("Online play needs Firebase — duel a bot meanwhile!");
  overlay.classList.add("on");
  overlay.innerHTML = `<div class="panel"><div class="spin"></div><b>Sending challenge…</b></div>`;
  let timeout;
  try {
    await backend.sendInvite(email, P, human => {
      clearTimeout(timeout);
      if (!overlay.classList.contains("on")) return;
      overlay.classList.remove("on");
      startHumanDuel(human);
    });
    // sendInvite resolves once the invite is written — the opponent exists.
    toast(`Challenge sent${name ? " to " + name : ""} — waiting for them to accept.`);
    searchingPanel(`Waiting for ${name || "them"} to accept…`,
      "They'll see it on their home screen and in Friends",
      () => { clearTimeout(timeout); overlay.classList.remove("on"); backend.stopMatch(); });
    timeout = setTimeout(() => {
      if (!overlay.classList.contains("on")) return;
      overlay.classList.remove("on");
      backend.stopMatch();
      toast(`${name || "They"} hasn't responded yet — they'll still see your challenge.`);
    }, 60000);
  } catch (e) {
    overlay.classList.remove("on");
    toast(e.message);
  }
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

// A short "flag / bot" tag shown before the opponent's name.
const oppTag = o => o && o.isBot ? "🤖" : (o && o.country ? flagOf(o.country) : "");

function startBotDuel(botId) {
  const bot = BOTS.find(b => b.id === botId);
  OPP = { name: bot.name, rating: bot.rating, isBot: true };
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
  OPP = { name: human.oppName, rating: human.oppRating, country: human.oppCountry || "" };
  liveMatch = human;
  cards = human.deckIds.map(id => qById[id]).filter(Boolean);
  if (cards.length === 0) return toast("Match deck failed to load.");
  beginDuel(() => {
    backend.listenOpponent(human.matchId, human.oppId, a =>
      receiveOpponent({ ok: a.c, pts: a.p }));
  });
}

function beginDuel(startFeed) {
  idx = 0; my = []; opp = []; botTimers = [];
  arena.classList.add("on");
  startFeed();
  let n = 3;
  const countdown = () => {
    arena.innerHTML = `<div class="center">
      <div class="vs">vs ${oppTag(OPP)} ${esc(OPP.name)} · ${OPP.rating}</div>
      <div class="big">${n}</div></div>`;
    if (n-- > 1) setTimeout(countdown, 800); else setTimeout(ask, 800);
  };
  countdown();
}

function receiveOpponent(answer) {
  opp.push(answer);
  paintBoard();
}

function ask() {
  const q = cards[idx], [label, color] = DOMAINS[q[1]];
  arena.innerHTML = `
    <div class="tbar"><i id="tfill"></i></div>
    <div class="meta"><span>Q${idx + 1}/${cards.length}</span>
      <span class="dchip" style="color:${color};background:${color}2e">${label}</span></div>
    <div class="prompt">${esc(q[3])}</div>
    <div class="opts">${q[4].map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join("")}</div>
    <div class="board" id="board"></div>`;
  arena.querySelectorAll(".opt").forEach(el => el.onclick = () => pick(+el.dataset.i));
  paintBoard();
  t0 = Date.now();
  const fill = $("tfill");
  clearInterval(timer);
  timer = setInterval(() => {
    const left = Math.max(0, LIMIT - (Date.now() - t0) / 1000);
    fill.style.width = (left / LIMIT * 100) + "%";
    fill.style.background = left / LIMIT > .3 ? "var(--iris)" : "var(--bad)";
    if (left <= 0) pick(null);
  }, 50);
}

function pick(i) {
  clearInterval(timer);
  const q = cards[idx], ms = Math.min(Date.now() - t0, LIMIT * 1000), ok = i === q[5];
  const answer = { ok, ms, pts: scoreFor(ok, ms) };
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
  setTimeout(() => { idx++; idx < cards.length ? ask() : waitOrEnd(); }, 1100);
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
function paintBoard() {
  const board = $("board");
  if (!board) return;
  board.innerHTML = `
    <div class="side me"><div class="nm">YOU</div><div class="sc">${total(my)}</div>
      <div class="pg">${my.length}/${cards.length}</div></div>
    <div class="side"><div class="nm">${oppTag(OPP)} ${esc(OPP.name.toUpperCase())}</div><div class="sc">${total(opp)}</div>
      <div class="pg">${opp.length}/${cards.length}</div></div>`;
}

function end() {
  botTimers.forEach(clearTimeout);
  if (liveMatch) backend.stopMatch();
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
  persist();

  const headline = actual === 1 ? "Victory" : actual === 0 ? "Defeat" : "Draw";
  const dots = Object.keys(DOMAINS).map(d => {
    const row = cards.map((q, i) => q[1] === d
      ? `<span class="dot" style="background:${my[i]?.ok ? "var(--good)" : "var(--bad)"}"></span>` : "").join("");
    return row ? `<div class="row"><span class="lbl" style="color:${DOMAINS[d][1]}">${DOMAINS[d][0]}</span>${row}</div>` : "";
  }).join("");
  arena.innerHTML = `<div class="center">
    <div class="headline">${headline}</div>
    <div class="finals">
      <div class="fs ${mine >= theirs ? "win" : ""}"><div class="n">YOU</div><div class="v">${mine}</div></div>
      <div style="color:rgba(255,255,255,.4)">–</div>
      <div class="fs ${theirs > mine ? "win" : ""}"><div class="n">${oppTag(OPP)} ${esc(OPP.name.toUpperCase())}</div><div class="v">${theirs}</div></div>
    </div>
    <div class="delta" style="${delta >= 0
      ? "color:#7de0a8;background:rgba(33,176,107,.15)"
      : "color:#f29b9c;background:rgba(219,69,71,.15)"}">
      ${delta >= 0 ? "+" : ""}${delta} rating · now ${P.rating} · ${tier(P.rating)}</div>
    <div class="dots">${dots}</div>
    <button class="lightbtn" id="d-done">Continue</button>
  </div>`;
  $("d-done").onclick = () => { arena.classList.remove("on"); render(); };
}

// ---------------- friends ----------------
function renderFriends() {
  if (!backend.isLive) {
    screen.innerHTML = `<div class="pad">
      <div class="serif" style="font-size:24px;font-weight:600">Friends</div>
      <div class="cardbox" style="padding:20px;font-size:13.5px;color:var(--ink2);line-height:1.6">
        Adding friends and encrypted chat need an online account. This browser is
        running in offline mode — see web/README.md to switch it on.</div></div>`;
    return;
  }
  const reqRows = friendReqs.map(r => `
    <div class="frow"><span class="fav">${esc((r.fromName || "?")[0].toUpperCase())}</span>
      <span class="fmeta"><b>${flagOf(r.fromCountry)} ${esc(r.fromName)}</b><span>wants to be friends · ${r.fromRating ?? 1000}</span></span>
      <span class="fbtns">
        <button class="smallbtn" data-acc="${r.id}">Accept</button>
        <button class="chip" style="background:var(--iris-soft);color:var(--ink2)" data-dec="${r.id}">Ignore</button>
      </span></div>`).join("");
  const friendRows = friends.length ? friends.map(f => {
    const unread = unreadBy.get(f.id);
    return `<div class="frow ${unread ? "unread" : ""}">
      <span class="fav">${f.photo
        ? `<img src="${f.photo}" alt="">` : esc((f.name || "?")[0].toUpperCase())}${unread ? `<i class="undot"></i>` : ""}</span>
      <span class="fmeta"><b>${flagOf(f.country)} ${esc(f.name)}</b>
        <span>${unread ? `<b style="color:var(--iris)">New message</b> · ` : ""}${tier(f.rating)} · ${f.rating}</span></span>
      <span class="fbtns">
        <button class="smallbtn" data-chal="${f.id}">Challenge</button>
        <button class="smallbtn" data-chat="${f.id}">Message</button>
      </span></div>`;
  }).join("")
    : `<div class="cardbox" style="padding:18px;font-size:13px;color:var(--ink2);text-align:center">
         No friends yet — add someone by email above to challenge and chat.</div>`;

  screen.innerHTML = `<div class="pad" style="gap:14px">
    <div class="serif" style="font-size:24px;font-weight:600">Friends</div>
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
    el.onclick = () => { const f = friends.find(x => x.id === el.dataset.chal); startInvite(f.email, f.name); });
  screen.querySelectorAll("[data-chat]").forEach(el =>
    el.onclick = () => openChat(friends.find(x => x.id === el.dataset.chat)));
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
    <input id="ec-pass" type="password" placeholder="Your account password" autocomplete="current-password">
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
      <span class="fav sm">${f.photo ? `<img src="${f.photo}" alt="">` : esc((f.name || "?")[0].toUpperCase())}</span>
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

// ---------------- profile ----------------
const TIERS = [["Novice", 0, 900], ["Adept", 900, 1050], ["Scholar", 1050, 1200],
               ["Sage", 1200, 1350], ["Luminary", 1350, 1500]];
const fmtDate = ms => ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";

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
    return `<div class="srow"><span style="color:${c};width:20px">${g}</span>
      <span class="sl">${t}</span>
      <span class="bar"><i style="width:${pct ?? 0}%;background:${c}"></i></span>
      <span class="pv">${pct === null ? "—" : pct + "%"}</span>
      <span class="pn">${n || ""}</span></div>`;
  }).join("");

  screen.innerHTML = `<div class="pad" style="gap:14px">
    <div style="text-align:center;padding-top:6px">
      <div class="avatar" id="p-avatar" style="cursor:pointer" title="Add a photo">${P.photo
        ? `<img src="${P.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : esc(P.name[0].toUpperCase())}</div>
      <input type="file" id="p-file" accept="image/*" style="display:none">
      <button class="ghost" id="p-photo" style="margin-top:2px">${P.photo ? "Change photo" : "Add photo"}</button>
      <div class="serif" style="font-size:25px;font-weight:600">${P.country ? flagOf(P.country) + " " : ""}${esc(P.name)}</div>
      <div style="font-size:12px;color:var(--ink2);margin-top:3px">${esc(P.email || "")}${
        P.country ? " · " + countryName(P.country) : ""}</div>
      <div style="margin-top:8px"><span class="tierpill">${tName.toUpperCase()}
        <i>${P.rating} · ${ageGroup(P.dob)}</i></span></div>
      ${P.createdAt ? `<div style="font-size:11px;color:var(--ink2);margin-top:7px">Member since ${fmtDate(P.createdAt)}</div>` : ""}
    </div>

    <div class="cardbox" style="padding:24px;text-align:center">
      <div class="eyebrow">MINDSPAR SCORE</div>
      ${score !== null
        ? `<div class="score">${score}</div>
           <div style="font-size:11.5px;color:var(--ink2)">Normalized within ${ageGroup(P.dob)} · mean 100</div>`
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

    ${backend.isLive ? `<div class="cardbox" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div class="rank-top"><span class="eyebrow">FRIENDS</span>
        <button class="ghost" id="p-friends-all" style="padding:0;font-weight:600;color:var(--iris)">Manage</button></div>
      ${friends.length ? friends.map(f => `
        <div class="frow" style="box-shadow:none;padding:0;border:none;background:none">
          <span class="fav sm">${f.photo ? `<img src="${f.photo}" alt="">` : esc((f.name || "?")[0].toUpperCase())}${unreadBy.get(f.id) ? `<i class="undot"></i>` : ""}</span>
          <span class="fmeta"><b>${flagOf(f.country)} ${esc(f.name)}</b><span>${unreadBy.get(f.id) ? `<b style="color:var(--iris)">New message</b> · ` : ""}${tier(f.rating)} · ${f.rating}</span></span>
          <span class="fbtns">
            <button class="smallbtn" data-pchal="${f.id}">Challenge</button>
            <button class="smallbtn" data-pchat="${f.id}">Message</button>
          </span></div>`).join("")
        : `<div style="font-size:12.5px;color:var(--ink2)">No friends yet — add someone from the Friends tab.</div>`}
    </div>` : ""}

    <div class="cardbox" style="padding:16px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:14px;font-weight:500">Appearance</span>
      <div class="seg"><button class="seg-b ${theme === "light" ? "on" : ""}" data-th="light">Light</button>
        <button class="seg-b ${theme === "dark" ? "on" : ""}" data-th="dark">Dark</button></div>
    </div>

    <div class="fine">The Mindspar Score reflects your relative performance in this game, normalized by
      age group. It is an entertainment estimate — not a clinical or psychometric IQ assessment.</div>
    <button class="ghost" id="p-out">Sign out</button>
  </div>`;

  const fileInput = $("p-file");
  $("p-avatar").onclick = () => fileInput.click();
  $("p-photo").onclick = () => fileInput.click();
  fileInput.onchange = () => resizePhoto(fileInput.files[0]);
  screen.querySelectorAll("[data-th]").forEach(el =>
    el.onclick = () => { applyTheme(el.dataset.th); renderProfile(); });
  const allBtn = $("p-friends-all");
  if (allBtn) allBtn.onclick = () => setTab("friends");
  screen.querySelectorAll("[data-pchal]").forEach(el =>
    el.onclick = () => { const f = friends.find(x => x.id === el.dataset.pchal); startInvite(f.email, f.name); });
  screen.querySelectorAll("[data-pchat]").forEach(el =>
    el.onclick = () => openChat(friends.find(x => x.id === el.dataset.pchat)));
  $("p-out").onclick = doSignOut;
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

boot();
