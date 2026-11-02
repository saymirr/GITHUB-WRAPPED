import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, contributionLevels, longestStreak, rankPullRequests, rankRepos } from '../src/stats.mjs';
import { pickTagline } from '../src/tagline.mjs';
import * as fx from './fixtures.mjs';

const days = (counts) => counts.map((count, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, count }));

test('longestStreak finds the longest run and its dates', () => {
  assert.deepEqual(longestStreak(days([1, 1, 0, 2, 3, 4, 0, 1])), { length: 3, start: '2026-10-04', end: '2026-10-06' });
  assert.deepEqual(longestStreak(days([0, 0])), { length: 0, start: null, end: null });
  assert.equal(longestStreak(days([1, 1, 1])).length, 3);
});

test('contributionLevels: zero stays 0, max is 4, quartiles in between', () => {
  assert.deepEqual(contributionLevels([0, 0]), [0, 0]);
  assert.deepEqual(contributionLevels([0, 5]), [0, 4]);
  const lv = contributionLevels([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(lv[0], 0);
  assert.equal(lv.at(-1), 4);
  assert.ok(lv.every((v, i) => i === 0 || v >= lv[i - 1]), 'monotonic');
});

test('PRs rank by diff size, then comments; repos by commits', () => {
  const prs = [
    { title: 'b', additions: 5, deletions: 5, comments: 1 },
    { title: 'a', additions: 5, deletions: 5, comments: 9 },
    { title: 'big', additions: 100, deletions: 0, comments: 0 },
    { title: 'tiny', additions: 1, deletions: 0, comments: 0 },
  ];
  assert.deepEqual(rankPullRequests(prs).map((p) => p.title), ['big', 'a', 'b']);
  const repos = [{ name: 'z', commits: 3 }, { name: 'a', commits: 3 }, { name: 'x', commits: 0 }, { name: 'm', commits: 9 }];
  assert.deepEqual(rankRepos(repos).map((r) => r.name), ['m', 'a', 'z']);
});

test('busy month: totals, best day, language, shipped', () => {
  const s = computeStats(fx.busyMonth(), { today: '2026-10-30' });
  assert.equal(s.total, s.days.reduce((n, d) => n + d.count, 0));
  assert.deepEqual(s.bestDay, { date: '2026-10-14', count: 47 });
  assert.equal(s.daysInMonth, 31);
  assert.equal(s.topRepos[0].name, 'acme-corp/storefront-web');
  assert.deepEqual(s.topLanguage, { name: 'TypeScript', color: '#3178c6' });
  assert.equal(s.shipped.length, 3);
  assert.equal(s.shipped[0].title, 'Rewrite checkout flow to use server-driven UI');
  assert.ok(s.inProgress, 'Oct 30 of 31 is still in progress');
});

test('empty month: zeros everywhere, no crashes', () => {
  const s = computeStats(fx.emptyMonth(), { today: '2026-10-30' });
  assert.equal(s.total, 0);
  assert.equal(s.activeDays, 0);
  assert.equal(s.bestDay, null);
  assert.equal(s.streak.length, 0);
  assert.equal(s.topLanguage, null);
  assert.equal(s.topRepos.length, 0);
  assert.ok(s.days.every((d) => d.level === 0));
  assert.match(s.tagline, /./);
});

test('in-progress month: future days are flagged and excluded from "elapsed"', () => {
  const s = computeStats(fx.inProgressMonth(), { today: fx.IN_PROGRESS_TODAY });
  assert.equal(s.elapsedDays, 12);
  assert.equal(s.daysInMonth, 30);
  assert.equal(s.inProgress, true);
  assert.equal(s.days.filter((d) => d.future).length, 18);
});

test('days outside the month are ignored (calendar weeks spill over)', () => {
  const data = fx.busyMonth();
  data.days.push({ date: '2026-09-30', count: 500 }, { date: '2026-11-01', count: 500 });
  assert.ok(computeStats(data, { today: '2026-10-30' }).total < 500);
});

const base = { total: 100, activeDays: 15, elapsedDays: 31, daysInMonth: 31, inProgress: false, weekendShare: 0.2,
  streak: { length: 3 }, bestDay: { date: '2026-10-14', count: 10 }, counts: { commits: 50, pullRequests: 2, issues: 0, reviews: 0, restricted: 0 } };
const rule = (over) => pickTagline({ ...base, ...over }, 'x').id;

test('tagline rules fire in priority order', () => {
  assert.equal(rule({ total: 0, activeDays: 0 }), 'empty');
  assert.equal(rule({ activeDays: 31 }), 'perfect');
  assert.equal(rule({ streak: { length: 20 } }), 'streak');
  assert.equal(rule({ weekendShare: 0.5 }), 'weekend');
  assert.equal(rule({ bestDay: { date: '2026-10-14', count: 60 } }), 'spike');
  assert.equal(rule({ counts: { ...base.counts, reviews: 60 } }), 'reviewer');
  assert.equal(rule({ weekendShare: 0 }), 'weekdays');
  assert.equal(rule({ activeDays: 3 }), 'light');
  assert.equal(rule({}), 'steady');
});

test('perfect-month tagline matches the spec example; seeding is deterministic', () => {
  const lines = new Set(['31/31 days. no days off.', 'every single day. 31/31.']);
  assert.ok(lines.has(pickTagline({ ...base, activeDays: 31 }, 'a').text));
  assert.equal(pickTagline(base, 'seed').text, pickTagline(base, 'seed').text);
});
