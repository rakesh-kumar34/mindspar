// Twelve original "thinker sigil" avatars — emblems of study and wit (owl,
// chess knight, telescope, quill, atom…) on deep jewel-tone grounds. All
// hand-drawn SVG, matching the app's porcelain/ink/iris design language.
// Seeds are unchanged from the previous set ("wsb<N>" picks slot N, anything
// else hashes to a slot), so saved avatarSeed values keep working.
let c = 0;
function hashStr(s) {
  let h = 2166136261; s = String(s ?? "x");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Faint backdrops so each sigil sits in its own little sky.
const dust = `<g fill="rgba(255,255,255,.28)"><circle cx="18" cy="20" r="1.2"/><circle cx="84" cy="16" r="1"/><circle cx="76" cy="82" r="1.3"/><circle cx="22" cy="78" r="1"/></g>`;
const ring = `<circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.6"/>`;
const arc = `<path d="M14 72 A44 44 0 0 1 86 72" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="1.6"/>`;

// Emblems: line art, stroke inherits per-slot ink color.
const E = {
  owl: `<path d="M32 60 Q32 36 50 32 Q68 36 68 60 Q68 76 50 79 Q32 76 32 60Z"/>
    <path d="M37 35 L33 26 L43 31 M63 35 L67 26 L57 31"/>
    <circle cx="42.5" cy="49" r="6"/><circle cx="57.5" cy="49" r="6"/>
    <circle cx="42.5" cy="49" r="1.6" fill="currentColor" stroke="none"/>
    <circle cx="57.5" cy="49" r="1.6" fill="currentColor" stroke="none"/>
    <path d="M50 55 l-3.5 5 h7 Z"/><path d="M42 68 q8 5 16 0"/>`,
  knight: `<path d="M37 78 h26 M39 72 h22"/>
    <path d="M42 72 c-3-12 1-20 9-25 c-5-3-7-9-3-15 c4 1 7 3 9 6 l6 2 c6 4 9 11 9 18 c0 6-3 11-8 14"/>
    <circle cx="55" cy="42" r="1.7" fill="currentColor" stroke="none"/>
    <path d="M52 50 q-6 3 -8 9"/>`,
  scope: `<g transform="rotate(-32 50 50)"><rect x="24" y="45" width="40" height="11" rx="4"/>
    <rect x="63" y="42.5" width="11" height="16" rx="3"/><path d="M24 50.5 h-6"/></g>
    <path d="M47 60 L38 82 M53 60 L62 82 M50 61 V82"/>
    <circle cx="76" cy="26" r="1.6" fill="currentColor" stroke="none"/>
    <circle cx="66" cy="18" r="1.1" fill="currentColor" stroke="none"/>`,
  quill: `<path d="M68 20 Q48 28 40 52 Q37 62 34 76 M40 52 Q52 47 62 34 M44 42 Q56 40 64 28"/>
    <path d="M34 76 l-2 6"/><circle cx="30" cy="85" r="2" fill="currentColor" stroke="none"/>`,
  atom: `<circle cx="50" cy="50" r="3" fill="currentColor" stroke="none"/>
    <ellipse cx="50" cy="50" rx="26" ry="11"/>
    <ellipse cx="50" cy="50" rx="26" ry="11" transform="rotate(60 50 50)"/>
    <ellipse cx="50" cy="50" rx="26" ry="11" transform="rotate(120 50 50)"/>`,
  laurel: `<path d="M35 26 Q24 50 38 74 M65 26 Q76 50 62 74"/>
    <path d="M35 34 l-8 -3 M36 44 l-9 0 M38 54 l-8 3 M41 64 l-7 6"/>
    <path d="M65 34 l8 -3 M64 44 l9 0 M62 54 l8 3 M59 64 l7 6"/>
    <circle cx="50" cy="30" r="2" fill="currentColor" stroke="none"/>`,
  hourglass: `<path d="M34 22 h32 M34 78 h32"/>
    <path d="M37 22 c0 16 22 20 22 28 s-22 12-22 28 M63 22 c0 16-22 20-22 28 s22 12 22 28"/>
    <circle cx="50" cy="66" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="50" cy="72" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="50" cy="59" r="1.2" fill="currentColor" stroke="none"/>`,
  compass: `<circle cx="50" cy="50" r="24"/>
    <path d="M50 30 L55 50 L50 70 L45 50 Z" fill="currentColor" stroke="none" opacity=".9"/>
    <path d="M30 50 h5 M65 50 h5 M50 25 v-4 M50 79 v-4"/>`,
  spiral: `<path d="M50 50 a5 5 0 0 1 5 5 a10 10 0 0 1 -10 10 a16 16 0 0 1 -16 -16 a22 22 0 0 1 22 -22 a28 28 0 0 1 28 28 a32 32 0 0 1 -9 22" fill="none"/>`,
  key: `<circle cx="37" cy="40" r="11"/><circle cx="37" cy="40" r="4"/>
    <path d="M45 48 L70 73 M63 66 l7 -7 M56 59 l7 -7"/>`,
  moon: `<path d="M61 24 a28 28 0 1 0 0 52 a22 22 0 1 1 0 -52 Z"/>
    <circle cx="68" cy="36" r="1.6" fill="currentColor" stroke="none"/>
    <circle cx="76" cy="50" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="70" cy="64" r="1.4" fill="currentColor" stroke="none"/>`,
  bulb: `<path d="M42 66 h16 M44 73 h12 M50 20 a17 17 0 0 0 -10 30.6 c1.6 1.3 2.6 3 2.6 5.4 v2 h14.8 v-2 c0-2.4 1-4.1 2.6-5.4 A17 17 0 0 0 50 20 Z"/>
    <path d="M46 38 l4 6 l4 -6"/>`,
};

// slot: background gradient, sigil ink, emblem, faint backdrop
const SLOTS = [
  { bg: ["#3b3ea8", "#1b1d54"], ink: "#eef0ff", em: "owl", back: dust },
  { bg: ["#12403a", "#07211d"], ink: "#d9f2e6", em: "knight", back: arc },
  { bg: ["#152346", "#090e22"], ink: "#dbe6ff", em: "scope", back: dust },
  { bg: ["#5a2a20", "#2b120c"], ink: "#ffe8d9", em: "quill", back: arc },
  { bg: ["#124a56", "#08222a"], ink: "#d7f3f6", em: "atom", back: ring },
  { bg: ["#4c3a10", "#241a05"], ink: "#f6e8c4", em: "laurel", back: dust },
  { bg: ["#46215a", "#200d2b"], ink: "#f0dcff", em: "hourglass", back: dust },
  { bg: ["#1f3d63", "#0d1a2e"], ink: "#dcebff", em: "compass", back: ring },
  { bg: ["#57123a", "#2a081c"], ink: "#ffdcec", em: "spiral", back: dust },
  { bg: ["#333b1c", "#171b0a"], ink: "#eaf2cf", em: "key", back: arc },
  { bg: ["#232a5e", "#0e1130"], ink: "#e2e6ff", em: "moon", back: dust },
  { bg: ["#5e3a12", "#2c1a06"], ink: "#ffeccb", em: "bulb", back: ring },
];

function render(v) {
  const id = "sg" + (c++);
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${v.bg[0]}"/><stop offset="1" stop-color="${v.bg[1]}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${id})"/>
    ${v.back || ""}
    <g fill="none" stroke="${v.ink}" stroke-width="4.2" stroke-linecap="round"
       stroke-linejoin="round" color="${v.ink}">${E[v.em]}</g></svg>`;
}

// "wsb<N>" picks exactly slot N (kept so saved profiles keep their choice);
// any other seed hashes to a slot.
export function characterAvatar(seed) {
  const m = /^wsb(\d+)$/.exec(String(seed ?? ""));
  const i = m ? (+m[1]) % SLOTS.length : hashStr(seed) % SLOTS.length;
  return render(SLOTS[i]);
}
export const PICKER_SEEDS = SLOTS.map((_, i) => "wsb" + i);
