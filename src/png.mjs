// Rendering, step 2: HTML -> PNG with a headless Chromium (Playwright).

import { WrappedError } from './errors.mjs';

/**
 * @param {string} html
 * @param {string} outPath
 * @param {{ width: number, height: number, scale?: number }} options
 */
export async function renderPng(html, outPath, { width, height, scale = 1 }) {
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    if (/Executable doesn't exist|browserType\.launch/i.test(err.message)) {
      throw new WrappedError('Chromium is not installed for Playwright.', {
        code: 'NO_BROWSER',
        hint: 'Run: npx playwright install chromium',
      });
    }
    throw err;
  }
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
}
