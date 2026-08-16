#!/usr/bin/env node
/**
 * playwright-run — Execute arbitrary Playwright scripts.
 *
 * Usage:
 *   node playwright-run.mjs <script-file.js>
 *   echo 'code' | node playwright-run.mjs
 *   node playwright-run.mjs -e 'await page.goto("...")'
 *
 * The script receives these pre-bound variables:
 *   chromium   — Playwright's chromium browser type
 *   firefox    — Playwright's firefox browser type
 *   webkit     — Playwright's webkit browser type
 *   findChrome() — helper to locate the Chromium executable
 *
 * The script body is wrapped in an async function. The return value
 * is JSON-serialized and printed to stdout.
 *
 * Example:
 *   node playwright-run.mjs -e '
 *     const browser = await chromium.launch({ headless: true });
 *     const page = await browser.newPage();
 *     await page.goto("https://example.com");
 *     const title = await page.title();
 *     await browser.close();
 *     return { title };
 *   '
 */

import { chromium, firefox, webkit } from 'playwright';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Chrome discovery ──────────────────────────────────────────────

function findChrome() {
  if (process.env.WEB_BROWSE_CHROMIUM_PATH) {
    return process.env.WEB_BROWSE_CHROMIUM_PATH;
  }
  const candidates = [
    join(__dirname, '.playwright-browsers'),
    join(process.env.HOME ?? '/tmp', 'Library/Caches/ms-playwright'),
  ];
  for (const root of candidates) {
    try {
      if (!existsSync(root)) continue;
      for (const dir of readdirSync(root, { withFileTypes: true })) {
        if (!dir.isDirectory() || !dir.name.startsWith('chromium')) continue;
        for (const inner of readdirSync(join(root, dir.name), { withFileTypes: true })) {
          if (!inner.isDirectory() || !inner.name.includes('mac')) continue;
          const exe = join(root, dir.name, inner.name, 'chrome-headless-shell');
          if (existsSync(exe)) return exe;
        }
      }
    } catch (_) {}
  }
  return undefined;
}

// ── Argument parsing ──────────────────────────────────────────────

let code = '';

if (process.argv.includes('-e')) {
  const idx = process.argv.indexOf('-e');
  code = process.argv.slice(idx + 1).join(' ');
} else if (process.argv.includes('-b')) {
  const idx = process.argv.indexOf('-b');
  const encoded = process.argv[idx + 1];
  code = Buffer.from(encoded, 'base64').toString('utf8');
} else if (process.argv.includes('--stdin') || process.argv.length <= 2) {
  // Read from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  code = Buffer.concat(chunks).toString('utf8');
} else {
  // Read from file
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node playwright-run.mjs <script.js> | -e <code> | --stdin');
    process.exit(1);
  }
  code = readFileSync(filePath, 'utf8');
}

if (!code.trim()) {
  console.error('Error: no script provided');
  process.exit(1);
}

// ── Auto-detect browser path ──────────────────────────────────────

const CHROME_PATH = findChrome();

/**
 * Wrapped launch: auto-injects the Chromium executable path so the user
 * doesn't need to call findChrome() manually. Firefox and WebKit work
 * normally (they use their own bundled engines).
 */
function launch(browserType, options = {}) {
  if (browserType === chromium && CHROME_PATH) {
    return browserType.launch({ ...options, executablePath: CHROME_PATH });
  }
  return browserType.launch(options);
}

// ── Execute ────────────────────────────────────────────────────────

const TIMEOUT_MS = parseInt(process.env.PLAYWRIGHT_RUN_TIMEOUT ?? '60000');

try {
  // Wrap the user code in an async function that receives chromium/firefox/webkit/findChrome
  const wrapped = `
    return (async () => {
      ${code}
    })();
  `;

  const fn = new Function('chromium', 'firefox', 'webkit', 'findChrome', 'launch', wrapped);

  const result = await Promise.race([
    fn(chromium, firefox, webkit, findChrome, launch),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Script timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
    ),
  ]);

  // Pretty-print the result
  if (result === undefined) {
    console.log(JSON.stringify({ ok: true }));
  } else if (typeof result === 'string') {
    console.log(JSON.stringify({ result }));
  } else {
    // Try to serialize; handle circular refs
    try {
      console.log(JSON.stringify(result, null, 2));
    } catch {
      console.log(JSON.stringify({ result: String(result) }));
    }
  }
} catch (error) {
  console.log(JSON.stringify({
    error: error.message,
    ...(error.stack ? { stack: error.stack.split('\n').slice(0, 5).join('\n') } : {}),
  }));
  process.exitCode = 1;
}