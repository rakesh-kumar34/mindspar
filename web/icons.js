// Clean line-icon set (inherits currentColor, sized by the container). Replaces
// the unicode glyphs, which rendered tiny and inconsistently across devices.
const P = {
  play: '<path d="M18.5 3.5 21 6l-9 9-2.5-2.5zM3 6l2.5-2.5L15 13l-2.5 2.5zM6 6 3.5 3.5M18 18l2.5 2.5M14 17l3 3-2 2-3-3zM10 7 7 4 5 6l3 3"/>',
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
};

export function ic(name, size = "1em") {
  const p = P[name] || P.bot;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" `
    + `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" `
    + `style="display:block">${p}</svg>`;
}

// Per-bot and per-domain icon names.
export const BOT_ICON = { vega: "sigma", lyra: "book", atlas: "globe", kepler: "atom", dash: "fast" };
export const DOMAIN_ICON = { reasoning: "bulb", math: "hash", verbal: "book",
  knowledge: "globe", science: "atom", patterns: "grid" };
