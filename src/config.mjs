// Everything you are likely to want to tweak lives here: theme colors, fonts,
// card size and the footer watermark.

import { fileURLToPath } from 'node:url';

export const config = {
  card: { width: 1200, height: 675 }, // 16:9, what Twitter/X previews well

  // Footer, bottom right. Change this to your project / site / handle.
  watermark: 'github-wrapped',

  theme: {
    bg: '#0b0f14',
    bgGlow: 'rgba(57, 211, 83, 0.10)', // soft radial glow in the top-right corner
    surface: '#121820',
    line: 'rgba(255, 255, 255, 0.08)',
    text: '#f4f7fa',
    textMuted: '#8b97a5',
    textFaint: '#566170',
    accent: '#39d353', // GitHub dark-mode green
    // Contribution levels 0 (none) .. 4 (most), as on github.com in dark mode.
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },

  // Month grid (weeks as columns, Sunday-first, like github.com).
  grid: { maxCell: 58, gap: 8, width: 440, height: 454, labelWidth: 24 },

  // Bundled Inter (SIL OFL). The files are embedded in the HTML, so the card
  // renders the same on every machine. Swap them out to change the look.
  fonts: {
    family: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    files: [500, 700, 800, 900].map((weight) => ({
      weight,
      path: fileURLToPath(new URL(`../assets/fonts/inter-latin-${weight}-normal.woff2`, import.meta.url)),
    })),
  },
};
