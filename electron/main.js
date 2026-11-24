/*
 * TNSI Compass desktop shell.
 *
 * The renderer is the same console that runs on GitHub Pages, bundled by Vite
 * into dist/. Electron serves that folder over a private app:// scheme instead
 * of file:// so fetch(), the manifest and localStorage behave like a normal web
 * origin.
 *
 * The main process also runs the placement agent: the local store (check-ins,
 * activity, device identity) and the embedded desk browser that enforces the
 * browsing policy. The renderer talks to it through the preload bridge.
 *
 *   dev   ELECTRON_START_URL=http://localhost:5173 electron .
 *   prod  electron .            (loads dist/ through app://bundle/)
 */

const { app, BrowserWindow, Menu, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgentStore } = require('./store');
const { DeskBrowser } = require('./desk-browser');

const APP_ID = 'com.tnsintl.compass';
const APP_ORIGIN = 'app://bundle';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.ELECTRON_START_URL || '';
const SMOKE_TEST = process.env.ELECTRON_SMOKE_TEST === '1';
const HOME_URL = 'https://www.linkedin.com/jobs/';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

let store = null;
let deskBrowser = null;

if (SMOKE_TEST) {
  const dir = path.join(os.tmpdir(), 'tnsi-agent-smoke');
  app.setPath('userData', dir);
  try { fsSync.rmSync(path.join(dir, 'agent-store.json'), { force: true }); } catch { /* ignore */ }
} else if (process.env.ELECTRON_USER_DATA_DIR) {
  app.setPath('userData', process.env.ELECTRON_USER_DATA_DIR);
}

/* Must run before the app is ready. */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

/* Serve dist/ from app://bundle/ with real MIME types (module scripts need them). */
function serveBundle() {
  protocol.handle('app', async (request) => {
    try {
      const { hostname, pathname } = new URL(request.url);
      if (hostname !== 'bundle') return new Response('Not found', { status: 404 });

      const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
      const filePath = path.normalize(path.join(DIST_DIR, relative));
      if (!filePath.startsWith(DIST_DIR + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }

      const body = await fs.readFile(filePath);
      const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return new Response(body, { status: 200, headers: { 'content-type': type } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function send(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function registerAgentIpc() {
  ipcMain.handle('agent:bootstrap', () => {
    const data = store.bootstrap();
    deskBrowser?.setPolicy(store.policy);
    return data;
  });

  ipcMain.handle('agent:identify', (_event, user) => {
    const device = store.identify(user);
    send('agent:changed', null);
    return device;
  });

  ipcMain.handle('agent:clock-in', () => {
    const shift = store.clockIn();
    send('agent:changed', null);
    return shift;
  });

  ipcMain.handle('agent:clock-out', () => {
    const shift = store.clockOut();
    send('agent:changed', null);
    return shift;
  });

  ipcMain.handle('agent:break-start', () => {
    const brk = store.startBreak();
    send('agent:changed', null);
    return brk;
  });

  ipcMain.handle('agent:break-end', () => {
    const brk = store.endBreak();
    send('agent:changed', null);
    return brk;
  });

  ipcMain.handle('agent:log', (_event, entry) => {
    const saved = store.log(entry || {});
    send('agent:changed', saved);
    return saved;
  });

  ipcMain.handle('agent:set-policy', (_event, policy) => {
    const saved = store.setPolicy(policy);
    deskBrowser?.setPolicy(saved);
    send('agent:changed', null);
    return saved;
  });

  ipcMain.handle('agent:set-device-status', (_event, status) => {
    const device = store.setDeviceStatus(status);
    send('agent:changed', null);
    return device;
  });

  ipcMain.handle('agent:open-external', (_event, url) => {
    if (/^https?:\/\//i.test(String(url || ''))) return shell.openExternal(String(url));
    return null;
  });

  ipcMain.handle('agent:browser-open', (_event, url) => {
    deskBrowser?.open(url);
  });
  ipcMain.handle('agent:browser-close', () => {
    deskBrowser?.setVisible(false);
  });
  ipcMain.handle('agent:browser-navigate', (_event, url) => {
    deskBrowser?.navigate(url);
  });
  ipcMain.handle('agent:browser-action', (_event, name) => {
    if (!deskBrowser) return;
    if (name === 'back') deskBrowser.back();
    else if (name === 'forward') deskBrowser.forward();
    else if (name === 'reload') deskBrowser.reload();
    else if (name === 'stop') deskBrowser.stop();
    else if (name === 'home') deskBrowser.navigate(HOME_URL);
  });
  ipcMain.handle('agent:browser-state', () => (deskBrowser ? deskBrowser.currentState() : null));
  ipcMain.on('agent:browser-visible', (_event, visible) => deskBrowser?.setVisible(Boolean(visible)));
  ipcMain.on('agent:browser-bounds', (_event, rect) => deskBrowser?.setBounds(rect));
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ])
  );
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f2f6fa',
    title: 'TNSI Compass',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  /* Anything that is not part of the app opens in the user's browser. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    const current = new URL(win.webContents.getURL());
    if (target.origin === current.origin) return;
    event.preventDefault();
    if (isExternal(url)) shell.openExternal(url);
  });

  deskBrowser = new DeskBrowser(win, store, send);
  win.on('closed', () => {
    deskBrowser?.destroy();
    deskBrowser = null;
  });

  if (SMOKE_TEST) {
    const bail = setTimeout(() => {
      console.error('[smoke] timed out');
      app.exit(1);
    }, 30000);
    win.webContents.once('did-fail-load', (_event, code, description, url) => {
      clearTimeout(bail);
      console.error(`[smoke] failed to load ${url}: ${code} ${description}`);
      app.exit(1);
    });
    win.webContents.once('did-finish-load', async () => {
      try {
        const probe = await win.webContents.executeJavaScript(`(async () => {
          const started = Date.now();
          const root = document.getElementById('root');
          while ((!root || root.childElementCount === 0) && Date.now() - started < 8000) {
            await new Promise((r) => setTimeout(r, 100));
          }
          let storage = false;
          try { localStorage.setItem('__smoke', '1'); localStorage.removeItem('__smoke'); storage = true; } catch {}
          let snapshot = false;
          try { snapshot = (await fetch('./demo-data.json')).ok; } catch {}
          let agent = { ok: false };
          try {
            if (window.agent && window.agent.isElectron) {
              const boot = await window.agent.bootstrap();
              const shift = await window.agent.clockIn();
              const brk = await window.agent.startBreak();
              const brkEnd = await window.agent.endBreak();
              if (shift && shift.clockIn) await window.agent.clockOut();
              await window.agent.browser.open('about:blank');
              await new Promise((r) => setTimeout(r, 250));
              await window.agent.browser.close();
              agent = {
                ok: Boolean(boot.device && boot.device.id && brk && brk.start && brkEnd && brkEnd.end),
                device: boot.device.id,
                status: boot.device.status,
                events: boot.events.length,
                break: Boolean(brk && brk.start && brkEnd && brkEnd.end),
              };
            }
          } catch (error) {
            agent = { ok: false, error: String(error && error.message || error) };
          }
          return {
            mounted: !!root && root.childElementCount > 0,
            title: document.title,
            protocol: location.protocol,
            demo: !!window.__TNSI_DEMO__,
            storage,
            snapshot,
            agent,
            nodes: root ? root.childElementCount : 0,
          };
        })()`);
        const ok = probe.mounted && probe.demo && probe.storage && probe.snapshot && probe.agent.ok;
        clearTimeout(bail);
        console.log('[smoke] ' + JSON.stringify(probe));
        app.exit(ok ? 0 : 1);
      } catch (error) {
        clearTimeout(bail);
        console.error('[smoke] probe error', error);
        app.exit(1);
      }
    });
  } else {
    win.once('ready-to-show', () => win.show());
  }

  if (DEV_URL) {
    win.loadURL(DEV_URL);
    if (!SMOKE_TEST) win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadURL(`${APP_ORIGIN}/index.html`);
  }

  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.setName('TNSI Compass');
  app.setAppUserModelId(APP_ID);

  app.whenReady().then(() => {
    store = new AgentStore();
    registerAgentIpc();
    serveBundle();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
