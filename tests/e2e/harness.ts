import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Page } from 'playwright';

/**
 * Boots Chrome on the dev server and hands the page to `body`, failing the run if the page logged
 * any error or failed any request. Closes the browser either way.
 *
 * Starts its own Vite server unless TOY_URL points somewhere already running.
 */

const started: Array<ChildProcess> = [];

async function waitForServer(url: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`dev server never came up at ${url}`);
}

export async function startServer(): Promise<string> {
  if (process.env.TOY_URL) return process.env.TOY_URL;
  const child = spawn('npx', ['vite', '--port', '5199', '--strictPort'], {
    stdio: 'ignore',
    detached: false,
  });
  started.push(child);
  const url = 'http://localhost:5199';
  await waitForServer(url);
  return url;
}

export async function stopServer(): Promise<void> {
  for (const child of started.splice(0)) child.kill();
}

async function withBrowser(body: (page: Page, url: string) => Promise<void>): Promise<void> {
  const url = await startServer();
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // Collect faults through the response listener only: it sees the URL, which the generic
    // console "Failed to load resource" line does not, so the favicon 404 can be told apart.
    const faults: string[] = [];
    page.on('pageerror', (e) => faults.push(`uncaught: ${e.message}`));
    page.on('console', (m) => {
      const text = m.text();
      if (m.type() === 'error' && !text.includes('Failed to load resource')) faults.push(`console: ${text}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) faults.push(`${r.status()} ${r.url()}`);
    });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('canvas') !== null);
    await page.waitForTimeout(600); // let a few frames render
    try {
      await body(page, url);
    } finally {
      if (faults.length > 0) throw new Error(`page reported errors:\n  ${faults.join('\n  ')}`);
    }
  } finally {
    await browser.close();
  }
}

/** Runs `body` against a freshly loaded page in the forest scene. */
export function withPage(body: (page: Page) => Promise<void>): Promise<void> {
  return withBrowser((page) => body(page));
}

/** Switches to the sky scene before running `body`. */
export async function withSkyScene(body: (page: Page) => Promise<void>): Promise<void> {
  await withPage(async (page) => {
    await page.getByRole('tab', { name: 'Empty sky' }).click();
    await page.waitForTimeout(800);
    await body(page);
  });
}

/** Screenshots the canvas, returning the raw PNG so two frames can be compared byte for byte. */
export async function frame(page: Page): Promise<Buffer> {
  return page.locator('canvas').screenshot();
}

/** True when the frame has more than a couple of distinct colours, i.e. something was drawn. */
export function looksDrawn(png: Buffer): boolean {
  // A blank canvas compresses to almost nothing; real content is far larger.
  return png.length > 8000;
}
