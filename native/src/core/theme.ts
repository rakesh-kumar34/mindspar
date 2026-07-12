// Synapse design tokens — the same values as web/style.css, as TS objects.
export const themes = {
  light: {
    porcelain: "#F3EDE0", card: "#FFFDF7", ink: "#241C0F", ink2: "#6E6350",
    iris: "#C24E36", violet: "#E8734F", irisSoft: "rgba(194,78,54,.10)",
    arena: "#241C0F", arenaCard: "#382E20", good: "#2E7D6F", bad: "#C44536",
    gold: "#85621A", goldSoft: "rgba(184,134,46,.14)", hair: "#E4DCC9",
    onIris: "#FFFDF7", shadow: "rgba(36,28,15,.08)",
  },
  dark: {
    porcelain: "#171310", card: "#221C15", ink: "#F2EDE3", ink2: "#A69A87",
    iris: "#E07356", violet: "#EC8A66", irisSoft: "rgba(224,115,86,.14)",
    arena: "#14100C", arenaCard: "#282017", good: "#3C947F", bad: "#E2685A",
    gold: "#C99B4F", goldSoft: "rgba(201,155,79,.16)", hair: "#33291F",
    onIris: "#241C0F", shadow: "rgba(0,0,0,.35)",
  },
} as const;
export type Theme = typeof themes.light;
