#!/usr/bin/env node
// GitHub Wrapped for a month: node wrapped.mjs [username] [YYYY-MM]
// This file only wires the modules together; see src/ for the real work.

import { parseArgs } from 'node:util';
import { config } from './src/config.mjs';
import { localDate, parseMonth } from './src/dates.mjs';
import { WrappedError } from './src/errors.mjs';
import { loadFontCss } from './src/fonts.mjs';
import { createRunner, fetchAvatarDataUri, fetchMonthData } from './src/github.mjs';
import { renderCardHtml } from './src/html.mjs';
import { renderPng } from './src/png.mjs';
import { computeStats } from './src/stats.mjs';

const USAGE = `GitHub Wrapped: a shareable PNG card of a month of GitHub contributions.

Usage:
  node wrapped.mjs [username] [YYYY-MM] [options]

  username   GitHub login (default: the authenticated gh user)
  YYYY-MM    month to summarize (default: the current month)

Options:
  -o, --out <file>   output path (default: wrapped-<username>-<YYYY-MM>.png)
      --public-only  hide private repos even on your own card
      --scale <n>    pixel density, e.g. 2 for a 2400x1350 image (default: 1)
  -h, --help         show this help

Auth: uses the GitHub CLI (\`gh auth login\`), or the GITHUB_TOKEN env var.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      'public-only': { type: 'boolean', default: false },
      scale: { type: 'string', default: '1' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) return console.log(USAGE);
  if (positionals.length > 2) throw new WrappedError('Too many arguments.', { code: 'USAGE', hint: 'See --help.' });

  const scale = Number(values.scale);
  if (!(scale >= 1 && scale <= 4)) throw new WrappedError('--scale must be between 1 and 4.', { code: 'USAGE' });

  const today = localDate();
  const [username = undefined, monthArg] = positionals.map((p) => p || undefined); // '' = not given
  const month = monthArg ?? today.slice(0, 7);
  parseMonth(month); // validate early, before any network call

  const data = await fetchMonthData({
    run: createRunner(),
    username,
    month,
    today,
    publicOnly: values['public-only'],
  });
  console.error(`Fetched @${data.username} for ${month}${data.includePrivate ? ' (including your private repos)' : ''}.`);

  const stats = computeStats(data, { today });
  const [avatar, fontCss] = await Promise.all([fetchAvatarDataUri(data.avatarUrl), loadFontCss(config)]);
  const html = renderCardHtml(stats, { config, avatar, fontCss });

  const outPath = values.out ?? `wrapped-${data.username}-${month}.png`;
  await renderPng(html, outPath, { ...config.card, scale });
  console.log(outPath);
}

main().catch((err) => {
  if (err instanceof WrappedError) {
    console.error(`error: ${err.message}${err.hint ? `\n${err.hint}` : ''}`);
    process.exit(err.code === 'USAGE' || err.code === 'BAD_MONTH' ? 2 : 1);
  }
  if (err?.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    console.error(`error: ${err.message}\n\n${USAGE}`);
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
