// Twelve original "clever creature" characters — big-headed, flat-colour and
// friendly: a professor owl, a monocle cat, a happy robot, a bow-tied
// octopus, a bespectacled brain… All hand-drawn SVG, no copied art.
// Seeds are unchanged ("wsb<N>" picks slot N, anything else hashes to a
// slot), so saved avatarSeed values keep the same choice.
let c = 0;
function hashStr(s) {
  let h = 2166136261; s = String(s ?? "x");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Shared face bits.
const eye = (x, y, r = 7) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>` +
  `<circle cx="${x}" cy="${y + 1}" r="${(r * .48).toFixed(1)}" fill="#26202e"/>` +
  `<circle cx="${x - r * .22}" cy="${y - r * .28}" r="${(r * .16).toFixed(1)}" fill="#fff"/>`;
const stars = `<g fill="rgba(255,255,255,.35)"><circle cx="16" cy="18" r="1.3"/><circle cx="86" cy="14" r="1"/><circle cx="80" cy="84" r="1.2"/><circle cx="14" cy="76" r="1"/></g>`;

const CHARS = [
// 0 · professor owl (glasses + graduation cap)
{ bg: ["#4c3d8f", "#241b52"], art: `
  <path d="M30 28 L36 12 L46 24 Z" fill="#8a5f3e"/><path d="M70 28 L64 12 L54 24 Z" fill="#8a5f3e"/>
  <circle cx="50" cy="56" r="30" fill="#9c6d46"/>
  <circle cx="38" cy="54" r="15" fill="#c99b6b"/><circle cx="62" cy="54" r="15" fill="#c99b6b"/>
  ${eye(38, 54, 7)}${eye(62, 54, 7)}
  <circle cx="38" cy="54" r="11.5" fill="none" stroke="#3a2b1e" stroke-width="2.6"/>
  <circle cx="62" cy="54" r="11.5" fill="none" stroke="#3a2b1e" stroke-width="2.6"/>
  <path d="M49.5 52 h1" stroke="#3a2b1e" stroke-width="2.6"/>
  <path d="M50 62 L45 68 Q50 74 55 68 Z" fill="#e8933a"/>
  <path d="M50 6 L80 17 L50 28 L20 17 Z" fill="#1d1630"/>
  <path d="M38 22 h24 v7 a12 5 0 0 1 -24 0 Z" fill="#2a2145"/>
  <path d="M78 18 v12" stroke="#e6c35a" stroke-width="2"/><circle cx="78" cy="32" r="3" fill="#e6c35a"/>` },
// 1 · monocle cat (smug)
{ bg: ["#e8813c", "#a34a14"], art: `
  <path d="M28 36 L33 12 L48 27 Z" fill="#7b8bb0"/><path d="M72 36 L67 12 L52 27 Z" fill="#7b8bb0"/>
  <path d="M32 30 L35 18 L43 26 Z" fill="#f0b8c4"/><path d="M68 30 L65 18 L57 26 Z" fill="#f0b8c4"/>
  <circle cx="50" cy="57" r="29" fill="#93a3c6"/>
  <ellipse cx="50" cy="68" rx="19" ry="13" fill="#dde4f2"/>
  ${eye(39, 52, 6.5)}${eye(61, 52, 6.5)}
  <circle cx="61" cy="52" r="11" fill="none" stroke="#e6c35a" stroke-width="2.6"/>
  <path d="M68 61 L75 73" stroke="#e6c35a" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M52 40 q8 -5 15 -1" stroke="#4a3f52" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M47 62 h6 l-3 4.5 Z" fill="#e37a8a"/>
  <path d="M50 66.5 q-4 4 -9 1 M50 66.5 q6 3 10 -1" stroke="#4a3f52" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M20 58 l12 1 M20 66 l12 -1 M80 58 l-12 1 M80 66 l-12 -1" stroke="#dde4f2" stroke-width="1.8" stroke-linecap="round"/>` },
// 2 · sly fox (happy closed eyes)
{ bg: ["#0e8f8a", "#064e4a"], art: `
  <path d="M25 42 L29 10 L50 30 Z" fill="#ef8b41"/><path d="M75 42 L71 10 L50 30 Z" fill="#ef8b41"/>
  <path d="M29 34 L31 18 L42 28 Z" fill="#7a3c16"/><path d="M71 34 L69 18 L58 28 Z" fill="#7a3c16"/>
  <circle cx="50" cy="57" r="29" fill="#ef8b41"/>
  <ellipse cx="50" cy="69" rx="20" ry="14" fill="#fdeede"/>
  <path d="M31 52 q6 -7 13 0 M56 52 q6 -7 13 0" stroke="#4a2c12" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="50" cy="66" r="3.6" fill="#3a2210"/>
  <path d="M50 70 q7 4 12 -1" stroke="#4a2c12" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
// 3 · happy robot
{ bg: ["#3a4a6b", "#161f33"], art: `${stars}
  <path d="M50 18 V9" stroke="#9fb2cf" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="8" r="4.5" fill="#ff5f6b"/>
  <rect x="16" y="42" width="8" height="18" rx="4" fill="#9fb2cf"/><rect x="76" y="42" width="8" height="18" rx="4" fill="#9fb2cf"/>
  <rect x="22" y="20" width="56" height="58" rx="15" fill="#cdd8ea"/>
  <rect x="30" y="32" width="40" height="30" rx="9" fill="#202c45"/>
  <rect x="37" y="40" width="8" height="11" rx="3" fill="#6ee7ff"/><rect x="55" y="40" width="8" height="11" rx="3" fill="#6ee7ff"/>
  <path d="M40 56 q10 7 20 0" stroke="#6ee7ff" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <circle cx="34" cy="70" r="2.2" fill="#9fb2cf"/><circle cx="66" cy="70" r="2.2" fill="#9fb2cf"/>` },
// 4 · bow-tie octopus
{ bg: ["#2a1548", "#140929"], art: `${stars}
  <circle cx="50" cy="48" r="29" fill="#b45fd0"/>
  <circle cx="29" cy="74" r="8" fill="#b45fd0"/><circle cx="43" cy="79" r="8" fill="#b45fd0"/>
  <circle cx="57" cy="79" r="8" fill="#b45fd0"/><circle cx="71" cy="74" r="8" fill="#b45fd0"/>
  <circle cx="29" cy="76" r="2.5" fill="#8235a3"/><circle cx="43" cy="81" r="2.5" fill="#8235a3"/>
  <circle cx="57" cy="81" r="2.5" fill="#8235a3"/><circle cx="71" cy="76" r="2.5" fill="#8235a3"/>
  ${eye(40, 46, 7)}${eye(60, 46, 7)}
  <path d="M44 60 q6 5 12 0" stroke="#5c1f75" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M50 88 l-11 -6 v12 Z" fill="#ffd257"/><path d="M50 88 l11 -6 v12 Z" fill="#ffd257"/>
  <circle cx="50" cy="88" r="3.4" fill="#e8a91d"/>` },
// 5 · cheerful frog
{ bg: ["#a13d74", "#571d3e"], art: `
  <circle cx="35" cy="30" r="12" fill="#6fcf4f"/><circle cx="65" cy="30" r="12" fill="#6fcf4f"/>
  ${eye(35, 30, 7.5)}${eye(65, 30, 7.5)}
  <ellipse cx="50" cy="58" rx="31" ry="25" fill="#6fcf4f"/>
  <path d="M30 58 q20 17 40 0" stroke="#2c5c14" stroke-width="3" fill="none" stroke-linecap="round"/>
  <ellipse cx="30" cy="65" rx="5" ry="3.4" fill="#f79ac1"/><ellipse cx="70" cy="65" rx="5" ry="3.4" fill="#f79ac1"/>
  <circle cx="44" cy="46" r="1.8" fill="#2c5c14"/><circle cx="56" cy="46" r="1.8" fill="#2c5c14"/>` },
// 6 · penguin with headphones
{ bg: ["#7db4d8", "#2f5d85"], art: `
  <circle cx="50" cy="55" r="29" fill="#232a38"/>
  <ellipse cx="50" cy="61" rx="20" ry="17" fill="#f4f6fb"/>
  ${eye(42, 54, 6)}${eye(58, 54, 6)}
  <path d="M50 60 l-7 5 q7 7 14 0 Z" fill="#f5a13c"/>
  <path d="M24 46 a26 26 0 0 1 52 0" stroke="#ff5f6b" stroke-width="5" fill="none" stroke-linecap="round"/>
  <rect x="16" y="42" width="11" height="17" rx="5.5" fill="#ff5f6b"/>
  <rect x="73" y="42" width="11" height="17" rx="5.5" fill="#ff5f6b"/>` },
// 7 · wide-eyed alien
{ bg: ["#101426", "#04060d"], art: `${stars}
  <path d="M50 17 V8" stroke="#8fe6b8" stroke-width="2.6" stroke-linecap="round"/><circle cx="50" cy="7" r="3.6" fill="#b0ffd9"/>
  <ellipse cx="50" cy="50" rx="28" ry="32" fill="#8fe6b8"/>
  <ellipse cx="39" cy="50" rx="8" ry="13" fill="#10131c" transform="rotate(16 39 50)"/>
  <ellipse cx="61" cy="50" rx="8" ry="13" fill="#10131c" transform="rotate(-16 61 50)"/>
  <circle cx="36.5" cy="44" r="2" fill="#fff" opacity=".85"/><circle cx="58.5" cy="44" r="2" fill="#fff" opacity=".85"/>
  <path d="M46.5 73 q3.5 3 7 0" stroke="#3f8f68" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
// 8 · the brain (glasses — house mascot)
{ bg: ["#5457e8", "#6d2fd1"], art: `
  <g fill="#f8a8c8"><circle cx="36" cy="44" r="13"/><circle cx="50" cy="38" r="14"/><circle cx="64" cy="44" r="13"/>
  <circle cx="30" cy="56" r="11"/><circle cx="70" cy="56" r="11"/><circle cx="50" cy="58" r="19"/>
  <circle cx="40" cy="66" r="12"/><circle cx="60" cy="66" r="12"/></g>
  <path d="M36 44 q5 -7 10 -1 M52 39 q6 -5 10 1 M30 56 q5 -5 9 0 M62 58 q5 -5 9 1" stroke="#d972a0" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  ${eye(41, 58, 6.5)}${eye(59, 58, 6.5)}
  <circle cx="41" cy="58" r="10" fill="none" stroke="#241b52" stroke-width="2.6"/>
  <circle cx="59" cy="58" r="10" fill="none" stroke="#241b52" stroke-width="2.6"/>
  <path d="M50.5 56 h-1" stroke="#241b52" stroke-width="2.6"/>
  <path d="M46 72 q4 3.5 8 0" stroke="#a34a74" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
// 9 · bandit raccoon
{ bg: ["#c9a04c", "#7d5a1c"], art: `
  <path d="M29 32 L35 12 L47 26 Z" fill="#55606e"/><path d="M71 32 L65 12 L53 26 Z" fill="#55606e"/>
  <circle cx="50" cy="56" r="29" fill="#8f9aa8"/>
  <rect x="26" y="44" width="48" height="12" rx="6" fill="#333b47"/>
  <ellipse cx="38" cy="50" rx="12" ry="9" fill="#333b47"/><ellipse cx="62" cy="50" rx="12" ry="9" fill="#333b47"/>
  ${eye(38, 50, 6)}${eye(62, 50, 6)}
  <ellipse cx="50" cy="68" rx="17" ry="13" fill="#eef1f6"/>
  <circle cx="50" cy="63" r="4" fill="#232a33"/>
  <path d="M43 70 q7 6 14 0" stroke="#4a3f52" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
// 10 · sleepy sloth
{ bg: ["#d98a94", "#8f3e4a"], art: `
  <circle cx="50" cy="55" r="29" fill="#b99a72"/>
  <ellipse cx="50" cy="59" rx="21" ry="18" fill="#e8d3ae"/>
  <ellipse cx="38" cy="50" rx="9" ry="6" fill="#7a5c3a" transform="rotate(-18 38 50)"/>
  <ellipse cx="62" cy="50" rx="9" ry="6" fill="#7a5c3a" transform="rotate(18 62 50)"/>
  <path d="M33 51 q5 3.5 10 0 M57 51 q5 3.5 10 0" stroke="#2f2416" stroke-width="3" fill="none" stroke-linecap="round"/>
  <ellipse cx="50" cy="61" rx="5" ry="3.6" fill="#4a3524"/>
  <path d="M45 68 q5 4 10 0" stroke="#6a4d2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M43 28 q7 -7 14 0" stroke="#8a6a42" stroke-width="3" fill="none" stroke-linecap="round"/>` },
// 11 · grinning dino
{ bg: ["#22364f", "#0c1524"], art: `${stars}
  <path d="M30 26 l7 -13 7 13 Z" fill="#2f9e46"/><path d="M43 21 l7 -13 7 13 Z" fill="#2f9e46"/><path d="M56 26 l7 -13 7 13 Z" fill="#2f9e46"/>
  <rect x="22" y="24" width="56" height="54" rx="24" fill="#58c65f"/>
  ${eye(38, 45, 6.5)}${eye(62, 45, 6.5)}
  <circle cx="46" cy="57" r="1.8" fill="#1d5c2a"/><circle cx="54" cy="57" r="1.8" fill="#1d5c2a"/>
  <path d="M31 60 q19 14 38 0" stroke="#1d5c2a" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M39 64.5 l3.5 5 3.5 -3.2 Z" fill="#fff"/><path d="M54 66.3 l3.5 3.2 3.5 -5 Z" fill="#fff"/>` },
];

function render(v) {
  const id = "ch" + (c++);
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="display:block">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${v.bg[0]}"/><stop offset="1" stop-color="${v.bg[1]}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${id})"/>${v.art}</svg>`;
}

// "wsb<N>" picks exactly slot N (kept so saved profiles keep their choice);
// any other seed hashes to a slot.
export function characterAvatar(seed) {
  const m = /^wsb(\d+)$/.exec(String(seed ?? ""));
  const i = m ? (+m[1]) % CHARS.length : hashStr(seed) % CHARS.length;
  return render(CHARS[i]);
}
export const PICKER_SEEDS = CHARS.map((_, i) => "wsb" + i);
