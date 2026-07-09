// Clean line-icon set (inherits currentColor, sized by the container). Replaces
// the unicode glyphs, which rendered tiny and inconsistently across devices.
const P = {
  // The Play tab: a clean bolt (the old crossed-swords glyph rendered as a
  // tangle at tab size).
  play: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  friends: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  profile: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M5 5l1.4 1.4M17.6 17.6 19 19M2 12h2M20 12h2M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="2.5"/><path d="M12 8V4M9 4h6"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/><path d="M2 13v3M22 13v3"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  book: '<path d="M3 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H3zM21 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H21z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="10" ry="4.3"/><ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(120 12 12)"/>',
  fast: '<path d="M13 19l9-7-9-7zM2 19l9-7-9-7z"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.6c.6.5 1 1.2 1 2V17h6v-.4c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  sigma: '<path d="M17 4H7l6 8-6 8h10"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M4 7l8-5 8 5v1H4z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 5c5-2.5 9 2.5 14 0v9c-5 2.5-9-2.5-14 0"/>',
  chart: '<path d="M4 20v-7M9.4 20V9M14.8 20v-5M20 20V5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  msg: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.38-4.1-1.05L3 20l1.05-5.4A8.5 8.5 0 1 1 21 11.5z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  lock: '<rect x="5.5" y="11" width="13" height="9.5" rx="2.5"/><path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  grad: '<path d="M2 9.5 12 5l10 4.5L12 14z"/><path d="M6 11.8V16c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8v-4.2"/><path d="M22 9.5V14"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10 4.2A9.6 9.6 0 0 1 12 4c6.4 0 10 8 10 8a15.5 15.5 0 0 1-2.2 3.2M6.6 6.6A15.5 15.5 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 3.9-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/>',
};

// Bold FILLED icons — these sit inside solid colour circles on the home screen,
// where thin outlines looked weak/weird.
const FILL = {
  sun: '<circle cx="12" cy="12" r="4.5"/><g><rect x="11" y="1" width="2" height="4" rx="1"/><rect x="11" y="19" width="2" height="4" rx="1"/><rect x="1" y="11" width="4" height="2" rx="1"/><rect x="19" y="11" width="4" height="2" rx="1"/><rect x="3.6" y="4.2" width="2" height="4" rx="1" transform="rotate(-45 4.6 6.2)"/><rect x="17.4" y="15.8" width="2" height="4" rx="1" transform="rotate(-45 18.4 17.8)"/><rect x="17.4" y="4.2" width="2" height="4" rx="1" transform="rotate(45 18.4 6.2)"/><rect x="3.6" y="15.8" width="2" height="4" rx="1" transform="rotate(45 4.6 17.8)"/></g>',
  bolt: '<path d="M13.5 1.8 4 13.4a.9.9 0 0 0 .7 1.5H10l-1 7.3a.6.6 0 0 0 1.08.46L20 10.6a.9.9 0 0 0-.7-1.5H14l1-6.9a.6.6 0 0 0-1.5-.4z"/>',
  send: '<path d="M21.5 2.6a1 1 0 0 0-1.05-.24L3 9.1a1 1 0 0 0 .07 1.88l6.1 1.95 1.95 6.1a1 1 0 0 0 1.88.07l6.74-17.45a1 1 0 0 0-.24-1.05z"/>',
};

export function ic(name, size = "1em") {
  if (FILL[name]) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" `
      + `aria-hidden="true" style="display:block">${FILL[name]}</svg>`;
  }
  const p = P[name] || P.bot;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" `
    + `stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" `
    + `style="display:block">${p}</svg>`;
}

// Per-bot and per-domain icon names.
export const BOT_ICON = { vega: "sigma", lyra: "book", atlas: "globe", kepler: "atom", dash: "fast" };
export const DOMAIN_ICON = { reasoning: "bulb", math: "hash", verbal: "book",
  knowledge: "grad", science: "atom", patterns: "grid",
  history: "landmark", geography: "compass" };
