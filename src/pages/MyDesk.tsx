import React from 'react';
import {
  Ban, Briefcase, Clock3, Coffee, FileText, Globe2, LogIn, LogOut, MonitorSmartphone, Play, Plus, ShieldCheck, Timer,
} from 'lucide-react';
import { api, type ClientCv } from '../api';
import { useApp } from '../ctx';
import {
  agentClient, isDesktop, todayEvents, useAgent, type AgentEvent,
} from '../agent';
import CvModal from '../CvModal';
import { Card, Bar, Empty, Spinner, fmtClock, fmtHM, relTime, useNow } from '../ui';

const DOWNLOAD_URL = 'https://github.com/sushantadhkr/tnsintl-tracker/releases/latest';

const EVENT_COPY: Record<string, { text: string; tone: string; icon: React.ElementType }> = {
  session_started: { text: 'Clocked in', tone: 'purple', icon: LogIn },
  session_ended: { text: 'Clocked out', tone: 'slate', icon: LogOut },
  break_started: { text: 'Started a break', tone: 'amber', icon: Coffee },
  break_ended: { text: 'Back from break', tone: 'purple', icon: Play },
  browser_navigation: { text: 'Visited', tone: 'green', icon: Globe2 },
  application_submitted: { text: 'Filed an application', tone: 'sky', icon: Briefcase },
  block_attempt: { text: 'Blocked attempt', tone: 'red', icon: Ban },
};

function hhmmss(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function friendlyError(error: any) {
  return String(error?.message || error || 'Something went wrong')
    .replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
}

export default function MyDesk({
  onOpenBrowser, onLogApplication,
}: {
  onOpenBrowser: (url: string) => void;
  onLogApplication: (draft?: { queuedId?: string; clientId?: number; employer?: string; role?: string; board?: string }) => void;
}) {
  const { user, tick } = useApp();
  const { data, refresh } = useAgent();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [clients, setClients] = React.useState<DeskClient[]>([]);
  const [cvClient, setCvClient] = React.useState<DeskClient | null>(null);
  const now = useNow(1000);

  React.useEffect(() => {
    agentClient.identify(user).catch(() => { /* identity is best-effort */ });
  }, [user.id]);

  // Assigned clients (and their CVs) come from the same scoped endpoint the
  // pipeline uses, so a consultant can check the document before applying.
  React.useEffect(() => {
    let alive = true;
    api<{ clients: DeskClient[] }>('/api/my/clients')
      .then((mine) => { if (alive) setClients(mine.clients || []); })
      .catch(() => { if (alive) setClients([]); });
    return () => { alive = false; };
  }, [tick, user.id]);

  const shift = data?.shift ?? null;
  const open = Boolean(shift && !shift.clockOut);
  const onBreak = Boolean(data?.onBreak);
  const policy = data?.policy ?? null;
  const events = todayEvents(data);
  const blocked = events.filter((e) => e.type === 'block_attempt');
  const applications = events.filter((e) => e.type === 'application_submitted');
  const boards = Array.from(
    new Set(events.filter((e) => e.type === 'browser_navigation' && e.domain).map((e) => e.domain as string))
  );
  const workedMs = (data?.shifts || [])
    .filter((s) => s.clockIn >= new Date(now).setHours(0, 0, 0, 0))
    .reduce((sum, s) => sum + Math.max(0, (s.clockOut ?? now) - s.clockIn), 0);

  const clock = async (direction: 'in' | 'out') => {
    setBusy(true);
    setError(null);
    try {
      if (direction === 'in') await agentClient.clockIn();
      else await agentClient.clockOut();
      refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleBreak = async () => {
    setBusy(true);
    setError(null);
    try {
      if (onBreak) await agentClient.endBreak();
      else await agentClient.startBreak();
      refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const breakMs = (data?.breakSecondsToday ?? 0) * 1000;
  const shifts = data?.shifts || [];

  const homeUrl = 'https://www.linkedin.com/jobs/';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My desk</h1>
          <p className="muted">Your shift, approved job boards and today's activity — recorded on this device.</p>
        </div>
        <div className="row gap8">
          <span className={`pill ${onBreak ? 'pill-warn' : open ? 'pill-ok' : shift ? 'pill-info' : 'pill-muted'}`}>
            <i className="dot" /> {onBreak ? 'on a break' : open ? 'on the clock' : shift ? 'signed off' : 'not checked in'}
          </span>
          <button className="btn ghost sm" onClick={() => onLogApplication()}>
            <Plus size={13} /> File application
          </button>
          <span className="pill pill-muted">
            <Clock3 size={12} /> {new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>

      {!isDesktop && (
        <div className="agent-banner">
          <MonitorSmartphone size={17} />
          <div>
            <strong>Desktop agent required for the full workspace</strong>
            <p>
              Check-in works in this preview and is stored in your browser. The embedded desk browser, job-board
              enforcement and activity capture run in the installed app.
            </p>
          </div>
          <a className="btn ghost sm" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">Download</a>
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      {!data ? (
        <div className="page-loading"><Spinner /></div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-label"><Timer size={13} /> Active today</div>
              <div className="kpi-value">{fmtHM(workedMs / 1000)}</div>
              <div className="kpi-foot">
                <span>{shift ? `since ${fmtClock(shift.clockIn)}` : 'not checked in'}</span>
                {breakMs > 0 && <span className="muted">{fmtHM(breakMs / 1000)} break</span>}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label"><Globe2 size={13} /> Job boards visited</div>
              <div className="kpi-value">{boards.length}</div>
              <div className="kpi-foot"><span>{policy ? `${policy.allow.length} approved` : 'policy pending'}</span></div>
            </div>
            <div className="kpi">
              <div className="kpi-label"><Briefcase size={13} /> Applications filed</div>
              <div className="kpi-value">{applications.length}</div>
              <div className="kpi-foot"><span>from the desk browser</span></div>
            </div>
            <div className="kpi">
              <div className="kpi-label"><Ban size={13} /> Blocked attempts</div>
              <div className="kpi-value">{blocked.length}</div>
              <div className="kpi-foot"><span>stopped on this device</span></div>
            </div>
          </div>

          <div className="grid-2-1">
            <Card
              title="Shift"
              subtitle={policy ? `Desk hours ${policy.schedule.start}–${policy.schedule.end} · ${policy.schedule.graceMinutes}m grace` : 'Waiting for the desk policy'}
              action={shift?.late ? <span className="pill pill-warn">late arrival</span> : undefined}
            >
              <div className="clock-hero">
                <div className="row gap8">
                  <span className={`pill ${open ? 'pill-ok' : shift ? 'pill-info' : 'pill-muted'}`}>
                    <i className="dot" /> {open ? 'session running' : shift ? 'session closed' : 'no session yet'}
                  </span>
                  {onBreak && <span className="pill pill-warn"><Coffee size={11} /> on break</span>}
                  <span className="pill pill-muted">device {data.device.id}</span>
                </div>
                <div className="clock-time num">
                  {open && shift ? hhmmss(now - shift.clockIn) : shift?.clockOut ? fmtHM((shift.clockOut - shift.clockIn) / 1000) : '00:00:00'}
                </div>
                <div className="clock-meta">
                  {onBreak && data?.breakStartedAt
                    ? `On break since ${fmtClock(data.breakStartedAt)}. Break time today: ${fmtHM(breakMs / 1000)}.`
                    : open && shift
                      ? `Clocked in at ${fmtClock(shift.clockIn)} — the timer runs until you clock out.${breakMs > 0 ? ` Break time today: ${fmtHM(breakMs / 1000)}.` : ''}`
                      : shift?.clockOut
                        ? `Clocked out at ${fmtClock(shift.clockOut)}. ${shift.late ? 'Arrival was after the grace period.' : 'On time.'}`
                        : 'Start a session to record job-board work from this device.'}
                </div>
                <div className="clock-actions">
                  {open ? (
                    <>
                      <button className={`btn ${onBreak ? 'primary' : 'ghost'}`} disabled={busy} onClick={toggleBreak}>
                        {onBreak ? <Play size={15} /> : <Coffee size={15} />}
                        {onBreak ? 'End break' : 'Take a break'}
                      </button>
                      <button className="btn danger" disabled={busy} onClick={() => clock('out')}>
                        <LogOut size={15} /> Clock out
                      </button>
                    </>
                  ) : (
                    <button className="btn primary" disabled={busy || data.device.status === 'revoked'} onClick={() => clock('in')}>
                      <LogIn size={15} /> Clock in
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => onOpenBrowser(homeUrl)}>
                    <Globe2 size={15} /> Open desk browser
                  </button>
                </div>
              </div>
            </Card>

            <div className="stack">
              <Card title="This device" subtitle="Registered with the desk">
                <div className="device-row">
                  <span className="device-ico"><MonitorSmartphone size={16} /></span>
                  <div>
                    <strong>{data.device.name}</strong>
                    <small className="muted">{data.device.platform} · {data.device.osVersion}</small>
                  </div>
                  <span className={`pill ${data.device.status === 'active' ? 'pill-ok' : 'pill-danger'}`}>
                    <i className="dot" /> {data.device.status}
                  </span>
                </div>
                <div className="attendance-summary">
                  <div><span>Agent</span><b>{data.appVersion}</b></div>
                  <div><span>Last sync</span><b>{relTime(data.device.lastSeenAt)}</b></div>
                  <div><span>Events today</span><b>{events.length}</b></div>
                </div>
                <p className="fineprint">
                  Check-ins, approved visits and blocked attempts stay in this app. No keystrokes, screenshots,
                  passwords or page contents are captured.
                </p>
              </Card>

              <Card title="Browsing policy" subtitle="Pushed from the desk console" action={<ShieldCheck size={15} className="muted" />}>
                {policy ? (
                  <>
                    <div className="row gap8" style={{ marginBottom: 8 }}>
                      <span className={`pill ${policy.mode === 'allowlist' ? 'pill-ok' : 'pill-warn'}`}>{policy.mode}</span>
                      <span className="muted small">{policy.allow.length} allowed · {policy.block.length} blocked</span>
                    </div>
                    <p className="small muted">
                      Pages outside the approved list are stopped before they load — including redirects and
                      popups. Blocked domains are refused on every request, and downloads are disabled.
                    </p>
                  </>
                ) : (
                  <p className="muted small">Waiting for the policy to sync…</p>
                )}
              </Card>
            </div>
          </div>

          <div className="grid-2">
            <Card
              title="Approved job boards"
              subtitle="Opens in the desk browser"
              action={<span className="pill pill-muted">{policy?.allow.length ?? 0} domains</span>}
            >
              {policy && policy.allow.length > 0 ? (
                <div className="board-chips">
                  {policy.allow.slice(0, 18).map((domain) => (
                    <button className="board-chip" key={domain} onClick={() => onOpenBrowser(`https://${domain}`)}>
                      <Globe2 size={11} /> {domain}
                    </button>
                  ))}
                  {policy.allow.length > 18 && (
                    <span className="agent-muted-note">+{policy.allow.length - 18} more in the policy console</span>
                  )}
                </div>
              ) : (
                <Empty>No approved domains yet. An administrator sets these in Browsing policy.</Empty>
              )}
            </Card>

            <Card title="Recent activity" subtitle="Today, on this device">
              {events.length === 0 ? (
                <Empty>Nothing recorded yet. Clock in and open a job board to see the desk come alive.</Empty>
              ) : (
                <ul className="feed compact">
                  {events.slice(0, 10).map((event) => (
                    <ActivityRow key={event.id} event={event} />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <PipelineCard onLogApplication={onLogApplication} />

          <div className="grid-2">
            <Card
              title="Client CVs"
              subtitle="Your assigned job seekers"
              action={<span className="pill pill-muted tiny">{clients.filter((c) => c.cv).length} on file</span>}
            >
              {clients.length === 0 ? (
                <Empty>No clients are assigned to you yet.</Empty>
              ) : clients.filter((c) => c.cv).length === 0 ? (
                <Empty>No CVs on file yet. The desk uploads them with each client record.</Empty>
              ) : (
                <div className="sub-list">
                  {clients.filter((c) => c.cv).slice(0, 6).map((client) => (
                    <div className="sub-row" key={client.id}>
                      <span className="client-dot" style={{ background: `${client.color}22`, color: client.color }}>
                        <FileText size={13} />
                      </span>
                      <div className="sub-main">
                        <strong>{client.name}</strong>
                        <small className="muted">
                          {client.targetRole || 'Target role TBC'} · ATS {client.cv!.atsScore}/100 · {client.cv!.pages} pages
                        </small>
                      </div>
                      <button className="btn ghost sm" onClick={() => setCvClient(client)}>
                        <FileText size={12} /> Preview
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              title="Recent shifts"
              subtitle="Check-ins recorded on this device"
              pad={false}
              action={<span className="pill pill-muted tiny">{shifts.length} shifts</span>}
            >
              {shifts.length === 0 ? (
                <Empty>Your first check-in will appear here.</Empty>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Day</th><th>In</th><th>Out</th><th>Net</th><th>Break</th></tr>
                  </thead>
                  <tbody>
                    {shifts.slice(0, 6).map((entry) => {
                      const breakTime = (entry.breaks || []).reduce(
                        (sum, brk) => sum + Math.max(0, (brk.end ?? (entry.clockOut ?? now)) - brk.start),
                        0
                      );
                      const net = Math.max(0, (entry.clockOut ?? now) - entry.clockIn - breakTime);
                      return (
                        <tr key={entry.id}>
                          <td>
                            <strong>{new Date(entry.clockIn).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                            {entry.late && <span className="pill pill-warn tiny" style={{ marginLeft: 6 }}>late</span>}
                          </td>
                          <td className="num">{fmtClock(entry.clockIn)}</td>
                          <td className="num">{entry.clockOut ? fmtClock(entry.clockOut) : <span className="muted">open</span>}</td>
                          <td className="num">{fmtHM(net / 1000)}</td>
                          <td className="num muted">{breakTime > 0 ? fmtHM(breakTime / 1000) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card
            title="Blocked attempts"
            subtitle="Stopped by the on-device policy engine"
            action={<span className="pill pill-danger tiny">{blocked.length} today</span>}
            pad={false}
          >
            {blocked.length === 0 ? (
              <Empty>No blocked attempts today.</Empty>
            ) : (
              <table className="table roomy">
                <thead>
                  <tr><th>Domain</th><th>Reason</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {blocked.slice(0, 12).map((event) => (
                    <tr key={event.id}>
                      <td><strong>{event.domain || '—'}</strong></td>
                      <td className="muted">{String(event.detail || 'blocked').replace(/-/g, ' ')}</td>
                      <td className="num muted">{new Date(event.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {cvClient?.cv && (
        <CvModal open cv={cvClient.cv} client={cvClient} onClose={() => setCvClient(null)} />
      )}
    </>
  );
}

type DeskClient = {
  id: number;
  name: string;
  color: string;
  email: string | null;
  targetRole: string | null;
  targetMarket: string | null;
  targetCity: string | null;
  cv?: ClientCv | null;
};

function ActivityRow({ event }: { event: AgentEvent }) {
  const copy = EVENT_COPY[event.type] || { text: event.type, tone: 'slate', icon: Globe2 };
  const Icon = copy.icon;
  const detail = event.domain || event.employer || event.detail || '';
  return (
    <li>
      <span className={`feed-ico ${copy.tone}`}><Icon size={14} /></span>
      <div className="feed-main">
        <div className="feed-line">
          <strong>{copy.text}</strong>
          {detail && <span className="feed-detail">{detail}</span>}
        </div>
        <small className="muted">{relTime(event.ts)}</small>
      </div>
      <time className="num muted">{new Date(event.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
    </li>
  );
}

type QueueLead = {
  id: string;
  clientId: number;
  client: string;
  color: string;
  employer: string;
  role: string;
  board: string;
  matchScore: number | null;
  queuedAt: number;
  ageHours: number;
  slaHours: number;
  overdue: boolean;
};

type QueueClient = {
  id: number;
  name: string;
  status: string;
  weeklyQuota: number;
  weeklyApplied: number;
  slaHours: number;
};

type Pipeline = { clients: QueueClient[]; queued: QueueLead[] };

function PipelineCard({
  onLogApplication,
}: {
  onLogApplication: (draft?: { queuedId?: string; clientId?: number; employer?: string; role?: string; board?: string }) => void;
}) {
  const { tick } = useApp();
  const [data, setData] = React.useState<Pipeline | null>(null);

  React.useEffect(() => {
    let alive = true;
    api<Pipeline>('/api/my/clients')
      .then((next) => { if (alive) setData(next); })
      .catch(() => { if (alive) setData({ clients: [], queued: [] }); });
    return () => { alive = false; };
  }, [tick]);

  if (!data) {
    return <Card title="Your pipeline" subtitle="Assigned clients and leads waiting to be filed"><div className="page-loading"><Spinner /></div></Card>;
  }

  const quota = data.clients.reduce((sum, client) => sum + (client.weeklyQuota || 0), 0);
  const applied = data.clients.reduce((sum, client) => sum + (client.weeklyApplied || 0), 0);
  const overdue = data.queued.filter((lead) => lead.overdue);

  return (
    <Card
      className="pipeline-card"
      title="Your pipeline"
      subtitle="Assigned clients and leads waiting to be filed"
      action={
        overdue.length > 0
          ? <span className="pill pill-warn tiny">{overdue.length} past SLA</span>
          : <span className="pill pill-muted tiny">{data.queued.length} queued</span>
      }
    >
      <div className="pipeline-top">
        <div className="pipeline-pace">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted small">Weekly pace across {data.clients.length} client{data.clients.length === 1 ? '' : 's'}</span>
            <strong className="num small">{applied}/{quota || '—'}</strong>
          </div>
          <Bar value={Math.min(applied, quota || 1)} max={quota || 1} color="var(--green)" />
        </div>
        <button className="btn ghost sm" onClick={() => onLogApplication()}>
          <Plus size={13} /> File directly
        </button>
      </div>

      {data.queued.length === 0 ? (
        <Empty>No leads waiting. New assignments land here as soon as an admin queues them.</Empty>
      ) : (
        <div className="sub-list pipeline-list">
          {data.queued.slice(0, 8).map((lead) => (
            <div className="sub-row" key={lead.id}>
              <span className="client-dot" style={{ background: `${lead.color}22`, color: lead.color }}>
                <Briefcase size={13} />
              </span>
              <div className="sub-main">
                <strong>{lead.employer} · {lead.role}</strong>
                <small className="muted">
                  {lead.client} · {lead.board} · queued {relTime(lead.queuedAt)}
                  {lead.matchScore != null ? ` · ${lead.matchScore}% match` : ''}
                </small>
              </div>
              <span className={`pill tiny ${lead.overdue ? 'pill-danger' : 'pill-muted'}`}>
                {lead.overdue ? `${lead.ageHours}h overdue` : `${lead.ageHours}h`}
              </span>
              <button
                className="btn ghost sm"
                onClick={() => onLogApplication({
                  queuedId: lead.id,
                  clientId: lead.clientId,
                  employer: lead.employer,
                  role: lead.role,
                  board: lead.board,
                })}
              >
                File
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
