import React from 'react';
import {
  ArrowLeft, ArrowRight, Ban, ExternalLink, Globe2, Home, Plus, RotateCw, ShieldCheck, X,
} from 'lucide-react';
import {
  agentClient, isDesktop, syncPolicyFromApi, useAgent,
  type BlockedInfo, type BrowserState, type BrowserTab,
} from '../agent';
import { Empty } from '../ui';

const DOWNLOAD_URL = 'https://github.com/sushantadhkr/tnsintl-tracker/releases/latest';

function normalize(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function tabLabel(tab: BrowserTab) {
  if (tab.title) return tab.title;
  if (!tab.url || tab.url === 'about:blank') return 'New tab';
  try {
    return new URL(tab.url).hostname.replace(/^www\./, '');
  } catch {
    return tab.url;
  }
}

export default function DeskBrowser({ initialUrl, onClose }: { initialUrl: string; onClose: () => void }) {
  const { data } = useAgent();
  const policy = data?.policy ?? null;
  const holder = React.useRef<HTMLDivElement>(null);
  const addressRef = React.useRef<HTMLInputElement>(null);
  const addressKey = React.useRef('');
  const focusNewTab = React.useRef(false);
  const [state, setState] = React.useState<BrowserState | null>(null);
  const [address, setAddress] = React.useState(initialUrl);
  const [blocked, setBlocked] = React.useState<BlockedInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const syncBounds = React.useCallback(() => {
    const element = holder.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    agentClient.browser.bounds({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, []);

  React.useEffect(() => {
    if (!isDesktop) return;
    let alive = true;

    const offState = agentClient.browser.onState((next) => {
      setState(next);
      const active = next.tabs?.find((tab) => tab.active);
      const key = `${active?.id || ''}|${active?.url || ''}`;
      /* Only rewrite the address when the active tab or its URL changes, so a
       * background tab's title/loading event cannot clobber what is being typed. */
      if (addressKey.current !== key) {
        addressKey.current = key;
        const url = active?.url || '';
        setAddress(url && url !== 'about:blank' ? url : '');
      }
      if (focusNewTab.current && active && (!active.url || active.url === 'about:blank')) {
        focusNewTab.current = false;
        requestAnimationFrame(() => addressRef.current?.focus());
      }
    });
    const offBlocked = agentClient.browser.onBlocked((info) => {
      setBlocked(info);
      setError(null);
    });

    (async () => {
      try {
        await syncPolicyFromApi();
      } catch { /* the policy may already be synced by the app shell */ }
      if (!alive) return;
      await agentClient.browser.open(initialUrl);
    })().catch((err) => setError(String(err?.message || err)));

    return () => {
      alive = false;
      offState();
      offBlocked();
      agentClient.browser.close();
    };
  }, [initialUrl]);

  React.useEffect(() => {
    if (!isDesktop) return;
    syncBounds();
    const observer = new ResizeObserver(syncBounds);
    if (holder.current) observer.observe(holder.current);
    window.addEventListener('resize', syncBounds);
    window.addEventListener('scroll', syncBounds, true);
    const timer = setInterval(syncBounds, 500);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncBounds);
      window.removeEventListener('scroll', syncBounds, true);
      clearInterval(timer);
    };
  }, [syncBounds]);

  React.useEffect(() => {
    syncBounds();
  }, [blocked, error, state?.tabs.length, syncBounds]);

  const openTab = (url?: string) => {
    if (!isDesktop) return;
    setBlocked(null);
    setError(null);
    if (!url) focusNewTab.current = true;
    agentClient.browser.newTab(url);
  };

  const closeTab = (id: string) => {
    if (!isDesktop) return;
    setBlocked(null);
    agentClient.browser.closeTab(id);
  };

  const selectTab = (id: string) => {
    if (!isDesktop) return;
    setBlocked(null);
    agentClient.browser.selectTab(id);
  };

  /* Windows/Linux have no native menu, so tab shortcuts live in the renderer.
   * macOS gets them from the application menu (Cmd+T / Cmd+W / Ctrl+Tab). */
  React.useEffect(() => {
    if (!isDesktop || /Mac|iPhone|iPad/i.test(navigator.platform || '')) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 't' && !event.shiftKey) {
        event.preventDefault();
        openTab();
      } else if (key === 'w' && !event.shiftKey) {
        event.preventDefault();
        const active = state?.tabs?.find((tab) => tab.active);
        if (active) closeTab(active.id);
      } else if (key === 'tab') {
        const tabs = state?.tabs || [];
        if (tabs.length < 2) return;
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.active);
        const next = tabs[(index + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length];
        if (next) selectTab(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  const go = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isDesktop) return;
    setBlocked(null);
    agentClient.browser.navigate(normalize(address, initialUrl));
  };

  const openInBrowser = () => {
    if (state?.url) agentClient.openExternal(state.url);
  };

  const goTo = (domain: string) => {
    if (!isDesktop) return;
    setBlocked(null);
    setAddress(`https://${domain}`);
    agentClient.browser.navigate(`https://${domain}`);
  };

  const boards = policy?.allow?.slice(0, 12) || [];
  const tabs = state?.tabs || [];
  const activeTab = tabs.find((tab) => tab.active) || null;
  const newTabOpen = !activeTab || !activeTab.url || activeTab.url === 'about:blank';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Desk browser</h1>
          <p className="muted">
            Only approved job boards, ATS portals and desk tools open here. Every request is filtered on this device.
          </p>
        </div>
        <div className="row gap8">
          {policy && (
            <span className={`pill ${policy.mode === 'allowlist' ? 'pill-ok' : 'pill-warn'}`}>
              <ShieldCheck size={12} /> {policy.mode}
            </span>
          )}
          <span className="pill pill-muted">{policy?.allow.length ?? 0} approved</span>
        </div>
      </div>

      <div className="desk-browser">
        <div className="browser-tabs" role="tablist" aria-label="Browser tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`browser-tab ${tab.active ? 'active' : ''}`}
              role="tab"
              aria-selected={tab.active}
              tabIndex={0}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectTab(tab.id);
                }
              }}
              title={tab.url || 'New tab'}
            >
              {tab.loading ? <span className="spinner" /> : <Globe2 size={11} className="browser-tab-icon" />}
              <span className="browser-tab-title">{tabLabel(tab)}</span>
              <button
                className="browser-tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                title="Close tab"
                aria-label={`Close ${tabLabel(tab)}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {!isDesktop && (
            <div className="browser-tab active" role="tab" aria-selected="true">
              <Globe2 size={11} className="browser-tab-icon" />
              <span className="browser-tab-title">Desk browser</span>
            </div>
          )}
          {isDesktop && (
            <button className="browser-tab-new" onClick={() => openTab()} title="New tab" aria-label="New tab">
              <Plus size={14} />
            </button>
          )}
        </div>

        <div className="browser-bar">
          <button className="icon-btn" onClick={() => agentClient.browser.action('back')} disabled={!state?.canGoBack} title="Back">
            <ArrowLeft size={15} />
          </button>
          <button className="icon-btn" onClick={() => agentClient.browser.action('forward')} disabled={!state?.canGoForward} title="Forward">
            <ArrowRight size={15} />
          </button>
          <button className="icon-btn" onClick={() => agentClient.browser.action('reload')} title="Reload">
            <RotateCw size={14} />
          </button>
          <button className="icon-btn" onClick={() => agentClient.browser.action('home')} title="Home">
            <Home size={14} />
          </button>

          <form className="addr" onSubmit={go}>
            <Globe2 size={13} />
            <input
              ref={addressRef}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              spellCheck={false}
              aria-label="Address"
              placeholder="linkedin.com/jobs"
            />
            {state?.loading && <span className="spinner" />}
          </form>

          {isDesktop && (
            <button className="icon-btn" onClick={() => openTab()} title="New tab">
              <Plus size={16} />
            </button>
          )}
          <button className="icon-btn" onClick={openInBrowser} title="Open in your default browser">
            <ExternalLink size={15} />
          </button>
          <button className="icon-btn" onClick={onClose} title="Close desk browser">
            <X size={15} />
          </button>
        </div>

        {blocked && (
          <div className="browser-banner">
            <Ban size={14} />
            <strong>{blocked.domain || 'This page'}</strong>
            <span>blocked by the browsing policy ({String(blocked.reason).replace(/-/g, ' ')})</span>
            <button className="icon-btn" onClick={() => setBlocked(null)} aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        )}

        {error && (
          <div className="browser-banner">
            <Ban size={14} /> <span>{error}</span>
            <button className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        )}

        <div className="browser-frame" ref={holder}>
          {!isDesktop && (
            <Empty>
              The desk browser runs inside the desktop app.{' '}
              <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer">Download the installer</a> to use it.
            </Empty>
          )}
          {isDesktop && newTabOpen && (
            <div className="browser-newtab">
              <span className="browser-newtab-mark"><Globe2 size={20} /></span>
              <h3>New tab</h3>
              <p className="muted">Type an approved address above, or open one of the desk's job boards.</p>
              <div className="board-chips">
                {boards.slice(0, 10).map((domain) => (
                  <button className="board-chip" key={domain} onClick={() => goTo(domain)}>
                    {domain}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="browser-boards">
          {boards.map((domain) => (
            <button className="board-chip" key={domain} onClick={() => goTo(domain)}>
              {domain}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
