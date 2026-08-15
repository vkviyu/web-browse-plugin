/**
 * web-browse-plugin Cordis Plugin for DeepSeek Harness.
 *
 * Paste this code into a dynamic Plugin to register the `web_browse` tool.
 * This is a REFERENCE — the plugin runs the web-browse.mjs script via ctx.shell.
 *
 * UPDATE the SCRIPT and WORKDIR constants below to match your install path.
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION — update these paths to match your installation
// ═══════════════════════════════════════════════════════════════

const SCRIPT = '/path/to/web-browse-plugin/web-browse.mjs'
const WORKDIR = '/path/to/web-browse-plugin'

// ═══════════════════════════════════════════════════════════════

return {
  apply(ctx) {
    const shell = ctx.get('shell')
    if (shell === undefined) return

    harness.registerTool(ctx, harness.defineTool({
      name: 'web_browse',
      description: [
        'Browse the web using a headless Chromium browser.',
        'Opens a URL and returns the page title, text content, and all links.',
        'Use search engine URLs like https://www.bing.com/search?q=keyword to search.',
      ].join(' '),
      parameters: {
        url: {
          type: 'string',
          required: true,
          description: 'The URL to browse. Use a search engine URL to search.',
        },
        extractLinks: {
          type: 'boolean',
          description: 'Extract and return links. Defaults to true.',
        },
        maxTextLength: {
          type: 'number',
          description: 'Max chars of page text. Defaults to 8000.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to extract only matching element text.',
        },
        screenshot: {
          type: 'boolean',
          description: 'Take a full-page screenshot. Returns the file path.',
        },
        waitMs: {
          type: 'number',
          description: 'Extra wait time after page load in ms.',
        },
      },
      output: {
        schema: { type: 'string' },
        render(_args, value) {
          return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
        },
      },
      async execute(args) {
        let cmd = `node ${SCRIPT} ${JSON.stringify(args.url)}`
        if (args.extractLinks === false) cmd += ' --no-links'
        if (args.maxTextLength !== undefined) cmd += ` --max-text ${args.maxTextLength}`
        if (args.selector) cmd += ` --selector ${JSON.stringify(args.selector)}`
        if (args.screenshot) cmd += ' --screenshot'
        if (args.waitMs !== undefined) cmd += ` --wait ${args.waitMs}`

        try {
          const spec = shell.resolve({ command: cmd, workdir: WORKDIR, timeoutMs: 30000 })
          const result = await shell.run(spec)
          const out = (result.stdout?.text ?? '').trim()
          const err = (result.stderr?.text ?? '').trim()
          if (result.exitCode !== 0) {
            return `ERROR: exit ${result.exitCode}\n${(err || out).slice(0, 2000)}`
          }
          return out || '(empty output)'
        } catch (error) {
          return `ERROR: ${error?.message ?? String(error)}`
        }
      },
    }))
  },
}