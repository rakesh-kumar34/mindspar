// Twelve original WallStreetBets-style "degen" characters — men and women, no
// copyrighted art. Each is composed from parts (background, suit, hair/hat,
// eyewear, accessories) so they read as distinct: suit, bandana, chains, money,
// rockets, diamond hands, cigar, funny, and female traders.
let c = 0;
function hashStr(s) {
  let h = 2166136261; s = String(s ?? "x");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// --- eyewear / eyes ---
const shadesBlack = `<rect x="30" y="42" width="16" height="9" rx="3" fill="#15181f"/><rect x="54" y="42" width="16" height="9" rx="3" fill="#15181f"/><path d="M46 46h8" stroke="#15181f" stroke-width="3"/><path d="M30 46l-6-2M70 46l6-2" stroke="#15181f" stroke-width="3" stroke-linecap="round"/>`;
const shadesGold = `<rect x="30" y="42" width="16" height="9" rx="4" fill="#241c2a" stroke="#e6c35a" stroke-width="1.6"/><rect x="54" y="42" width="16" height="9" rx="4" fill="#241c2a" stroke="#e6c35a" stroke-width="1.6"/><path d="M46 46h8" stroke="#e6c35a" stroke-width="2"/>`;
const shadesAviator = `<circle cx="38" cy="47" r="7.5" fill="#1a1d26"/><circle cx="62" cy="47" r="7.5" fill="#1a1d26"/><path d="M45.5 45h9" stroke="#1a1d26" stroke-width="3"/>`;
const eyesOpen = `<circle cx="41" cy="46" r="3.4" fill="#2a2230"/><circle cx="59" cy="46" r="3.4" fill="#2a2230"/><path d="M36 41q5-3 10 0M54 41q5-3 10 0" stroke="#3a2b23" stroke-width="2" fill="none" stroke-linecap="round"/>`;
const eyesWide = `<circle cx="41" cy="46" r="5.2" fill="#fff" stroke="#2a2230"/><circle cx="41" cy="46" r="2.5" fill="#2a2230"/><circle cx="59" cy="46" r="5.2" fill="#fff" stroke="#2a2230"/><circle cx="59" cy="46" r="2.5" fill="#2a2230"/>`;
const eyesCrazy = `<circle cx="41" cy="46" r="5.2" fill="#fff" stroke="#2a2230"/><circle cx="43" cy="47" r="2.2" fill="#2a2230"/><circle cx="59" cy="45" r="3.6" fill="#fff" stroke="#2a2230"/><circle cx="57.5" cy="44" r="1.6" fill="#2a2230"/>`;
const eyesLash = `<path d="M37 46q4-4 8 0M55 46q4-4 8 0" stroke="#2a2230" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M36 44l-2-2M64 44l2-2" stroke="#2a2230" stroke-width="1.6" stroke-linecap="round"/>`;

// --- mouths ---
const mSmirk = `<path d="M42 60q8 5 16 1" stroke="#7a5230" stroke-width="3" fill="none" stroke-linecap="round"/>`;
const mGrin = `<path d="M41 59q9 7 18 0z" fill="#fff" stroke="#6a4020" stroke-width="1.5"/>`;
const mBig = `<path d="M39 58q11 10 22 0z" fill="#fff" stroke="#6a4020" stroke-width="1.5"/><path d="M50 58v6" stroke="#6a4020" stroke-width="1"/>`;
const mYolo = `<ellipse cx="50" cy="61" rx="6" ry="6" fill="#5a2f2f"/><path d="M44 61h12" stroke="#3a1f1f" stroke-width="1"/>`;
const mFlat = `<path d="M43 61h14" stroke="#7a5230" stroke-width="3" stroke-linecap="round"/>`;
const mTongue = `<path d="M43 59q7 5 14 0z" fill="#5a2f2f"/><ellipse cx="50" cy="63" rx="3" ry="4" fill="#e8899a"/>`;
const mLips = `<path d="M43 60q7 5 14 0q-7 3-14 0z" fill="#c65a6a"/>`;

// --- hair / hats ---
const hairDark = `<path d="M27 40q3-22 23-22t23 22q-7-10-23-10t-23 10z" fill="#3a2b23"/>`;
const hairGray = `<path d="M27 40q3-22 23-22t23 22q-7-10-23-10t-23 10z" fill="#9aa0a6"/>`;
const hairSlick = `<path d="M28 38q4-20 22-20t22 20q-9-7-22-7t-22 7z" fill="#1a1a1a"/>`;
const hairMessy = `<path d="M25 41q3-25 25-23t23 24q-4-6-9-3t-8-5-8 4-8-3-7 6-5 3z" fill="#4a3b2a"/>`;
const hairBald = `<path d="M35 30q15-7 30 0" stroke="rgba(255,255,255,.22)" stroke-width="2" fill="none"/>`;
const bandana = col => `<path d="M26 33q24-11 48 0v7H26z" fill="${col}"/><g fill="rgba(255,255,255,.5)"><circle cx="34" cy="37" r="1.2"/><circle cx="44" cy="37" r="1.2"/><circle cx="56" cy="37" r="1.2"/><circle cx="66" cy="37" r="1.2"/></g><path d="M74 36l10 2-10 4z" fill="${col}"/>`;
const beanie = `<path d="M28 39q22-18 44 0z" fill="#c0392b"/><rect x="26" y="36" width="48" height="7" rx="3.5" fill="#8d2a20"/>`;
const tophat = `<rect x="33" y="5" width="34" height="21" rx="2" fill="#141414"/><rect x="26" y="24" width="48" height="5" rx="2.5" fill="#141414"/><rect x="33" y="20" width="34" height="4" fill="#1e7d46"/>`;
// women — long hair drawn behind the head, plus a top
const longBack = col => `<path d="M24 40q-6 30 6 40M76 40q6 30-6 40" stroke="${col}" stroke-width="12" fill="none" stroke-linecap="round"/>`;
const longTop = col => `<path d="M26 44q4-25 24-25t24 25q-9-14-24-14t-24 14z" fill="${col}"/>`;
const ponyBack = col => `<path d="M72 40q14 10 8 34" stroke="${col}" stroke-width="10" fill="none" stroke-linecap="round"/>`;

// --- accessories ---
const earrings = `<circle cx="28" cy="53" r="2.3" fill="#e6c35a"/><circle cx="72" cy="53" r="2.3" fill="#e6c35a"/>`;
const chains = `<path d="M37 75q13 11 26 0" stroke="#e6c35a" stroke-width="2.6" fill="none" stroke-dasharray="1.6 1.6"/><circle cx="50" cy="85" r="4" fill="#e6c35a"/><path d="M48.4 83.4h3.2v3.2h-3.2z" fill="#b8860b"/>`;
const cigar = `<rect x="57" y="61" width="16" height="4" rx="2" fill="#5a3a1a"/><rect x="70" y="61" width="4" height="4" rx="1" fill="#caa050"/><circle cx="75" cy="63" r="1.6" fill="#ff6a2a"/>`;
const diamond = `<g transform="translate(72 66)"><path d="M0 2l4-4 4 4-4 7z" fill="#7fe3ff" stroke="#3aa9d4" stroke-width=".7"/></g>`;
const openShirt = `<path d="M42 78l8 13 8-13-8-5z" fill="#f2f4f7"/>`;
const suitTie = tie => `<path d="M42 78l8 11 8-11-8-6z" fill="#eef1f5"/><path d="M50 89l4.5 13h-9z" fill="${tie}"/>`;

// --- backgrounds ---
const bgArrow = `<path d="M14 82l16-20 11 11 24-32" stroke="#4ee38a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".4"/><path d="M60 41h9v9" stroke="#4ee38a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".4"/>`;
const bgArrowDown = `<path d="M14 55l16 18 11-9 24 26" stroke="#ff7a7a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".4"/>`;
const bgMoney = `<g stroke="#7ff0a8" stroke-width="1.8" fill="none" opacity=".5" stroke-linecap="round"><path d="M18 19v10M15 21.5a3 3 0 0 1 6 0M21 26.5a3 3 0 0 1-6 0"/><path d="M83 15v8M80.5 17a2.6 2.6 0 0 1 5 0M85.5 20.5a2.6 2.6 0 0 1-5 0"/></g>`;
const bgRocket = `<g opacity=".55" transform="translate(74 14) rotate(35)"><path d="M4 0c4 2 6 8 4 14H0c-2-6 0-12 4-14z" fill="#e8edf2"/><path d="M0 14l-3 6 5-2zM8 14l3 6-5-2z" fill="#c0392b"/><circle cx="4" cy="6" r="2" fill="#7fb0ff"/></g>`;
const bgStars = `<g fill="#fff"><circle cx="20" cy="18" r="1.3" opacity=".7"/><circle cx="80" cy="15" r="1" opacity=".6"/><circle cx="72" cy="30" r="1.4" opacity=".7"/><circle cx="30" cy="33" r="1" opacity=".5"/></g>`;

// bg, suit, skin, [layers…]
const WSBV = [
  // 0 classic suit degen
  { bg: ["#1e7d46", "#0b3d24"], suit: "#20242e", skin: "#f0c9a3", back: bgArrow, chest: suitTie("#c0392b"), hair: hairDark, eyes: shadesBlack, mouth: mSmirk },
  // 1 bandana bro
  { bg: ["#c0392b", "#7d1f16"], suit: "#2a2f3a", skin: "#e8b98f", chest: openShirt, hair: bandana("#15181f"), eyes: shadesAviator, mouth: mGrin },
  // 2 chains / bling
  { bg: ["#2a2230", "#141018"], suit: "#20242e", skin: "#c98a5a", chest: openShirt, neck: chains, hair: hairSlick, eyes: shadesBlack, mouth: mBig },
  // 3 money man
  { bg: ["#1e7d46", "#0e4a2a"], suit: "#1a1d26", skin: "#f0c9a3", back: bgMoney, chest: suitTie("#4ee38a"), hair: hairDark, eyes: shadesGold, mouth: mSmirk },
  // 4 rocket degen
  { bg: ["#20263a", "#0e1220"], suit: "#3a4150", skin: "#e8b98f", back: bgRocket, chest: suitTie("#c0392b"), hair: beanie, eyes: eyesWide, mouth: mYolo },
  // 5 diamond hands
  { bg: ["#12609e", "#0a2f52"], suit: "#15181f", skin: "#e8b98f", chest: suitTie("#2b7fd4"), hair: hairBald, eyes: shadesBlack, mouth: mGrin, front: diamond },
  // 6 cigar boss
  { bg: ["#5a1e2a", "#2e0f16"], suit: "#20242e", skin: "#e8b98f", chest: suitTie("#e6c35a"), hair: hairGray, eyes: eyesOpen, mouth: mFlat, front: cigar },
  // 7 funny degen
  { bg: ["#e07a23", "#a04d10"], suit: "#2f6b3a", skin: "#f0c9a3", hair: hairMessy, eyes: eyesCrazy, mouth: mTongue },
  // 8 woman exec (suit + shades)
  { bg: ["#6a3ad4", "#3a1f8a"], suit: "#20242e", skin: "#f0c9a3", hairBack: longBack("#3a2b23"), chest: suitTie("#c0392b"), hair: longTop("#3a2b23"), ear: earrings, eyes: shadesBlack, mouth: mSmirk },
  // 9 woman trader (chains + lips)
  { bg: ["#1aa3a3", "#0c5a5a"], suit: "#20242e", skin: "#e8b98f", hairBack: longBack("#1a1a1a"), chest: openShirt, neck: chains, hair: longTop("#1a1a1a"), ear: earrings, eyes: eyesLash, mouth: mLips },
  // 10 woman rocket (ponytail)
  { bg: ["#d43a7a", "#8a1f4d"], suit: "#2a2f3a", skin: "#f0c9a3", back: bgRocket, hairBack: ponyBack("#6a3a1a"), chest: suitTie("#e6c35a"), hair: longTop("#6a3a1a"), ear: earrings, eyes: eyesWide, mouth: mBig },
  // 11 gold bull (moon)
  { bg: ["#1a2450", "#0a1230"], suit: "#15181f", skin: "#f0c9a3", back: bgStars, chest: suitTie("#e6c35a"), hair: tophat, eyes: shadesGold, mouth: mSmirk },
];

function render(v) {
  const id = "w" + (c++);
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${v.bg[0]}"/><stop offset="1" stop-color="${v.bg[1]}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${id})"/>
    ${v.back || ""}${v.hairBack || ""}
    <path d="M20 100c0-17 13-25 30-25s30 8 30 25z" fill="${v.suit}"/>
    ${v.chest || suitTie("#c0392b")}${v.neck || ""}
    <circle cx="50" cy="46" r="23" fill="${v.skin}"/>
    ${v.ear || ""}${v.hair || ""}${v.eyes || ""}${v.mouth || ""}${v.front || ""}</svg>`;
}

// "wsb<N>" picks exactly N; any other seed hashes to one of the twelve.
export function characterAvatar(seed) {
  const m = /^wsb(\d+)$/.exec(String(seed ?? ""));
  const i = m ? (+m[1]) % WSBV.length : hashStr(seed) % WSBV.length;
  return render(WSBV[i]);
}
export const PICKER_SEEDS = WSBV.map((_, i) => "wsb" + i);
