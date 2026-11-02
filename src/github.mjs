// Data fetching: talks to the GitHub GraphQL API and returns plain, normalized
// data. Privacy filtering happens HERE, so nothing downstream (stats,
// rendering, a future web UI) can leak private repo names by accident.
//
// Transport: `gh api graphql` when the GitHub CLI is installed, otherwise
// fetch() with the GITHUB_TOKEN env var. The token is only ever put in an
// Authorization header; it is never logged, written to disk or put in errors.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WrappedError } from './errors.mjs';
import { monthRange } from './dates.mjs';

const execFileAsync = promisify(execFile);

const GRAPHQL_URL = 'https://api.github.com/graphql';
const MAX_PR_PAGES = 5; // 5 x 100 merged PRs is plenty for ranking one month

export const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

export const VIEWER_QUERY = `query { viewer { login } }`;

export const PROFILE_QUERY = `
query ($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    name
    avatarUrl(size: 160)
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner isPrivate primaryLanguage { name color } }
        contributions { totalCount }
      }
    }
  }
}`;

export const MERGED_PRS_QUERY = `
query ($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        title
        url
        additions
        deletions
        comments { totalCount }
        repository { nameWithOwner isPrivate }
      }
    }
  }
}`;

// ---------------------------------------------------------------- transport

/**
 * Returns `run(query, variables) => data`, which throws WrappedError on any
 * failure. Pass your own `run` to fetchMonthData() to test or to use another
 * transport.
 */
export function createRunner({ env = process.env } = {}) {
  return async function run(query, variables = {}) {
    try {
      const args = ['api', 'graphql', '-f', `query=${query}`];
      for (const [key, value] of Object.entries(variables)) {
        if (value != null) args.push('-f', `${key}=${value}`); // -f = always a raw string
      }
      const { stdout } = await execFileAsync('gh', args, {
        env,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 60_000,
      });
      return unwrap(JSON.parse(stdout));
    } catch (err) {
      if (err.code === 'ENOENT') return runWithFetch(query, variables, env); // gh not installed
      if (err instanceof WrappedError) throw err;
      // gh exits non-zero on GraphQL errors but still prints the response body.
      const body = parseJson(err.stdout);
      if (body) return unwrap(body);
      throw classify(`${err.stderr ?? ''}`.trim() || 'gh api graphql failed');
    }
  };
}

async function runWithFetch(query, variables, env) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) {
    throw new WrappedError('No GitHub credentials found.', {
      code: 'AUTH',
      hint: 'Install the GitHub CLI and run `gh auth login`, or set GITHUB_TOKEN.',
    });
  }
  let res;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'github-wrapped',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new WrappedError(`Could not reach GitHub (${err.cause?.code ?? err.name}).`, { code: 'NETWORK' });
  }
  const body = parseJson(await res.text());
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    throw rateLimited(reset ? new Date(reset * 1000) : null);
  }
  if (res.status === 401) throw classify('Bad credentials (HTTP 401)');
  if (!res.ok || !body) throw classify(body?.message ?? `Unexpected response from GitHub (HTTP ${res.status})`);
  return unwrap(body);
}

function unwrap(body) {
  // HTTP-level failures (401, 403, ...) arrive as {"message": ...} with no `errors`/`data`.
  if (body.message && !body.errors && !body.data) throw classify(body.message);
  const errors = body.errors ?? [];
  if (errors.length) {
    const notFound = errors.find((e) => e.type === 'NOT_FOUND');
    if (notFound) throw new WrappedError(notFound.message, { code: 'NOT_FOUND' });
    const message = errors.map((e) => e.message).join('; ');
    if (errors.some((e) => e.type === 'RATE_LIMITED') || /rate limit/i.test(message)) throw rateLimited();
    throw classify(message);
  }
  if (!body.data) throw new WrappedError('Unexpected response from GitHub.', { code: 'API' });
  return body.data;
}

function classify(text) {
  const message = text.replace(/\s+/g, ' ').slice(0, 300);
  if (/rate limit/i.test(message)) return rateLimited();
  if (/could not resolve to a user/i.test(message)) return new WrappedError(message, { code: 'NOT_FOUND' });
  if (/bad credentials|HTTP 401|gh auth login|not logged in|authentication/i.test(message)) {
    return new WrappedError('GitHub rejected the credentials.', {
      code: 'AUTH',
      hint: 'Run `gh auth login` (or `gh auth status` to check), or set a valid GITHUB_TOKEN.',
    });
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timed out|could not resolve host|dial tcp|error connecting/i.test(message)) {
    return new WrappedError('Could not reach GitHub. Check your network connection.', { code: 'NETWORK' });
  }
  return new WrappedError(`GitHub API error: ${message}`, { code: 'API' });
}

function rateLimited(resetAt) {
  const when = resetAt ? ` Resets around ${resetAt.toLocaleTimeString()}.` : '';
  return new WrappedError(`GitHub API rate limit reached.${when}`, {
    code: 'RATE_LIMIT',
    hint: 'Wait a few minutes and try again.',
  });
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------- data

/** Login of the authenticated user (the token's owner). */
export async function fetchViewerLogin(run) {
  const data = await run(VIEWER_QUERY);
  return data.viewer.login;
}

/**
 * Fetches and normalizes everything needed for one user-month.
 *
 * Privacy: private repositories (and the PRs inside them) are only included
 * when the card is about the authenticated user, and never with `publicOnly`.
 *
 * @param {object} options
 * @param {Function} options.run        GraphQL runner, see createRunner()
 * @param {string}  [options.username]  defaults to the authenticated user
 * @param {string}   options.month      'YYYY-MM'
 * @param {string}   options.today      'YYYY-MM-DD' (limits the query window for the current month)
 * @param {boolean} [options.publicOnly]
 */
export async function fetchMonthData({ run, username, month, today, publicOnly = false }) {
  const viewer = await fetchViewerLogin(run);
  const login = username ?? viewer;
  if (!LOGIN_PATTERN.test(login)) {
    throw new WrappedError(`"${login}" is not a valid GitHub username.`, { code: 'BAD_USERNAME' });
  }
  const isSelf = viewer.toLowerCase() === login.toLowerCase();
  const includePrivate = isSelf && !publicOnly;

  const { first, last } = monthRange(month);
  if (first > today) {
    throw new WrappedError(`${month} is in the future.`, { code: 'BAD_MONTH' });
  }
  const to = today < last ? today : last; // don't ask for days that haven't happened

  let profile;
  let prs;
  try {
    [profile, prs] = await Promise.all([
      run(PROFILE_QUERY, { login, from: `${first}T00:00:00Z`, to: `${to}T23:59:59Z` }),
      fetchMergedPrs({ run, login, first, last, includePrivate }),
    ]);
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw notFound(login);
    throw err;
  }
  if (!profile.user) throw notFound(login);

  const { user } = profile;
  const cc = user.contributionsCollection;
  return {
    username: user.login,
    name: user.name || null,
    avatarUrl: user.avatarUrl,
    month,
    isSelf,
    includePrivate,
    days: cc.contributionCalendar.weeks
      .flatMap((w) => w.contributionDays)
      .map((d) => ({ date: d.date, count: d.contributionCount })),
    counts: {
      commits: cc.totalCommitContributions,
      pullRequests: cc.totalPullRequestContributions,
      issues: cc.totalIssueContributions,
      reviews: cc.totalPullRequestReviewContributions,
      restricted: cc.restrictedContributionsCount,
    },
    repos: cc.commitContributionsByRepository
      .filter((r) => includePrivate || !r.repository.isPrivate)
      .map((r) => ({
        name: r.repository.nameWithOwner,
        commits: r.contributions.totalCount,
        language: r.repository.primaryLanguage?.name ?? null,
        languageColor: r.repository.primaryLanguage?.color ?? null,
      })),
    mergedPrs: prs.items,
    mergedPrTotal: prs.total,
  };
}

function notFound(login) {
  const looksLikeMonth = /^\d{4}-\d{2}$/.test(login);
  return new WrappedError(`GitHub user "${login}" not found.`, {
    code: 'NOT_FOUND',
    hint: looksLikeMonth ? 'The username comes first: node wrapped.mjs [username] [YYYY-MM]' : undefined,
  });
}

async function fetchMergedPrs({ run, login, first, last, includePrivate }) {
  const q = [
    'is:pr',
    `author:${login}`,
    'is:merged',
    `merged:${first}..${last}`,
    includePrivate ? '' : 'is:public',
  ].filter(Boolean).join(' ');

  const items = [];
  let total = 0;
  let after = null;
  for (let page = 0; page < MAX_PR_PAGES; page++) {
    const { search } = await run(MERGED_PRS_QUERY, { q, after });
    total = search.issueCount;
    for (const pr of search.nodes) {
      if (!pr?.repository) continue; // non-PR nodes
      if (!includePrivate && pr.repository.isPrivate) continue; // belt and braces with is:public
      items.push({
        title: pr.title,
        url: pr.url,
        repo: pr.repository.nameWithOwner,
        additions: pr.additions,
        deletions: pr.deletions,
        comments: pr.comments.totalCount,
      });
    }
    if (!search.pageInfo.hasNextPage) break;
    after = search.pageInfo.endCursor;
  }
  return { items, total };
}

// ------------------------------------------------------------------ avatar

/**
 * Downloads the avatar and returns a data: URI so the card is fully
 * self-contained. Returns null on any failure (the card draws an initial).
 */
export async function fetchAvatarDataUri(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' || !/(^|\.)githubusercontent\.com$|(^|\.)github\.com$/.test(hostname)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 2_000_000) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
