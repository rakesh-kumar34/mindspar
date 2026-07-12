// Synapse core game logic — pure TypeScript port of the proven web logic
// (web/app.js). No platform APIs: everything here runs identically on iOS,
// Android and web. Keep this file dependency-free.
import { QUESTIONS } from "./questions.js";

export type Question = typeof QUESTIONS[number];
export const LIMIT = 18;
export const N = 10;
export const MIN_ANSWERS = 16;

export const DOMAINS: Record<string, { title: string; color: string }> = {
  reasoning: { title: "Reasoning", color: "#6366BB" },
  math: { title: "Math", color: "#2C7BA1" },
  verbal: { title: "Verbal", color: "#BC5A26" },
  knowledge: { title: "Knowledge", color: "#9160B2" },
  science: { title: "Science", color: "#308878" },
  patterns: { title: "Patterns", color: "#A3771F" },
  history: { title: "History", color: "#B04F62" },
  geography: { title: "Geography", color: "#628A46" },
};

export const tier = (r: number): string =>
  r < 900 ? "Novice" : r < 1050 ? "Adept" : r < 1200 ? "Scholar" : r < 1350 ? "Sage" : "Luminary";

export const ladder = (r: number): number =>
  r < 950 ? 1.5 : r < 1150 ? 2 : r < 1300 ? 2.4 : 2.8;

export const eloDelta = (mine: number, theirs: number, actual: number): number =>
  Math.round(32 * (actual - 1 / (1 + 10 ** ((theirs - mine) / 400))));

const AGEREF: Record<string, number> = {
  "18–24": 0.63, "25–34": 0.64, "35–44": 0.62, "45–54": 0.60, "55+": 0.58,
};

export const speedF = (ms: number): number =>
  Math.max(0, Math.min(1, 1 - ms / 1000 / LIMIT));

export const scoreFor = (ok: boolean, ms: number): number =>
  ok ? 100 + Math.round(50 * speedF(ms)) : 0;

export interface ProfileStats {
  age?: string;
  dA: Record<string, number>;
  dC: Record<string, number>;
  sfSum: number;
  sfN: number;
}

export function sparScore(p: ProfileStats): number | null {
  const answered = Object.values(p.dA).reduce((a, b) => a + b, 0);
  if (answered < MIN_ANSWERS) return null;
  const acc = Object.values(p.dC).reduce((a, b) => a + b, 0) / answered;
  const speed = p.sfN ? p.sfSum / p.sfN : 0.5;
  const z = (acc * 0.7 + speed * 0.3 - (AGEREF[p.age ?? ""] ?? 0.62)) / 0.14;
  return Math.max(70, Math.min(145, Math.round(100 + 15 * z)));
}

// Seen-question freshness: 7-day window OR 3 lifetime serves.
export type SeenMap = Record<string, { t: number; n: number } | number>;
const seenEntry = (v: { t: number; n: number } | number) =>
  typeof v === "number" ? { t: v, n: 1 } : v;

export function freshSeen(seen: SeenMap = {}): Set<string> {
  const cutoff = Date.now() - 7 * 86400000;
  return new Set(Object.entries(seen)
    .filter(([, v]) => { const e = seenEntry(v); return e.t > cutoff || e.n >= 3; })
    .map(([k]) => k));
}

// Balanced (or subject-focused) deck near a difficulty target.
export function buildDeck(opts: {
  domain?: string | null; targetDifficulty?: number; seen?: Set<string>;
} = {}): Question[] {
  const { domain = null, targetDifficulty = 2, seen = new Set() } = opts;
  const cost = (q: Question) => Math.abs(q[2] - targetDifficulty) + (seen.has(q[0]) ? 10 : 0);
  const shuffle = <T,>(a: T[]): T[] =>
    a.map(x => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  if (domain) {
    return shuffle(shuffle(QUESTIONS.filter(q => q[1] === domain))
      .sort((a, b) => cost(a) - cost(b)).slice(0, N));
  }
  const byDomain: Record<string, Question[]> = {};
  for (const q of QUESTIONS) (byDomain[q[1]] ??= []).push(q);
  for (const d of Object.keys(byDomain))
    byDomain[d] = shuffle(byDomain[d]).sort((a, b) => cost(b) - cost(a));
  const domains = shuffle(Object.keys(byDomain));
  const deck: Question[] = [];
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

// Daily challenge: identical deck for everyone on a given UTC day.
export const todayKey = () => new Date().toISOString().slice(0, 10);

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyDeck(): Question[] {
  const seed = [...todayKey()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rng = mulberry32(seed);
  const arr = QUESTIONS.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, N);
}

// Rivals ladder — ten named opponents, skill derived from rating.
export interface Rival {
  i: number; name: string; icon: string; rating: number; tag: string;
  acc: Record<string, number>; min: number; max: number;
}
export const GAUNTLET: Rival[] = ([
  ["Pip", "bot", 850, "Still learning the ropes"],
  ["Ivy", "book", 920, "Bookish, and quietly quick"],
  ["Echo", "sigma", 990, "Repeats your mistakes back at you"],
  ["Rune", "grid", 1060, "Sees the pattern before you do"],
  ["Nova", "zap", 1130, "Burns bright on every buzzer"],
  ["Zephyr", "fast", 1200, "Gone before the ink dries"],
  ["Delta", "chart", 1270, "Always one step improved"],
  ["Vera", "check", 1340, "Simply doesn't miss"],
  ["Sable", "flag", 1410, "The quiet closer"],
  ["Minerva", "trophy", 1480, "Wisdom itself"],
] as const).map(([name, icon, rating, tag], i) => {
  const keys = Object.keys(DOMAINS);
  const base = Math.min(0.92, 0.38 + (rating - 850) / 1150);
  const acc: Record<string, number> = {};
  keys.forEach((k, j) => {
    let a = base;
    if (j === i % keys.length) a += 0.10;
    if (j === (i + 4) % keys.length) a -= 0.07;
    acc[k] = Math.max(0.2, Math.min(0.95, a));
  });
  const t = (rating - 850) / 630;
  return { i, name, icon, rating, tag, acc,
           min: Math.max(1.4, 5.5 - 3.5 * t), max: Math.max(3.5, 11 - 6 * t) };
});
