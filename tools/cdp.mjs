/* cdp.mjs — a tiny Chrome DevTools Protocol client, no dependencies.
   Used by tools/shot.mjs and tools/browser-test.mjs.

   Why not puppeteer: the whole point of this repo is "no build step, no
   dependencies". A 120-line CDP client keeps that promise and still lets the
   tests drive a real browser. */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ width = 1280, height = 800, dpr = 1 } = {}) {
  const exe = CHROME_CANDIDATES.find(p => existsSync(p));
  if (!exe) throw new Error('No Chrome found. Set CHROME_PATH.');

  const profile = mkdtempSync(join(tmpdir(), 'hooked-chrome-'));
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars',
    '--mute-audio',
    'about:blank',
  ];

  const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  // the port is printed on stderr as "DevTools listening on ws://..."
  const wsUrl = await new Promise((ok, fail) => {
    let buf = '';
    const t = setTimeout(() => fail(new Error('Chrome did not start in 20s')), 20000);
    const onData = d => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(t); ok(m[1]); }
    };
    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
    proc.on('exit', c => { clearTimeout(t); fail(new Error('Chrome exited: ' + c)); });
  });

  const base = wsUrl.replace(/^ws:\/\//, 'http://').replace(/\/devtools\/browser\/.*$/, '');
  const targets = await (await fetch(base + '/json/list')).json();
  const page = targets.find(t => t.type === 'page');
  const client = await connect(page.webSocketDebuggerUrl);

  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Log.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile: false,
  });

  const errors = [];
  client.on('Runtime.exceptionThrown', e => {
    const d = e.exceptionDetails;
    errors.push((d.exception?.description || d.text || 'exception') +
      (d.url ? `\n  at ${d.url}:${d.lineNumber + 1}` : ''));
  });
  client.on('Runtime.consoleAPICalled', e => {
    if (e.type === 'error') {
      errors.push('console.error: ' + e.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    }
  });
  client.on('Log.entryAdded', e => {
    if (e.entry.level === 'error') errors.push('log: ' + e.entry.text + ' ' + (e.entry.url || ''));
  });

  const close = async () => {
    try { await client.send('Browser.close'); } catch { /* already gone */ }
    await sleep(120);
    try { proc.kill(); } catch { /* already gone */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows lock */ }
  };

  return { client, close, errors, base, proc };
}

/* minimal websocket JSON-RPC with promise-per-id */
async function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', e => fail(new Error('ws error: ' + e.message)), { once: true });
  });

  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message + ' ' + (msg.error.data || '')));
      else resolve(msg.result);
    } else if (msg.method) {
      const hs = listeners.get(msg.method);
      if (hs) for (const h of hs) h(msg.params);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  return {
    send,
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
    },
    ws,
    close() { try { ws.close(); } catch { /* noop */ } },
  };
}

export { sleep };
