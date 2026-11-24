import React from 'react';
import { Ban, Globe, Monitor, MousePointerClick, Radio } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../ctx';
import { Avatar, Card, Empty, Spinner, relTime } from '../ui';

const COPY: Record<string, { text: string; icon: React.ElementType; tone: string }> = {
  session_started: { text: 'started a work session', icon: Radio, tone: 'purple' },
  session_ended: { text: 'ended their work session', icon: Radio, tone: 'slate' },
  app_focused: { text: 'switched application', icon: Monitor, tone: 'sky' },
  app_opened: { text: 'opened an application', icon: Monitor, tone: 'sky' },
  browser_navigation: { text: 'navigated to', icon: Globe, tone: 'green' },
  tab_created: { text: 'opened a browser tab', icon: Globe, tone: 'green' },
  tab_closed: { text: 'closed a browser tab', icon: Globe, tone: 'slate' },
  block_attempt: { text: 'was blocked from', icon: Ban, tone: 'red' },
  idle: { text: 'went idle', icon: MousePointerClick, tone: 'amber' },
  active: { text: 'resumed activity', icon: MousePointerClick, tone: 'green' },
};

export default function Live() {
  const { tick } = useApp();
  const [data, setData] = React.useState<{ events: any[]; blocked: any[] } | null>(null);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    api<{ events: any[]; blocked: any[] }>('/api/live?since=' + (Date.now() - 6 * 3600_000)).then(setData);
  }, [tick]);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live desk</h1>
          <p className="muted">Sessions, job-board visits and policy blocks stream in from every consultant device.</p>
        </div>
        <span className="pill pill-ok"><i className="dot pulse" /> streaming</span>
      </div>

      <div className="grid-2-1">
        <Card title="Event stream" subtitle="Last 6 hours · approved job boards, documents and desk tools">
          {!data && <div className="page-loading"><Spinner /></div>}
          {data && data.events.length === 0 && <Empty>Nothing yet. Start a session from the desktop agent to see the desk come alive.</Empty>}
          <ul className="feed">
            {(data?.events || []).map((e) => {
              const c = COPY[e.type] || { text: e.type, icon: Radio, tone: 'slate' };
              const Icon = c.icon;
              const detail = e.meta?.app || e.meta?.domain || e.meta?.device || e.meta?.url || '';
              return (
                <li key={e.id}>
                  <span className={`feed-ico ${c.tone}`}><Icon size={14} /></span>
                  <div className="feed-main">
                    <div className="feed-line">
                      <Avatar name={e.name} color={e.color} size={22} />
                      <strong>{e.name}</strong>
                      <span className="muted">{c.text}</span>
                      {detail && <span className="feed-detail">{detail}</span>}
                    </div>
                    <small className="muted">{relTime(e.ts)} · {e.source} · recorded</small>
                  </div>
                  <time className="num muted">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="stack">
          <Card title="Blocked attempts" subtitle="Stopped by the on-device policy engine" action={<Ban size={15} className="muted" />}>
            {!data && <Spinner />}
            {data && data.blocked.length === 0 && (
              <Empty>No blocked attempts in the last 24 hours.</Empty>
            )}
            <ul className="feed">
              {(data?.blocked || []).map((b) => (
                <li key={b.id}>
                  <span className="feed-ico red"><Ban size={14} /></span>
                  <div className="feed-main">
                    <div className="feed-line">
                      <strong>{b.domain}</strong>
                      <span className="pill pill-danger tiny">blocked</span>
                    </div>
                    <small className="muted">{b.name} · {relTime(b.ts)}</small>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="How this works" subtitle="For the demo narration">
            <ol className="steps">
              <li><b>Capture</b><span>Agent samples the foreground app, job-board domain and idle state every few seconds.</span></li>
              <li><b>Queue</b><span>Events are written to a local outbox first, then batched to the API.</span></li>
              <li><b>Verify</b><span>Server checks the device, sequence and event IDs, then stores append-only.</span></li>
              <li><b>Publish</b><span>This console receives a push and refreshes — applications update the desk instantly.</span></li>
            </ol>
            <p className="fineprint">Checked {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          </Card>
        </div>
      </div>
    </>
  );
}