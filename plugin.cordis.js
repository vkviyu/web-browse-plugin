/**
 * web-browse-plugin Cordis Plugin for DeepSeek Harness.
 *
 * Paste this code into a dynamic Plugin to register both `web_browse` and
 * `playwright_run` tools. The plugin runs the scripts via ctx.shell.
 *
 * UPDATE the SCRIPT_DIR constant below to match your install path.
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION — update this to match your installation
// ═══════════════════════════════════════════════════════════════

const SCRIPT_DIR = '/path/to/web-browse-plugin'

// ═══════════════════════════════════════════════════════════════

return {
  apply(ctx) {
    const shell = ctx.get('shell')
    if (shell === undefined) return

    // ── web_browse tool ──────────────────────────────────────────

    harness.registerTool(ctx, harness.defineTool({
      name: 'web_browse',
      description: [
        'Browse the web using a headless Chromium browser.',
        'Opens a URL and returns the page title, text content, and all links.',
        'Use search engine URLs like https://www.bing.com/search?q=keyword to search.',
      ].join(' '),
      parameters: {
        url: { type: 'string', required: true, description: 'The URL to browse.' },
        extractLinks: { type: 'boolean', description: 'Extract and return links. Defaults to true.' },
        maxTextLength: { type: 'number', description: 'Max chars of page text. Defaults to 8000.' },
        selector: { type: 'string', description: 'CSS selector to extract only matching element text.' },
        screenshot: { type: 'boolean', description: 'Take a full-page screenshot. Returns the file path.' },
        waitMs: { type: 'number', description: 'Extra wait time in ms after page load.' },
      },
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
        },
      },
      async execute(args) {
        let cmd = `node ${SCRIPT_DIR}/web-browse.mjs ${JSON.stringify(args.url)}`
        if (args.extractLinks === false) cmd += ' --no-links'
        if (args.maxTextLength !== undefined) cmd += ` --max-text ${args.maxTextLength}`
        if (args.selector) cmd += ` --selector ${JSON.stringify(args.selector)}`
        if (args.screenshot) cmd += ' --screenshot'
        if (args.waitMs !== undefined) cmd += ` --wait ${args.waitMs}`
        return runCmd(shell, cmd, SCRIPT_DIR)
      },
    }))

    // ── playwright_run tool ───────────────────────────────────────

    harness.registerTool(ctx, harness.defineTool({
      name: 'playwright_run',
      description: [
        'Execute arbitrary Playwright browser automation code.',
        'The script receives chromium, firefox, webkit, launch(bt, opts), and findChrome().',
        'Use launch(chromium, { headless: true }) to get a browser.',
        'The script body is wrapped in an async function — use await freely.',
        'Return a JSON-serializable value.',
        'This is the POWER tool: write real JavaScript to drive a headless browser —',
        'loops, conditions, multi-page scraping, form filling, all in ONE call.',
      ].join(' '),
      parameters: {
        script: { type: 'string', required: true, description: 'The Playwright script. Use launch(chromium, { headless: true }) to start a browser. Available: chromium, firefox, webkit, launch(bt, opts), findChrome().' },
        timeoutMs: { type: 'number', description: 'Script timeout in ms. Defaults to 60000.' },
      },
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
        },
      },
      async execute(args) {
        // Use base64 to safely pass the script through the shell
        const encoded = btoa(args.script)
        const timeout = args.timeoutMs ?? 60000
        const cmd = `node ${SCRIPT_DIR}/playwright-run.mjs -b ${JSON.stringify(encoded)}`
        return runCmd(shell, cmd, SCRIPT_DIR, timeout + 5000)
      },
    }))
  },
}

// ── Helper ────────────────────────────────────────────────────

async function runCmd(shell, cmd, workdir, timeoutMs) {
  try {
    const t = timeoutMs ?? 65000
    const spec = shell.resolve({ command: cmd, workdir, timeoutMs: t })
    const result = await shell.run(spec)
    const out = (result.stdout?.text ?? '').trim()
    const err = (result.stderr?.text ?? '').trim()
    if (result.exitCode !== 0) {
      return `ERROR: exit ${result.exitCode}\n${(err || out || '(no output)').slice(0, 3000)}`
    }
    return out || '(empty output)'
  } catch (error) {
    return `ERROR: ${error?.message ?? String(error)}`
  }
}