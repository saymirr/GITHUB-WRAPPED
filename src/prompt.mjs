// The interactive mode: ask for the username and month instead of making
// people learn the command-line arguments.

import { createInterface } from 'node:readline/promises';
import { parseMonth, previousMonth } from './dates.mjs';
import { WrappedError } from './errors.mjs';

const MAX_TRIES = 3;

/**
 * @param {{ today: string, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream }} options
 * @returns {Promise<{ username: string | undefined, month: string }>}
 */
export async function askForRequest({ today, input = process.stdin, output = process.stdout }) {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question('GitHub username (press Enter for yourself): ')).trim().replace(/^@/, '');
    const username = answer || undefined;

    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const reply = (await rl.question('Month as YYYY-MM, or "last" (press Enter for this month): ')).trim().toLowerCase();
      const month = reply === '' ? today.slice(0, 7) : reply === 'last' ? previousMonth(today) : reply;
      try {
        parseMonth(month);
        return { username, month };
      } catch (err) {
        output.write(`${err.message} ${err.hint ?? ''}\n`);
      }
    }
    throw new WrappedError('Too many invalid months.', { code: 'USAGE', hint: 'Use YYYY-MM, e.g. 2026-10.' });
  } finally {
    rl.close();
  }
}
