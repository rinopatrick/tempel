// Single token contract extracted from the approved canvas (design/tempel.pen).
// Palette plus type plus size live here. Globals plus layout consume it.
// No new font or color without a canvas diff.

export const tokens = {
  palette: {
    ink: "#1A1A1A",
    muted: "#525252",
    paper: "#F4F4F2",
    white: "#FFFFFF",
    signal: "#0E7A4F",
    warn: "#B25E00",
  },
  type: {
    sans: '"Inter", system-ui, sans-serif',
    mono: '"IBM Plex Mono", system-ui, sans-serif',
  },
  size: [13, 15, 17, 40, 56, 60],
} as const;

export type Tokens = typeof tokens;
