// Turns command-line arguments into "whose card, which month".

import { parseMonth, previousMonth } from './dates.mjs';
import { WrappedError } from './errors.mjs';

/**
 * @param {{ positionals: string[], last?: boolean, today: string }} input
 * @returns {{ username: string | undefined, month: string }}
 */
export function resolveRequest({ positionals, last = false, today }) {
  const [username, monthArg] = positionals.map((p) => p || undefined); // '' = not given
  if (last && monthArg) {
    throw new WrappedError('Use either --last or a month, not both.', { code: 'USAGE' });
  }
  const month = last ? previousMonth(today) : monthArg ?? today.slice(0, 7);
  parseMonth(month); // validate early, before any network call
  return { username, month };
}
