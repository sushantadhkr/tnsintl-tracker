/*
 * Embedded desk browser.
 *
 * A set of WebContentsViews pinned over a placeholder rectangle in the
 * renderer — one view per browser tab. All requests run through a dedicated
 * session whose request filter enforces the browsing policy (allowlist /
 * blocklist) before anything leaves the machine.
 */

const { WebContentsView, session } = require('electron');
const { normalizeDomain, blockReason, isUrlAllowed } = require('./policy');

const PARTITION = 'persist:tnsintl-desk';
const BLANK_URLS = new Set(['', 'about:blank', 'about:newtab']);

function isBlankUrl(url) {
  return BLANK_URLS.has(String(url || '').trim());
}

class DeskBrowser {
  constructor(win, store, send) {
    this.win = win;
    this.store = store;
    this.send = send;
    this.tabs = [];
    this.activeId = null;
    this.tabSeq = 0;
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

  get activeTab() {
    return this.tabs.find((tab) => tab.id === this.activeId) || null;
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

  createTab(rawUrl, activate = true) {
    const id = 'tab-' + (++this.tabSeq);
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
    view.setBounds(this.bounds);
    view.setVisible(false);
    this.win.contentView.addChildView(view);

    const tab = { id, view, empty: isBlankUrl(rawUrl) };
    this.tabs.push(tab);
    if (activate) this.activeId = id;
    this.attachTab(tab);

    if (rawUrl && !tab.empty) this.navigate(rawUrl, tab);
    this.syncVisibility();
    this.emitState();
    return tab;
  }

  attachTab(tab) {
    const contents = tab.view.webContents;

    contents.setWindowOpenHandler(({ url }) => {
      /* Like a normal browser, a popup or target=_blank opens a new tab. */
      if (isUrlAllowed(url, this.policy)) this.newTab(url);
      else this.reportBlocked(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (isUrlAllowed(url, this.policy)) return;
      event.preventDefault();
      this.reportBlocked(url);
    });
    contents.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
      if (!isMainFrame) return;
      tab.empty = isBlankUrl(url);
      this.syncVisibility();
      this.emitState();
    });
    contents.on('did-navigate', (_event, url) => this.onNavigate(url, tab));
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) this.onNavigate(url, tab);
    });
    contents.on('did-start-loading', () => this.emitState());
    contents.on('did-stop-loading', () => this.emitState());
    contents.on('page-title-updated', () => this.emitState());
    contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
      /* -3 is an aborted load (a redirect or a stop), not a visit. */
      if (code === -3 || !isMainFrame) return;
      this.onNavigate(url, tab);
    });
    contents.on('render-process-gone', () => this.emitState());

    /* On Windows/Linux the app has no menu bar, so handle tab shortcuts here
     * while focus is inside the page. macOS uses the application menu instead. */
    if (process.platform !== 'darwin') {
      contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || !input.control || input.alt) return;
        const key = String(input.key || '').toLowerCase();
        if (key === 't' && !input.shift) {
          event.preventDefault();
          this.newTab();
        } else if (key === 'w' && !input.shift) {
          event.preventDefault();
          this.closeActiveTab();
        } else if (key === 'tab') {
          event.preventDefault();
          this.cycleTab(input.shift ? -1 : 1);
        }
      });
    }
  }

  tabInfo(tab) {
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) {
      return { id: tab.id, url: '', title: '', loading: false, active: tab.id === this.activeId };
    }
    return {
      id: tab.id,
      url: contents.getURL(),
      title: contents.getTitle(),
      loading: contents.isLoading(),
      active: tab.id === this.activeId,
    };
  }

  currentState(extra = {}) {
    const active = this.activeTab;
    const contents = active?.view.webContents;
    const base = {
      url: '',
      title: '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      visible: this.visible,
      tabs: this.tabs.map((tab) => this.tabInfo(tab)),
    };
    if (!contents || contents.isDestroyed()) return { ...base, ...extra };

    const history = contents.navigationHistory;
    return {
      ...base,
      url: contents.getURL(),
      title: contents.getTitle(),
      loading: contents.isLoading(),
      canGoBack: history ? history.canGoBack() : contents.canGoBack(),
      canGoForward: history ? history.canGoForward() : contents.canGoForward(),
      ...extra,
    };
  }

  emitState(extra) {
    this.send('agent:browser-state', this.currentState(extra));
  }

  ensure() {
    const active = this.activeTab;
    if (active && !active.view.webContents.isDestroyed()) return active.view;
    const alive = this.tabs.find((tab) => !tab.view.webContents.isDestroyed());
    if (alive) {
      this.activeId = alive.id;
      return alive.view;
    }
    return this.createTab(null, true).view;
  }

  open(url) {
    this.visible = true;
    this.ensure();
    if (url) this.navigate(url);
    this.syncVisibility();
    this.emitState();
  }

  newTab(rawUrl) {
    /* Never reveal the shelf on its own: a popup from a hidden tab must not
     * cover the console. open() is what makes the desk browser visible. */
    const tab = this.createTab(rawUrl || null, true);
    this.syncVisibility();
    this.emitState();
    return tab.id;
  }

  closeTab(id) {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;

    const [tab] = this.tabs.splice(index, 1);
    try {
      this.win.contentView.removeChildView(tab.view);
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    } catch { /* the view may already be gone */ }

    if (this.activeId === id) {
      const next = this.tabs[index] || this.tabs[index - 1] || null;
      this.activeId = next ? next.id : null;
    }

    /* Closing the last tab keeps the shell open on a fresh new tab. */
    if (this.tabs.length === 0) {
      this.createTab(null, true);
      return;
    }

    this.syncVisibility();
    this.emitState();
  }

  closeActiveTab() {
    if (this.activeTab) this.closeTab(this.activeTab.id);
  }

  selectTab(id) {
    if (!this.tabs.some((tab) => tab.id === id)) return;
    this.activeId = id;
    this.syncVisibility();
    this.emitState();
  }

  cycleTab(delta = 1) {
    if (this.tabs.length < 2) return;
    const index = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const next = (index + delta + this.tabs.length) % this.tabs.length;
    this.selectTab(this.tabs[next].id);
  }

  navigate(rawUrl, tab = this.activeTab) {
    const url = String(rawUrl || '').trim();
    if (!url) return;
    const target = tab && !tab.view.webContents.isDestroyed() ? tab : null;
    if (!target) return this.navigate(url, this.createTab(null, true));
    if (!isUrlAllowed(url, this.policy)) {
      this.reportBlocked(url);
      return;
    }
    target.empty = isBlankUrl(url);
    this.syncVisibility();
    target.view.webContents.loadURL(url).catch(() => {
      /* did-fail-load reports it; nothing else to do */
    });
    this.emitState();
  }

  activeContents() {
    const contents = this.activeTab?.view.webContents;
    return contents && !contents.isDestroyed() ? contents : null;
  }

  back() {
    const contents = this.activeContents();
    if (contents && contents.navigationHistory?.canGoBack()) contents.navigationHistory.goBack();
  }

  forward() {
    const contents = this.activeContents();
    if (contents && contents.navigationHistory?.canGoForward()) contents.navigationHistory.goForward();
  }

  reload() {
    const contents = this.activeContents();
    if (contents) contents.reload();
  }

  stop() {
    const contents = this.activeContents();
    if (contents) contents.stop();
  }

  applyBounds() {
    for (const tab of this.tabs) {
      if (!tab.view.webContents.isDestroyed()) tab.view.setBounds(this.bounds);
    }
  }

  syncVisibility() {
    const show = this.visible && this.bounds.width > 8 && this.bounds.height > 8;
    for (const tab of this.tabs) {
      if (tab.view.webContents.isDestroyed()) continue;
      tab.view.setVisible(show && tab.id === this.activeId && !tab.empty);
    }
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
    this.applyBounds();
    this.syncVisibility();
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (this.visible) this.ensure();
    this.syncVisibility();
    this.emitState();
  }

  onNavigate(url, tab) {
    tab.empty = isBlankUrl(url);
    this.syncVisibility();
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
    for (const tab of this.tabs) {
      try {
        this.win.contentView.removeChildView(tab.view);
        if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
      } catch { /* ignore */ }
    }
    this.tabs = [];
    this.activeId = null;
  }
}

module.exports = { DeskBrowser, PARTITION };
