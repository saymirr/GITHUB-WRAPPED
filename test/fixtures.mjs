// Synthetic, deterministic data shaped like fetchMonthData() output. Used by
// the tests and by scripts/render-sample.mjs. None of this is real activity.

import { daysInMonth, weekdayOf, dateOf } from '../src/dates.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function makeDays(month, seed, { weekdayMax = 12, weekendMax = 4, skipChance = 0.1, spikes = {}, lastDay = Infinity }) {
  const rand = rng(seed);
  return Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = dateOf(month, i + 1);
    const weekend = [0, 6].includes(weekdayOf(date));
    let count = 0;
    if (i + 1 <= lastDay && rand() > skipChance) count = 1 + Math.floor(rand() * (weekend ? weekendMax : weekdayMax));
    return { date, count: spikes[i + 1] ?? count };
  });
}

const sum = (days) => days.reduce((s, d) => s + d.count, 0);

/** A busy full-stack dev: lots of PRs, reviews, private work. */
export function busyMonth() {
  const days = makeDays('2026-10', 7, { weekdayMax: 14, weekendMax: 6, skipChance: 0.06, spikes: { 14: 47 } });
  return {
    username: 'sample-user', name: 'Sample User', avatarUrl: null, month: '2026-10', isSelf: true, includePrivate: true,
    days,
    counts: { commits: Math.round(sum(days) * 0.62), pullRequests: 23, issues: 9, reviews: 41, restricted: 58 },
    repos: [
      { name: 'sample-user/dotfiles', commits: 31, language: 'Shell', languageColor: '#89e051' },
      { name: 'acme-corp/storefront-web', commits: 142, language: 'TypeScript', languageColor: '#3178c6' },
      { name: 'acme-corp/billing-service', commits: 77, language: 'Go', languageColor: '#00ADD8' },
      { name: 'sample-user/tiny-experiments', commits: 4, language: null, languageColor: null },
    ],
    mergedPrs: [
      { title: 'Rewrite checkout flow to use server-driven UI', url: '#', repo: 'acme-corp/storefront-web', additions: 2140, deletions: 1630, comments: 22 },
      { title: 'Fix race condition in invoice retry worker', url: '#', repo: 'acme-corp/billing-service', additions: 88, deletions: 31, comments: 9 },
      { title: 'Add dark mode', url: '#', repo: 'acme-corp/storefront-web', additions: 640, deletions: 120, comments: 4 },
      { title: 'Bump dependencies', url: '#', repo: 'sample-user/dotfiles', additions: 12, deletions: 12, comments: 0 },
    ],
    mergedPrTotal: 14,
  };
}

/** A maintainer who mostly merges: a few commits, no authored PRs, no reviews. */
export function maintainerMonth() {
  const days = makeDays('2026-09', 21, { weekdayMax: 9, weekendMax: 7, skipChance: 0.35 });
  return {
    username: 'a-kernel-maintainer', name: null, avatarUrl: null, month: '2026-09', isSelf: false, includePrivate: false,
    days,
    counts: { commits: sum(days), pullRequests: 0, issues: 0, reviews: 0, restricted: 0 },
    repos: [{ name: 'a-kernel-maintainer/linux', commits: sum(days), language: 'C', languageColor: '#555555' }],
    mergedPrs: [],
    mergedPrTotal: 0,
  };
}

/** Nothing at all. */
export function emptyMonth() {
  return {
    username: 'quiet-person', name: null, avatarUrl: null, month: '2026-08', isSelf: false, includePrivate: false,
    days: makeDays('2026-08', 1, { skipChance: 1 }),
    counts: { commits: 0, pullRequests: 0, issues: 0, reviews: 0, restricted: 0 },
    repos: [], mergedPrs: [], mergedPrTotal: 0,
  };
}

/** Only reviews/issues (no commits), so no repos and no PRs. */
export function reviewsOnlyMonth() {
  const days = makeDays('2026-02', 5, { weekdayMax: 3, weekendMax: 0, skipChance: 0.2 });
  return {
    username: 'review-bot-ish', name: null, avatarUrl: null, month: '2026-02', isSelf: false, includePrivate: false,
    days,
    counts: { commits: 0, pullRequests: 0, issues: 6, reviews: sum(days) - 6, restricted: 0 },
    repos: [], mergedPrs: [], mergedPrTotal: 0,
  };
}

/** Worst-case text: max-length username, huge titles, huge repo names, odd characters. */
export function longNamesMonth() {
  const days = makeDays('2026-03', 99, { weekdayMax: 30, weekendMax: 20, skipChance: 0, spikes: { 31: 1234 } });
  const owner = 'an-extremely-long-organization-name';
  return {
    username: 'a'.repeat(39), name: null, avatarUrl: null, month: '2026-03', isSelf: false, includePrivate: false,
    days,
    counts: { commits: 5000, pullRequests: 120, issues: 30, reviews: 12, restricted: 0 },
    repos: [
      { name: `${owner}/the-repository-with-a-ridiculously-verbose-name-for-testing`, commits: 12345, language: 'Objective-C++', languageColor: '#4886FC' },
      { name: `${owner}/short`, commits: 99, language: 'Rust', languageColor: '#dea584' },
      { name: 'x/y', commits: 1, language: null, languageColor: null },
    ],
    mergedPrs: [
      { title: 'feat(very-long-scope): implement the fully asynchronous, cancellable, retry-aware, observability-friendly batch ingestion pipeline with backpressure and tests', url: '#', repo: `${owner}/the-repository-with-a-ridiculously-verbose-name-for-testing`, additions: 90000, deletions: 100, comments: 3 },
      { title: '<script>alert("hi")</script> & "quotes" — émoji 🚀 日本語のタイトル', url: '#', repo: `${owner}/short`, additions: 5, deletions: 5, comments: 0 },
      { title: 'x', url: '#', repo: 'x/y', additions: 1, deletions: 0, comments: 0 },
    ],
    mergedPrTotal: 120,
  };
}

/** A month still in progress, on day 12. Pair with today = '2026-11-12'. */
export function inProgressMonth() {
  const days = makeDays('2026-11', 3, { skipChance: 0.2, lastDay: 12 });
  return {
    username: 'sample-user', name: null, avatarUrl: null, month: '2026-11', isSelf: false, includePrivate: false,
    days: days.filter((d) => d.date <= '2026-11-12'), // the API window ends today
    counts: { commits: sum(days), pullRequests: 3, issues: 0, reviews: 2, restricted: 0 },
    repos: [{ name: 'sample-user/side-project', commits: sum(days), language: 'Python', languageColor: '#3572A5' }],
    mergedPrs: [{ title: 'Add CSV export', url: '#', repo: 'sample-user/side-project', additions: 300, deletions: 20, comments: 2 }],
    mergedPrTotal: 1,
  };
}

export const IN_PROGRESS_TODAY = '2026-11-12';
