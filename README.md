# GitHub Wrapped

Turn one month of anyone's GitHub activity into a shareable, Twitter/X-sized PNG card (1200×675): the month's contribution grid, a few big stats, what got merged, and a one-line tagline.

![Example card](docs/example.png)

<sub>The example above is generated from synthetic sample data (`npm run sample`), not a real account.</sub>

## What's on the card

- **The grid**: the month as GitHub-style green squares (weeks as columns, Sunday-first). Colour levels are relative to the month itself; the best day gets a ring. Days that haven't happened yet are dashed.
- **Four stats**: total contributions, longest streak, active days (out of the month's days), best day.
- **Shipped**: the top 3 merged PRs of the month, ranked by size (additions + deletions, then comments), with their repos. With no merged PRs it becomes a per-category breakdown, or disappears if there's nothing to show.
- **Top repos**: top 3 by commit count, plus the top repo's main language.
- **A tagline** picked by simple rules from the stats ("31/31 days. no days off.", "weekends are for shipping."). No AI, no network. See [`src/tagline.mjs`](src/tagline.mjs).
- **Footer**: avatar, `@username`, month, and a watermark you can change.

## Requirements

- Node.js 20+
- GitHub credentials, either of:
  - the [GitHub CLI](https://cli.github.com/) logged in (`gh auth login`), **or**
  - a `GITHUB_TOKEN` environment variable (used only if `gh` isn't installed)
- Chromium for Playwright (the card is HTML, screenshotted headlessly)

## Install

```sh
git clone <this repo> github-wrapped && cd github-wrapped
npm install
npx playwright install chromium   # one-time download
```

## Usage

```sh
node wrapped.mjs [username] [YYYY-MM] [options]
```

```sh
node wrapped.mjs                      # you, this month
node wrapped.mjs torvalds             # someone else, this month
node wrapped.mjs torvalds 2026-09     # a specific month
node wrapped.mjs me 2026-09 --public-only --scale 2
```

The result is saved as `wrapped-<username>-<YYYY-MM>.png` in the current directory.

| Option | |
|---|---|
| `-o, --out <file>` | Output path |
| `--public-only` | Hide private repos even on your own card |
| `--scale <1-4>` | Pixel density; `2` gives a 2400×1350 image (default `1`) |
| `-h, --help` | Usage |

The username always comes first. The current month is shown as "so far" until it ends.

## Privacy and tokens

- **Your token is never logged, printed, or written to disk.** With `gh`, the token is handled entirely by the GitHub CLI. In the `GITHUB_TOKEN` fallback it is sent only as an `Authorization` header to `api.github.com`, and error messages never include it.
- The tool talks only to `api.github.com` (GraphQL) and GitHub's avatar CDN. No telemetry, no other services.
- **Other people's cards are public-data-only.** Private (and internal) repositories, and the PRs inside them, are filtered out in the data layer ([`src/github.mjs`](src/github.mjs)), before stats or rendering ever see them, so their names and titles can't end up on the image, even if your token can read those repos. The search also adds `is:public`.
- **Your own card includes your private repo and PR names**, because it's your data. Before posting it publicly, either check what's on it or generate it with `--public-only`.
- Daily counts and totals include private activity only if the account has "Include private contributions on my profile" enabled. Those are numbers only, never names.
- `gh auth login`'s default scopes are enough. A fine-grained token with read-only public access works for public data (your own private repos need `repo` read access).

## Customize

Everything visual lives in [`src/config.mjs`](src/config.mjs): theme colors, font family and files, grid sizing, card size, and the **footer watermark** (`watermark`, currently a placeholder). Tagline rules are a plain priority-ordered list in [`src/tagline.mjs`](src/tagline.mjs).

## How it's organized

Fetching, stats and rendering are separate, I/O-free-where-possible modules, so a web version can reuse them:

| Module | Job | I/O |
|---|---|---|
| `src/github.mjs` | GraphQL queries, privacy filtering, normalizing | network (`gh` / `fetch`) |
| `src/stats.mjs`, `src/tagline.mjs` | totals, streaks, levels, ranking, tagline | none |
| `src/html.mjs` | stats → self-contained HTML string | none |
| `src/png.mjs` | HTML → PNG via Playwright | browser |
| `src/config.mjs`, `src/fonts.mjs` | theme/fonts/watermark; font embedding | file read |
| `wrapped.mjs` | CLI wiring | |

A web version would call `fetchMonthData()` with its own `run(query, variables)` function, then `computeStats()` and `renderCardHtml()`, and serve the HTML (or screenshot it server-side).

## Development

```sh
npm test            # unit tests; no network or token needed
npm run sample      # regenerate docs/example.png from synthetic data
node scripts/render-sample.mjs --all out/   # every edge-case layout, for eyeballing
```

The tests cover stats, tagline rules, HTML escaping, the privacy filter, and the `gh`/`fetch` transport (against a fake `gh`).

## Notes and limits

- Dates are handled in UTC, like GitHub's contribution calendar.
- Merged PRs are ranked from up to 500 PRs per month.
- Fonts: [Inter](https://github.com/rsms/inter) (SIL OFL 1.1) is bundled in `assets/fonts` and embedded in the HTML, so cards look the same everywhere.

## Troubleshooting

| Message | Fix |
|---|---|
| `Chromium is not installed for Playwright` | `npx playwright install chromium` |
| `GitHub rejected the credentials` / `No GitHub credentials found` | `gh auth login`, or set `GITHUB_TOKEN` |
| `GitHub API rate limit reached` | Wait and retry; limits reset hourly |
| `GitHub user "x" not found` | Check the spelling; the username comes before the month |

## License

[MIT](LICENSE). The bundled Inter font is under the [SIL Open Font License](assets/fonts/LICENSE-Inter.txt).
