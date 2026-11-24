import React from 'react';
import {
  ArrowLeft, ArrowRight, Ban, ExternalLink, Globe2, Home, RotateCw, ShieldCheck, X,
} from 'lucide-react';
import {
  agentClient, isDesktop, syncPolicyFromApi, useAgent, type BlockedInfo, type BrowserState,
} from '../agent';
import { Empty } from '../ui';

const DOWNLOAD_URL = 'https://github.com/sushantadhkr/tnsintl-tracker/releases/latest';

function normalize(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function DeskBrowser({ initialUrl, onClose }: { initialUrl: string; onClose: () => void }) {
  const { data } = useAgent();
  const policy = data?.policy ?? null;
  const holder = React.useRef<HTMLDivElement>(null);
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
      if (next.url && next.url !== 'about:blank') setAddress(next.url);
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
  }, [blocked, error, syncBounds]);

  const go = (event: React.FormEvent) => {
    event.preventDefault();
    setBlocked(null);
    agentClient.browser.navigate(normalize(address, initialUrl));
  };

  const openInBrowser = () => {
    if (state?.url) agentClient.openExternal(state.url);
  };

  const boards = policy?.allow?.slice(0, 12) || [];

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
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              spellCheck={false}
              aria-label="Address"
              placeholder="linkedin.com/jobs"
            />
            {state?.loading && <span className="spinner" />}
          </form>

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
        </div>

        <div className="browser-boards">
          {boards.map((domain) => (
            <button
              className="board-chip"
              key={domain}
              onClick={() => {
                setBlocked(null);
                setAddress(`https://${domain}`);
                agentClient.browser.navigate(`https://${domain}`);
              }}
            >
              {domain}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
