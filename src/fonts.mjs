// Node-only: turns the font files listed in config into @font-face rules with
// the data embedded, so the HTML needs no external requests.

import { readFile } from 'node:fs/promises';

export async function loadFontCss(config) {
  const faces = await Promise.all(config.fonts.files.map(async ({ weight, path }) => {
    const data = (await readFile(path)).toString('base64');
    return `@font-face{font-family:'Inter';font-weight:${weight};font-style:normal;font-display:block;` +
      `src:url(data:font/woff2;base64,${data}) format('woff2')}`;
  }));
  return faces.join('\n');
}
