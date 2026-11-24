/*
 * TNSI Compass desktop shell.
 *
 * The renderer is the same static console that runs on GitHub Pages, bundled by
 * Vite into dist/. Electron serves that folder over a private app:// scheme
 * instead of file:// so fetch(), the manifest and localStorage all behave like
 * a normal web origin.
 *
 *   dev   ELECTRON_START_URL=http://localhost:5173 electron .
 *   prod  electron .            (loads dist/ through app://bundle/)
 */

const { app, BrowserWindow, Menu, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const APP_ID = 'com.tnsintl.compass';
const APP_ORIGIN = 'app://bundle';
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.ELECTRON_START_URL || '';
const SMOKE_TEST = process.env.ELECTRON_SMOKE_TEST === '1';

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

  if (SMOKE_TEST) {
    const bail = setTimeout(() => {
      console.error('[smoke] timed out');
      app.exit(1);
    }, 20000);
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
          return {
            mounted: !!root && root.childElementCount > 0,
            title: document.title,
            protocol: location.protocol,
            demo: !!window.__TNSI_DEMO__,
            storage,
            snapshot,
            nodes: root ? root.childElementCount : 0,
          };
        })()`);
        const ok = probe.mounted && probe.demo && probe.storage && probe.snapshot;
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
