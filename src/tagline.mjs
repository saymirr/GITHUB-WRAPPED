// Rule-based taglines. The first rule whose `when` matches wins; its variants
// are picked deterministically from a seed (username + month), so a card always
// regenerates identically but different people get different wording.
// Add a rule by dropping an entry into RULES, in priority order.

import { shortDate } from './dates.mjs';

const RULES = [
  {
    id: 'empty',
    when: (s) => s.total === 0,
    lines: () => ['nothing shipped. nothing owed.', 'a month off the grid. well earned.', 'zero contributions. the grid says hi.'],
  },
  {
    id: 'perfect',
    when: (s) => s.elapsedDays >= 7 && s.activeDays === s.elapsedDays,
    lines: (s) => s.inProgress
      ? [`${s.activeDays}/${s.activeDays} days so far. no days off.`, `perfect attendance so far. ${s.activeDays} for ${s.activeDays}.`]
      : [`${s.daysInMonth}/${s.daysInMonth} days. no days off.`, `every single day. ${s.daysInMonth}/${s.daysInMonth}.`],
  },
  {
    id: 'streak',
    when: (s) => s.streak.length >= 14 && s.streak.length >= 0.6 * s.elapsedDays,
    lines: (s) => [`${s.streak.length} days straight. the grid is mostly green.`, `a ${s.streak.length}-day streak. who needs weekends?`],
  },
  {
    id: 'weekend',
    when: (s) => s.total >= 20 && s.activeDays >= 6 && s.weekendShare >= 0.4,
    lines: () => ['weekends are for shipping.', 'saturday is just another workday.'],
  },
  {
    id: 'spike',
    when: (s) => s.total >= 20 && s.bestDay && s.bestDay.count >= 0.4 * s.total,
    lines: (s) => [`${Math.round((100 * s.bestDay.count) / s.total)}% of this month happened on ${shortDate(s.bestDay.date)}.`, 'one big day. the rest was vibes.'],
  },
  {
    id: 'reviewer',
    when: (s) => s.counts.reviews >= 10 && s.counts.reviews > s.counts.commits,
    lines: () => ['more reading than writing. respect.', 'reviewer of the month.'],
  },
  {
    id: 'pull-requests',
    when: (s) => s.counts.pullRequests >= 15,
    lines: (s) => ['pull request machine.', `${s.counts.pullRequests} pull requests. busy month.`],
  },
  {
    id: 'issues',
    when: (s) => s.counts.issues >= 10 && s.counts.issues > s.counts.commits,
    lines: () => ['professional issue wrangler.', 'the backlog never sleeps.'],
  },
  {
    id: 'private',
    when: (s) => s.total >= 20 && s.counts.restricted >= 0.6 * s.total,
    lines: () => ['most of this happened behind closed doors.', 'classified. mostly.'],
  },
  {
    id: 'weekdays',
    when: (s) => s.activeDays >= 10 && s.weekendShare < 0.03,
    lines: () => ['strictly nine to five. healthy.', 'weekends off. respect.'],
  },
  {
    id: 'volume',
    when: (s) => s.total >= 300,
    lines: (s) => [`${s.total.toLocaleString('en-US')} contributions. who's counting?`, 'a lot of green. a lot.'],
  },
  {
    id: 'light',
    when: (s) => s.activeDays <= 4,
    lines: () => ['few days. all signal.', 'quality over quantity.'],
  },
  {
    id: 'steady',
    when: () => true,
    lines: (s) => [`${s.activeDays} days on the grid.`, 'steady. showed up.', 'low drama. consistent output.'],
  },
];

function hash(text) {
  let h = 2166136261; // FNV-1a
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/**
 * @param {object} s  stats: total, activeDays, elapsedDays, daysInMonth,
 *                    inProgress, streak, bestDay, counts, weekendShare
 * @param {string} seed
 * @returns {{ id: string, text: string }}
 */
export function pickTagline(s, seed) {
  const rule = RULES.find((r) => r.when(s));
  const lines = rule.lines(s);
  return { id: rule.id, text: lines[hash(`${seed}:${rule.id}`) % lines.length] };
}
