// Stats computation: pure functions, no I/O. Takes the normalized data from
// github.mjs and returns everything the renderer needs.

import { dateOf, daysInMonth, localDate, monthLabel, monthOf, weekdayOf } from './dates.mjs';
import { pickTagline } from './tagline.mjs';

export const TOP_N = 3;

/** Longest run of consecutive active days. `days` must be in date order. */
export function longestStreak(days) {
  let best = { length: 0, start: null, end: null };
  let runStart = null;
  let runLength = 0;
  for (const day of days) {
    if (day.count > 0) {
      if (runLength === 0) runStart = day.date;
      runLength += 1;
      if (runLength > best.length) best = { length: runLength, start: runStart, end: day.date };
    } else {
      runLength = 0;
    }
  }
  return best;
}

/**
 * Colour level 0-4 per count, relative to the month itself: the busiest day is
 * always level 4 and the active days spread across 1-3 by quartile.
 */
export function contributionLevels(counts) {
  const active = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (active.length === 0) return counts.map(() => 0);
  const max = active[active.length - 1];
  const at = (p) => active[Math.floor(p * (active.length - 1))];
  const [q1, q2, q3] = [at(0.25), at(0.5), at(0.75)];
  return counts.map((c) => {
    if (c === 0) return 0;
    if (c >= max) return 4;
    if (c <= q1) return 1;
    if (c <= q2) return 2;
    if (c <= q3) return 3;
    return 4;
  });
}

/** Biggest diff first (additions + deletions), then most comments, then title. */
export function rankPullRequests(prs, n = TOP_N) {
  const size = (pr) => pr.additions + pr.deletions;
  return [...prs]
    .sort((a, b) => size(b) - size(a) || b.comments - a.comments || a.title.localeCompare(b.title))
    .slice(0, n);
}

export function rankRepos(repos, n = TOP_N) {
  return [...repos]
    .filter((r) => r.commits > 0)
    .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name))
    .slice(0, n);
}

/**
 * @param {object} data   output of fetchMonthData()
 * @param {{ today?: string }} [options]
 */
export function computeStats(data, { today = localDate() } = {}) {
  const { month } = data;
  const dim = daysInMonth(month);
  const countByDate = new Map(
    data.days.filter((d) => monthOf(d.date) === month).map((d) => [d.date, d.count]),
  );

  // One entry per calendar day, zero-filled (the API omits nothing, but the
  // window is clamped to today for the current month).
  const days = Array.from({ length: dim }, (_, i) => {
    const date = dateOf(month, i + 1);
    return { date, day: i + 1, weekday: weekdayOf(date), count: countByDate.get(date) ?? 0, future: date > today };
  });
  const levels = contributionLevels(days.map((d) => d.count));
  days.forEach((d, i) => { d.level = levels[i]; });

  const elapsed = days.filter((d) => !d.future);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  const peak = days.reduce((best, d) => (d.count > (best?.count ?? 0) ? d : best), null);
  const weekendTotal = days.filter((d) => d.weekday === 0 || d.weekday === 6).reduce((s, d) => s + d.count, 0);

  const topRepos = rankRepos(data.repos);
  const stats = {
    username: data.username,
    name: data.name ?? null,
    month,
    monthLabel: monthLabel(month),
    isSelf: data.isSelf,
    daysInMonth: dim,
    elapsedDays: elapsed.length,
    inProgress: elapsed.length < dim,
    days,
    total,
    activeDays,
    streak: longestStreak(days),
    bestDay: peak ? { date: peak.date, count: peak.count } : null,
    weekendShare: total ? weekendTotal / total : 0,
    counts: data.counts,
    topRepos,
    topLanguage: topRepos[0]?.language ? { name: topRepos[0].language, color: topRepos[0].languageColor } : null,
    shipped: rankPullRequests(data.mergedPrs),
    mergedPrTotal: Math.max(data.mergedPrTotal ?? 0, data.mergedPrs.length),
  };
  stats.tagline = pickTagline(stats, `${stats.username.toLowerCase()}:${month}`).text;
  return stats;
}
