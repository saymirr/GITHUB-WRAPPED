// Small, dependency-free string helpers shared by stats and rendering.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes untrusted text (PR titles, repo names...) for HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** 1234 -> '1,234'; 12345 -> '12.3k'; 1250000 -> '1.3M'. */
export function formatCount(n) {
  if (n < 10_000) return n.toLocaleString('en-US');
  if (n < 1_000_000) return `${(Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(Math.floor(n / 100_000) / 10).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Collapses whitespace/newlines and cuts to `max` characters with an ellipsis. */
export function shorten(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...clean]; // count code points, don't split surrogate pairs
  if (chars.length <= max) return clean;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

/**
 * Shortens 'owner/repo' by trimming the owner first, so the repo name (the
 * interesting half) survives. `viewer` hides the owner when it is the person
 * the card is about.
 */
export function shortenRepo(nameWithOwner, max = 36, viewer = '') {
  const [owner, ...rest] = String(nameWithOwner).split('/');
  const repo = rest.join('/');
  if (!repo) return shorten(owner, max);
  if (owner.toLowerCase() === viewer.toLowerCase()) return shorten(repo, max);
  const full = `${owner}/${repo}`;
  if ([...full].length <= max) return full;
  const room = max - [...repo].length - 1;
  if (room >= 4) return `${shorten(owner, room)}/${repo}`;
  return shorten(repo, max);
}
