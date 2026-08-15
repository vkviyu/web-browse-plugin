#!/usr/bin/env node
/**
 * web-browse — Headless Chromium browser for DSH (DeepSeek Harness).
 *
 * Usage:
 *   node web-browse.mjs <url> [options]
 *
 * Options:
 *   --no-links         Skip link extraction
 *   --max-text <n>     Max characters of page text (default: 8000)
 *   --selector <css>   Extract text matching this CSS selector only
 *   --screenshot       Take a full-page screenshot (outputs path to PNG)
 *   --wait <ms>        Extra wait time after page load (ms)
 *   --json             Output raw JSON (default)
 *   --text             Output plain text only (no JSON wrapper)
 *
 * Examples:
 *   node web-browse.mjs "https://example.com"
 *   node web-browse.mjs "https://www.bing.com/search?q=hello" --max-text 4000
 *   node web-browse.mjs "https://example.com" --selector "article" --no-links
 *   node web-browse.mjs "https://example.com" --screenshot
 */

import { chromium } from 'playwright';
import { readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Browser discovery ──────────────────────────────────────────────

function findChrome() {
  // 1. Explicit env var
  if (process.env.WEB_BROWSE_CHROMIUM_PATH) {
    return process.env.WEB_BROWSE_CHROMIUM_PATH;
  }
  // 2. Playwright cache in project root
  const root = join(__dirname, '.playwright-browsers');
  if (existsSync(root)) {
    const exe = scanDir(root);
    if (exe) return exe;
  }
  // 3. Default Playwright cache
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
  const defaultCache = join(home, 'Library/Caches/ms-playwright');
  if (existsSync(defaultCache)) {
    const exe = scanDir(defaultCache);
    if (exe) return exe;
  }
  return undefined;
}

function scanDir(root) {
  try {
    for (const dir of readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory() || !dir.name.startsWith('chromium')) continue;
      for (const inner of readdirSync(join(root, dir.name), { withFileTypes: true })) {
        if (!inner.isDirectory() || !inner.name.includes('mac')) continue;
        const exe = join(root, dir.name, inner.name, 'chrome-headless-shell');
        if (existsSync(exe)) return exe;
      }
    }
  } catch (_) {}
  return undefined;
}

// ── Argument parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
const urlIndex = args.findIndex(a => !a.startsWith('--'));
if (urlIndex === -1) {
  console.error('Usage: node web-browse.mjs <url> [--no-links] [--max-text <n>] [--selector <css>] [--screenshot] [--wait <ms>] [--text]');
  process.exit(1);
}

const url = args[urlIndex];
const extractLinks = !args.includes('--no-links');
const screenshot = args.includes('--screenshot');
const textOnly = args.includes('--text');
const selectorIdx = args.indexOf('--selector');
const selector = selectorIdx !== -1 ? args[selectorIdx + 1] : null;
const maxTextIdx = args.indexOf('--max-text');
const maxText = maxTextIdx !== -1 ? parseInt(args[maxTextIdx + 1]) || 8000 : 8000;
const waitIdx = args.indexOf('--wait');
const waitMs = waitIdx !== -1 ? parseInt(args[waitIdx + 1]) || 0 : 0;

// ── Main ────────────────────────────────────────────────────────────

let browser = null;
let page = null;

try {
  const exe = findChrome();
  browser = await chromium.launch({
    headless: true,
    ...(exe ? { executablePath: exe } : {}),
  });

  page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  });

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });

  if (waitMs > 0) {
    await page.waitForTimeout(waitMs);
  }

  const title = await page.title();
  const finalUrl = page.url();

  // Extract text
  let text;
  if (selector) {
    text = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return '(no element matching selector: ' + sel + ')';
      const clone = el.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach(e => e.remove());
      return clone.innerText.replace(/\n{3,}/g, '\n\n').trim();
    }, selector);
  } else {
    text = await page.evaluate(() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, nav, footer, header, iframe, svg').forEach(el => el.remove());
      return clone.innerText.replace(/\n{3,}/g, '\n\n').trim();
    });
  }

  const totalLen = text.length;
  if (text.length > maxText) {
    text = text.slice(0, maxText) + `\n\n... [truncated, ${totalLen} total chars]`;
  }

  const result = {
    url: finalUrl,
    title,
    textLength: totalLen,
    text,
  };

  // Screenshot
  if (screenshot) {
    const screenshotsDir = join(__dirname, 'screenshots');
    mkdirSync(screenshotsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `shot-${ts}.png`;
    const filepath = join(screenshotsDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    result.screenshot = filepath;
  }

  // Links
  if (extractLinks) {
    const links = await page.evaluate(() => {
      const items = [];
      const seen = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        const label = a.innerText.trim().slice(0, 120);
        if (href.startsWith('http') && !seen.has(href) && label.length > 0) {
          seen.add(href);
          items.push({ url: href, text: label });
        }
      });
      return items.slice(0, 50);
    });
    result.linksCount = links.length;
    result.links = links;
  }

  if (textOnly) {
    console.log(result.text);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  const err = { error: error.message };
  if (textOnly) {
    console.error('ERROR:', error.message);
  } else {
    console.log(JSON.stringify(err));
  }
  process.exitCode = 1;
} finally {
  if (page) await page.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}