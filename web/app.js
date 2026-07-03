// Mindspar web client. Runs offline (local profile + bots) with no setup;
// real accounts, email invites, and live rating-matched duels switch on when
// firebase-config.js is filled in — same graceful degradation as the iOS app.
import { QUESTIONS } from "./questions.js";
import { firebaseConfig } from "./firebase-config.js";

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
  async signOut() { localStorage.removeItem("mindspar-web"); },
  async save(profile) { localStorage.setItem("mindspar-web", JSON.stringify(profile)); },
  async findMatch() { throw new Error("Online play needs Firebase — see web/README.md. Bots are ready!"); },
  async cancelSearch() {},
  async sendInvite() { throw new Error("Online play needs Firebase — see web/README.md."); },
  listenInvites() {},
  async acceptInvite() { throw new Error("Online play needs Firebase."); },
  submitAnswer() {}, listenOpponent() {}, stopMatch() {},
};

function newProfile(id, { name, email, dob }) {
  return { id, name, email: email.toLowerCase(), dob, photo: null,
           rating: 1000, played: 0, won: 0, streak: 0, best: 0,
           dA: {}, dC: {}, sfSum: 0, sfN: 0, seen: {} };
}

async function makeFirebaseBackend(config) {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js");
  const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
          signOut, onAuthStateChanged } =
    await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
  const { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, getDocs,
          collection, query, where, orderBy, limit, onSnapshot, arrayUnion, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let unsubs = [];
  const stopAll = () => { unsubs.forEach(u => u()); unsubs = []; };

  const authReady = new Promise(resolve => {
    const stop = onAuthStateChanged(auth, user => { stop(); resolve(user); });
  });

  return {
    isLive: true,
    async restore() {
      const user = await authReady;
      if (!user) return null;
      const snap = await getDoc(doc(db, "users", user.uid));
      return snap.exists() ? snap.data() : null;
    },
    async signUp(fields) {
      const cred = await createUserWithEmailAndPassword(auth, fields.email, fields.password);
      const profile = newProfile(cred.user.uid, fields);
      await setDoc(doc(db, "users", profile.id), profile);
      return profile;
    },
    async signIn(email, password) {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (!snap.exists()) throw new Error("Profile not found.");
      return snap.data();
    },
    async signOut() { stopAll(); await signOut(auth); },
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
          players: { [P.id]: { name: P.name, rating: P.rating },
                     [claim.id]: { name: claim.get("name") ?? "Player", rating: oppRating } },
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "lobby", claim.id), { matchId: matchRef.id });
        onMatch({ matchId: matchRef.id, oppId: claim.id,
                  oppName: claim.get("name") ?? "Player", oppRating, deckIds });
        return;
      }
      // Nobody suitable: wait in the lobby to be claimed.
      await setDoc(doc(db, "lobby", P.id), {
        name: P.name, rating: P.rating, createdAt: serverTimestamp(),
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
                  deckIds: match.get("deckIds") ?? [] });
      });
      unsubs.push(stop);
    },
    async cancelSearch(P) { stopAll(); await deleteDoc(doc(db, "lobby", P.id)).catch(() => {}); },

    // --- email invites ---
    async sendInvite(email, P, onMatch) {
      const key = email.toLowerCase().trim();
      const found = await getDocs(query(collection(db, "users"), where("email", "==", key), limit(1)));
      if (found.empty) throw new Error("No player found with that email.");
      const inviteRef = await addDoc(collection(db, "invites"), {
        fromId: P.id, fromName: P.name, fromRating: P.rating,
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
                  deckIds: match.get("deckIds") ?? [] });
      });
      unsubs.push(stop);
    },
    listenInvites(P, onChange) {
      const stop = onSnapshot(
        query(collection(db, "invites"),
              where("toEmail", "==", P.email), where("status", "==", "pending")),
        snap => onChange(snap.docs.map(d => ({
          id: d.id, fromId: d.get("fromId"),
          fromName: d.get("fromName") ?? "Player", fromRating: d.get("fromRating") ?? 1000,
        }))));
      unsubs.push(stop);
    },
    async acceptInvite(invite, P) {
      const target = ladder(Math.round((P.rating + invite.fromRating) / 2));
      const deckIds = buildDeck({ targetDifficulty: target }).map(q => q[0]);
      const matchRef = await addDoc(collection(db, "matches"), {
        deckIds, targetDifficulty: target,
        players: { [P.id]: { name: P.name, rating: P.rating },
                   [invite.fromId]: { name: invite.fromName, rating: invite.fromRating } },
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "invites", invite.id), { status: "accepted", matchId: matchRef.id });
      return { matchId: matchRef.id, oppId: invite.fromId,
               oppName: invite.fromName, oppRating: invite.fromRating, deckIds };
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
      unsubs.push(stop);
    },
    stopMatch() { stopAll(); },
  };
}

// ---------------- app state & shell ----------------
const $ = id => document.getElementById(id);
const screen = $("screen"), tabs = $("tabs"), arena = $("arena"), overlay = $("overlay");
let backend = localBackend, P = null, tab = "play", invites = [], subject = null;
let toastTimer;

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
$("t-prof").onclick = () => setTab("prof");
function setTab(t) {
  tab = t;
  $("t-play").classList.toggle("on", t === "play");
  $("t-prof").classList.toggle("on", t === "prof");
  render();
}

async function boot() {
  if (firebaseConfig) {
    try { backend = await makeFirebaseBackend(firebaseConfig); }
    catch (e) { console.error(e); toast("Firebase failed to load — running offline."); }
  }
  P = await backend.restore();
  if (P && backend.isLive) startInviteListener();
  render();
}

function startInviteListener() {
  backend.listenInvites(P, list => { invites = list; if (tab === "play" && !arena.classList.contains("on")) render(); });
}

async function persist() { try { await backend.save(P); } catch (e) { console.error(e); } }

function render() {
  if (!P) { tabs.style.display = "none"; return renderAuth(); }
  tabs.style.display = "flex";
  tab === "play" ? renderHome() : renderProfile();
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
    <div class="cardbox" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <label style="font-size:13px;color:var(--ink2)" for="a-dob">Date of birth</label>
      <input id="a-dob" type="date" max="${new Date().toISOString().slice(0, 10)}">
      <label class="check"><input id="a-adult" type="checkbox"> I confirm I am 18 years or older</label>
    </div>` : ""}
    <div class="err" id="a-err"></div>
    <button class="primary" id="a-go">${signup ? "Create Account" : "Sign In"}</button>
    <button class="ghost" id="a-switch">${signup ? "Already have an account? Sign in" : "New here? Create an account"}</button>
    ${backend.isLive ? "" : `<div class="fine">Running offline — your profile stays in this browser. Online play switches on once Firebase is configured (web/README.md).</div>`}
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
    } else {
      const name = $("a-name").value.trim(), dob = $("a-dob").value;
      if (!name) return err.textContent = "Enter your name.";
      if (!email || password.length < 6) return err.textContent = "Enter your email and a 6+ character password.";
      if (!dob) return err.textContent = "Enter your date of birth.";
      if (yearsOld(dob) < 18) return err.textContent = "Mindspar is for adults 18 and over.";
      if (!$("a-adult").checked) return err.textContent = "Please confirm you are 18 or older.";
      P = await backend.signUp({ name, email, password, dob });
    }
    if (backend.isLive) startInviteListener();
    render();
  } catch (e) { err.textContent = e.message.replace("Firebase: ", ""); }
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
        <span style="font-size:14px"><b>${esc(inv.fromName)}</b> challenged you
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
  $("inv-send").onclick = async () => {
    const email = $("inv-email").value.trim();
    if (!email) return;
    if (!backend.isLive) return $("inv-err").textContent = "Online play needs Firebase — see web/README.md.";
    try {
      searchingPanel("Waiting for them to accept…", "They'll see your challenge on their home screen",
        () => { overlay.classList.remove("on"); backend.stopMatch(); });
      await backend.sendInvite(email, P, human => {
        if (!overlay.classList.contains("on")) return;
        overlay.classList.remove("on");
        startHumanDuel(human);
      });
    } catch (e) { inviteFlow(); $("inv-err").textContent = e.message; }
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

function startBotDuel(botId) {
  const bot = BOTS.find(b => b.id === botId);
  OPP = { name: bot.name, rating: bot.rating };
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
  OPP = { name: human.oppName, rating: human.oppRating };
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
    arena.innerHTML = `<div class="center"><div class="vs">vs ${esc(OPP.name)} · ${OPP.rating}</div>
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
    <div class="side"><div class="nm">${esc(OPP.name.toUpperCase())}</div><div class="sc">${total(opp)}</div>
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
      <div class="fs ${theirs > mine ? "win" : ""}"><div class="n">${esc(OPP.name.toUpperCase())}</div><div class="v">${theirs}</div></div>
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

// ---------------- profile ----------------
function renderProfile() {
  const answered = Object.values(P.dA).reduce((a, b) => a + b, 0);
  const score = sparScore(P);
  const bars = Object.entries(DOMAINS).map(([k, [t, c, g]]) => {
    const pct = P.dA[k] ? Math.round((P.dC[k] || 0) / P.dA[k] * 100) : null;
    return `<div class="srow"><span style="color:${c};width:20px">${g}</span>
      <span class="sl">${t}</span>
      <span class="bar"><i style="width:${pct ?? 0}%;background:${c}"></i></span>
      <span class="pv">${pct === null ? "—" : pct + "%"}</span></div>`;
  }).join("");
  screen.innerHTML = `<div class="pad" style="gap:14px">
    <div style="text-align:center;padding-top:6px">
      <div class="avatar" id="p-avatar" style="cursor:pointer" title="Add a photo">${P.photo
        ? `<img src="${P.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : esc(P.name[0].toUpperCase())}</div>
      <input type="file" id="p-file" accept="image/*" style="display:none">
      <button class="ghost" id="p-photo" style="margin-top:2px">${P.photo ? "Change photo" : "Add photo"}</button>
      <div class="serif" style="font-size:25px;font-weight:600">${esc(P.name)}</div>
      <div style="margin-top:8px"><span class="tierpill">${tier(P.rating).toUpperCase()}
        <i>${P.rating} · ${ageGroup(P.dob)}</i></span></div>
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
    <div class="cardbox rec">
      <div><div class="v">${P.played}</div><div class="l">Duels</div></div>
      <div><div class="v">${P.won}</div><div class="l">Wins</div></div>
      <div><div class="v">${P.played ? Math.round(P.won / P.played * 100) + "%" : "—"}</div><div class="l">Win rate</div></div>
      <div><div class="v">${P.best}</div><div class="l">Best streak</div></div>
    </div>
    <div class="cardbox strengths"><div class="eyebrow">STRENGTHS</div>${bars}</div>
    <div class="fine">The Mindspar Score reflects your relative performance in this game, normalized by
      age group. It is an entertainment estimate — not a clinical or psychometric IQ assessment.</div>
    <button class="ghost" id="p-out">Sign out</button>
  </div>`;
  const fileInput = $("p-file");
  $("p-avatar").onclick = () => fileInput.click();
  $("p-photo").onclick = () => fileInput.click();
  fileInput.onchange = () => resizePhoto(fileInput.files[0]);
  $("p-out").onclick = async () => { await backend.signOut(); P = null; invites = []; render(); };
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
