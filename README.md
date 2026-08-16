# web-browse-plugin

> Headless Chromium browser tool for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).  
> Browse the web, search engines, scrape pages — all from your AI agent.

## Why?

DeepSeek Harness has a built-in `web_search` tool, but it requires the **official DeepSeek API** (it speaks the Anthropic Messages protocol with native `web_search_20250305`). If you use a third-party API proxy (Ark/Volcano, OpenRouter, etc.), `web_search` fails with authentication errors.

**web-browse-plugin** replaces it with a local headless Chromium browser powered by [Playwright](https://playwright.dev). It works with **any** LLM provider.

| | `web_search` (built-in) | `web_browse` (this plugin) |
|---|---|---|
| Provider | DeepSeek official API only | Any (local browser) |
| Search | DeepSeek server-side | Bing / Google / Baidu / any |
| Page content | Structured snippets | Full page text + links |
| Interaction | None | Click, type, scroll, screenshot |
| Installation | Zero | `pnpm install` + Chromium download |

## Quick Start

### One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/vkviyu/web-browse-plugin/main/install.sh | bash
```

### Manual install

```bash
git clone https://github.com/vkviyu/web-browse-plugin.git
cd web-browse-plugin
pnpm install
pnpm run install:browser
```

### Test it

```bash
node web-browse.mjs "https://example.com"
```

```bash
node web-browse.mjs "https://www.bing.com/search?q=deepseek+harness"
```

## Usage

### `web_browse` — URL browsing

**CLI**

```bash
# Basic browse
node web-browse.mjs "https://example.com"

# Search the web
node web-browse.mjs "https://www.bing.com/search?q=your+query"

# Limit output
node web-browse.mjs "https://example.com" --max-text 2000

# Extract specific element
node web-browse.mjs "https://example.com" --selector "article.main"

# Full-page screenshot
node web-browse.mjs "https://example.com" --screenshot

# Plain text output (no JSON wrapper)
node web-browse.mjs "https://example.com" --text
```

### `playwright_run` — Execute arbitrary Playwright scripts

> **This is the POWER tool.** Instead of calling individual MCP-style operations (navigate, click, getText…) with round-trips for each, write real JavaScript that drives the browser directly — loops, conditions, parallel pages, all in ONE call.

```bash
# Simple: get a page title
node playwright-run.mjs -e '
  const browser = await launch(chromium, { headless: true });
  const page = await browser.newPage();
  await page.goto("https://example.com");
  const title = await page.title();
  await browser.close();
  return { title };
'

# Multi-page scraping — sequential + parallel in ONE call
node playwright-run.mjs -e '
  const browser = await launch(chromium, { headless: true });
  const results = [];
  for (let i = 1; i <= 5; i++) {
    const page = await browser.newPage();
    await page.goto(`https://api.example.com/items?page=${i}`);
    results.push(await page.evaluate(() => document.body.innerText));
    await page.close();
  }
  await browser.close();
  return results;
'
```

**Available in the script scope:**

| Variable | Description |
|----------|-------------|
| `chromium` | Playwright's Chromium browser type |
| `firefox` | Playwright's Firefox browser type |
| `webkit` | Playwright's WebKit browser type |
| `launch(bt, opts)` | Auto-injects Chromium executable path |
| `findChrome()` | Returns the local Chromium executable path |

### As a DSH tool

Once installed, register the `web_browse` tool in your agent. Two ways:

#### A) Dynamic Plugin (per-session)

Paste the content of `plugin.cordis.js` into a dynamic Cordis Plugin in your DSH session. Update the `SCRIPT` and `WORKDIR` paths to match your installation.

#### B) Static (persistent)

Add to your DSH profile's `cordis.patch.yml`:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: web-browse
      name: cordis:group
      group: true
      config:
        - id: web-browse-tool
          name: ./plugin.cordis.js
```

### Via the bash tool (always works)

Even without registering the plugin, your agent can use it through the `bash` tool:

```
node /path/to/web-browse-plugin/web-browse.mjs "https://www.bing.com/search?q=hello"
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--max-text <n>` | 8000 | Max characters of page text |
| `--no-links` | false | Skip link extraction |
| `--selector <css>` | — | CSS selector for targeted extraction |
| `--screenshot` | false | Take full-page screenshot |
| `--wait <ms>` | 0 | Extra wait after page load |
| `--text` | false | Output plain text (no JSON) |

## Output Format

```json
{
  "url": "https://example.com/",
  "title": "Example Domain",
  "textLength": 559,
  "text": "Example Domain\n\nThis domain is for use...",
  "linksCount": 2,
  "links": [
    { "url": "https://iana.org/domains/example", "text": "Learn more" }
  ]
}
```

## Roadmap

- [x] **`web_browse`** — browse URLs, search engines, extract text + links
- [x] **`playwright_run`** — execute arbitrary Playwright scripts (the POWER tool)
- [ ] **Crawl mode** — follow links to a configurable depth, collect structured data
- [ ] **Form interaction** — fill inputs, click buttons, submit forms
- [ ] **Structured extraction** — define extraction schemas (JSON schema → page data)
- [ ] **Session persistence** — reuse browser context across multiple calls (cookies, localStorage)
- [ ] **Proxy support** — route traffic through HTTP/SOCKS proxies
- [ ] **Authentication** — login flows, cookie jar management
- [ ] **Performance** — browser pool, request queuing, parallel pages
- [ ] **Anti-detection** — stealth plugins, fingerprint randomization

## Requirements

- **Node.js** >= 18
- **pnpm** or **npm**
- **DeepSeek Harness** (any version)
- ~100MB disk space for Chromium

## License

MIT