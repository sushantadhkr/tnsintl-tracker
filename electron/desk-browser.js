/*
 * Embedded desk browser.
 *
 * A WebContentsView pinned over a placeholder rectangle in the renderer. All
 * requests run through a dedicated session whose request filter enforces the
 * browsing policy (allowlist / blocklist) before anything leaves the machine.
 */

const { WebContentsView, session } = require('electron');
const { normalizeDomain, blockReason, isUrlAllowed } = require('./policy');

const PARTITION = 'persist:tnsintl-desk';

class DeskBrowser {
  constructor(win, store, send) {
    this.win = win;
    this.store = store;
    this.send = send;
    this.view = null;
    this.visible = false;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this.policy = store.policy;
    this.lastNavigation = { url: '', ts: 0 };
    this.lastBlock = { url: '', ts: 0 };
    this.setupSession();
  }

  get session() {
    return session.fromPartition(PARTITION);
  }

  setupSession() {
    const s = this.session;
    s.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    s.setPermissionCheckHandler(() => false);
    s.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      const reason = blockReason(details.url, this.policy);
      if (!reason) return callback({});

      const navigation = details.resourceType === 'mainFrame';
      // Blocked domains are refused everywhere. The allowlist governs where the
      // employee can navigate; sub-resources needed to render an approved page
      // (fonts, scripts, media on third-party CDNs) are left to load.
      if (reason === 'blocked-domain' || navigation) {
        if (navigation) this.reportBlocked(details.url);
        return callback({ cancel: true });
      }
      callback({});
    });
    s.on('will-download', (event, item) => {
      event.preventDefault();
      this.send('agent:browser-blocked', {
        domain: normalizeDomain(item.getURL()),
        url: item.getURL(),
        reason: 'downloads-disabled',
        ts: Date.now(),
      });
    });
  }

  setPolicy(policy) {
    this.policy = policy;
  }

  ensure() {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view;

    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
        webSecurity: true,
      },
    });
    view.setBackgroundColor('#ffffff');
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    this.view = view;

    const contents = view.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      if (isUrlAllowed(url, this.policy)) this.navigate(url);
      else this.reportBlocked(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (isUrlAllowed(url, this.policy)) return;
      event.preventDefault();
      this.reportBlocked(url);
    });
    contents.on('did-navigate', (_event, url) => this.onNavigate(url));
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) this.onNavigate(url);
    });
    contents.on('did-start-loading', () => this.emitState({ loading: true }));
    contents.on('did-stop-loading', () => this.emitState({ loading: false }));
    contents.on('page-title-updated', () => this.emitState());
    contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
      /* -3 is an aborted load (a redirect or a stop), not a visit. */
      if (code === -3 || !isMainFrame) return;
      this.onNavigate(url);
    });
    contents.on('render-process-gone', () => this.emitState());

    return view;
  }

  currentState(extra = {}) {
    const contents = this.view?.webContents;
    if (!contents || contents.isDestroyed()) {
      return { url: '', title: '', loading: false, canGoBack: false, canGoForward: false, visible: false, ...extra };
    }
    const history = contents.navigationHistory;
    return {
      url: contents.getURL(),
      title: contents.getTitle(),
      loading: contents.isLoading(),
      canGoBack: history ? history.canGoBack() : contents.canGoBack(),
      canGoForward: history ? history.canGoForward() : contents.canGoForward(),
      visible: this.visible,
      ...extra,
    };
  }

  emitState(extra) {
    this.send('agent:browser-state', this.currentState(extra));
  }

  open(url) {
    const view = this.ensure();
    this.visible = true;
    view.setVisible(true);
    if (url) this.navigate(url);
    else this.emitState();
  }

  navigate(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!url) return;
    if (!isUrlAllowed(url, this.policy)) {
      this.reportBlocked(url);
      return;
    }
    const view = this.ensure();
    view.webContents.loadURL(url).catch(() => {
      /* did-fail-load reports it; nothing else to do */
    });
  }

  back() {
    const contents = this.view?.webContents;
    if (contents && !contents.isDestroyed() && contents.navigationHistory?.canGoBack()) contents.navigationHistory.goBack();
  }

  forward() {
    const contents = this.view?.webContents;
    if (contents && !contents.isDestroyed() && contents.navigationHistory?.canGoForward()) contents.navigationHistory.goForward();
  }

  reload() {
    const contents = this.view?.webContents;
    if (contents && !contents.isDestroyed()) contents.reload();
  }

  stop() {
    const contents = this.view?.webContents;
    if (contents && !contents.isDestroyed()) contents.stop();
  }

  setBounds(rect) {
    const width = Math.max(0, Math.round(rect?.width || 0));
    const height = Math.max(0, Math.round(rect?.height || 0));
    this.bounds = {
      x: Math.max(0, Math.round(rect?.x || 0)),
      y: Math.max(0, Math.round(rect?.y || 0)),
      width,
      height,
    };
    if (!this.view || this.view.webContents.isDestroyed()) return;
    this.view.setBounds(this.bounds);
    this.view.setVisible(this.visible && width > 8 && height > 8);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (!this.view || this.view.webContents.isDestroyed()) {
      if (this.visible) this.ensure();
      return;
    }
    this.view.setVisible(this.visible && this.bounds.width > 8 && this.bounds.height > 8);
    if (!this.visible) this.emitState({ visible: false });
  }

  onNavigate(url) {
    this.emitState();
    if (!/^https?:/i.test(url)) return;
    const now = Date.now();
    if (this.lastNavigation.url === url && now - this.lastNavigation.ts < 3000) return;
    this.lastNavigation = { url, ts: now };
    const domain = normalizeDomain(url);
    const event = this.store.log({ type: 'browser_navigation', domain, url });
    this.send('agent:changed', event);
  }

  reportBlocked(url) {
    const now = Date.now();
    if (this.lastBlock.url === url && now - this.lastBlock.ts < 2000) return;
    this.lastBlock = { url, ts: now };
    const domain = normalizeDomain(url);
    const reason = blockReason(url, this.policy) || 'blocked';
    const event = this.store.log({ type: 'block_attempt', domain, url, detail: reason });
    this.send('agent:browser-blocked', { domain, url, reason, ts: now });
    this.send('agent:changed', event);
  }

  destroy() {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.win.contentView.removeChildView(this.view);
      this.view.webContents.close();
    }
    this.view = null;
  }
}

module.exports = { DeskBrowser, PARTITION };
