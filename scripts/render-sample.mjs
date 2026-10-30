// Renders cards from synthetic fixture data (no network, no token).
//   npm run sample                  -> docs/example.png (the README image)
//   node scripts/render-sample.mjs --all <dir>   -> every fixture, for eyeballing layouts

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config.mjs';
import { loadFontCss } from '../src/fonts.mjs';
import { renderCardHtml } from '../src/html.mjs';
import { renderPng } from '../src/png.mjs';
import { computeStats } from '../src/stats.mjs';
import * as fx from '../test/fixtures.mjs';

const scenarios = {
  busy: [fx.busyMonth, '2026-11-05'],
  maintainer: [fx.maintainerMonth, '2026-10-30'],
  empty: [fx.emptyMonth, '2026-10-30'],
  reviewsOnly: [fx.reviewsOnlyMonth, '2026-10-30'],
  longNames: [fx.longNamesMonth, '2026-10-30'],
  inProgress: [fx.inProgressMonth, fx.IN_PROGRESS_TODAY],
};

const fontCss = await loadFontCss(config);
const all = process.argv[2] === '--all';
const outDir = all ? process.argv[3] : 'docs';
if (!outDir) throw new Error('usage: render-sample.mjs --all <dir>');
await mkdir(outDir, { recursive: true });

for (const [name, [make, today]] of Object.entries(scenarios)) {
  if (!all && name !== 'busy') continue;
  const stats = computeStats(make(), { today });
  const html = renderCardHtml(stats, { config, fontCss });
  const out = join(outDir, all ? `${name}.png` : 'example.png');
  await renderPng(html, out, config.card);
  console.log(`${out}  "${stats.tagline}"`);
}
