import React from 'react';
import { Briefcase, Globe, Laptop, X, MonitorSmartphone } from 'lucide-react';
import { api, type EmployeeRow } from '../api';
import { Avatar, Bar, Empty, Spinner, StatusPill, fmtDate, fmtHM, relTime } from '../ui';

type Detail = {
  employee: EmployeeRow;
  history: { date: string; inLabel: string; outLabel: string | null; late: boolean; workedSeconds: number }[];
  events: { id: string; source: string; type: string; label: string; meta: any; trust: string }[];
  week: { date: string; seconds: number }[];
  applications: { id: string; client: string; clientColor: string; employer: string; role: string; board: string; status: string; day: string; appliedAt: number | null; turnaroundHours: number | null; onTime: boolean | null }[];
  devices: any[];
};

const EVENT_COPY: Record<string, string> = {
  session_started: 'Work session started',
  session_ended: 'Work session ended',
  app_focused: 'Opened application',
  browser_navigation: 'Visited website',
  tab_created: 'New browser tab',
  tab_closed: 'Closed browser tab',
  block_attempt: 'Blocked by policy',
  idle: 'Went idle',
  active: 'Resumed activity',
};

export default function EmployeeDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [data, setData] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    setData(null);
    setError(null);
    api<Detail>(`/api/employees/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (id) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  if (!id) return null;
  const e = data?.employee;
  const maxApp = Math.max(1, ...(e?.apps || []).map((a) => a.seconds));

  return (
    <div className="drawer-scrim" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(ev) => ev.stopPropagation()}>
        <div className="drawer-head">
          <span className="muted small">Consultant record</span>
          <button className="icon-btn" onClick={onClose}><X size={17} /></button>
        </div>

        {!data && !error && <div className="drawer-loading"><Spinner /></div>}
        {error && <div className="alert error">{error}</div>}

        {e && data && (
          <div className="drawer-body">
            <div className="drawer-person">
              <Avatar name={e.name} color={e.color} size={52} />
              <div>
                <h2>{e.name}</h2>
                <p className="muted">{e.title} · {e.team}</p>
                <div className="row gap8">
                  <StatusPill status={e.status} />
                  {e.late && <span className="pill pill-warn">Late arrival</span>}
                  <span className="pill pill-muted">{e.role}</span>
                </div>
              </div>
            </div>

            <div className="mini-grid">
              <div className="mini"><span>Clocked in</span><strong>{e.clockInLabel || '—'}</strong></div>
              <div className="mini"><span>Clocked out</span><strong>{e.clockOutLabel || '—'}</strong></div>
              <div className="mini"><span>Applications today</span><strong>{e.applicationsToday}</strong></div>
              <div className="mini"><span>Interviews booked</span><strong>{e.interviewsBooked}</strong></div>
              <div className="mini"><span>Time on the clock</span><strong>{fmtHM(e.workedSeconds)}</strong></div>
              <div className="mini"><span>Active work</span><strong>{fmtHM(e.activeSeconds)}</strong></div>
            </div>

            <div className="drawer-section">
              <h4><Briefcase size={14} /> Applications filed</h4>
              {data.applications.length === 0 && <Empty>No applications filed in the last 14 days.</Empty>}
              <div className="sub-list">
                {data.applications.slice(0, 8).map((a) => (
                  <div className="sub-row" key={a.id}>
                    <div className="sub-main">
                      <strong>{a.employer} · {a.role}</strong>
                      <small className="muted">{a.client} · {a.board} · {fmtDate(a.day)}</small>
                    </div>
                    <span className="pill pill-muted tiny">{a.status}</span>
                    {a.turnaroundHours != null && <span className="num small muted">{a.turnaroundHours}h</span>}
                    {a.status === 'queued'
                      ? <span className="pill pill-warn tiny">queued</span>
                      : a.onTime ? <span className="pill pill-ok tiny">on time</span> : <span className="pill pill-warn tiny">late</span>}
                  </div>
                ))}
              </div>
              {e.apps.map((a) => (
                <div className="row-line" key={a.app}>
                  <div className="row-line-main">
                    <span>{a.app}</span>
                    <small className="muted">{a.category}</small>
                  </div>
                  <Bar value={a.seconds} max={maxApp} />
                  <b className="num">{fmtHM(a.seconds)}</b>
                </div>
              ))}
            </div>

            <div className="drawer-section">
              <h4><Globe size={14} /> Job boards visited</h4>
              {e.sites.length === 0 && <Empty>No browsing recorded yet.</Empty>}
              {e.sites.map((s) => (
                <div className="row-line" key={s.domain}>
                  <div className="row-line-main">
                    <span>{s.domain}</span>
                    <small className="muted">{s.pages} page{s.pages === 1 ? '' : 's'}</small>
                  </div>
                  <Bar value={s.seconds} max={Math.max(1, ...e.sites.map((x) => x.seconds))} color="var(--sky)" />
                  <b className="num">{fmtHM(s.seconds)}</b>
                </div>
              ))}
              {e.blockedAttempts > 0 && (
                <p className="inline-warn">{e.blockedAttempts} blocked attempt{e.blockedAttempts === 1 ? '' : 's'} today</p>
              )}
            </div>

            <div className="drawer-section">
              <h4><MonitorSmartphone size={14} /> Last 14 days</h4>
              <div className="history">
                {data.history.map((h) => (
                  <div className="history-row" key={h.date}>
                    <span>{fmtDate(h.date)}</span>
                    <span className="muted">{h.inLabel} – {h.outLabel || '—'}</span>
                    {h.late && <span className="pill pill-warn tiny">Late</span>}
                    <Bar value={h.workedSeconds} max={9 * 3600} />
                    <b className="num">{fmtHM(h.workedSeconds)}</b>
                  </div>
                ))}
                {data.history.length === 0 && <Empty>No attendance on record.</Empty>}
              </div>
            </div>

            <div className="drawer-section">
              <h4><Laptop size={14} /> Registered devices</h4>
              {data.devices.map((d) => (
                <div className="device-row" key={d.id}>
                  <span className="device-ico"><Laptop size={15} /></span>
                  <div>
                    <strong>{d.name}</strong>
                    <small className="muted">{d.platform} · {d.os_version} · agent {d.app_version}</small>
                  </div>
                  <span className={`pill ${d.status === 'active' ? 'pill-ok' : 'pill-muted'}`}>{d.status}</span>
                </div>
              ))}
              {data.devices.length === 0 && <Empty>No device linked yet.</Empty>}
            </div>

            <div className="drawer-section">
              <h4>Activity trail (24h)</h4>
              <ol className="timeline">
                {data.events.map((ev) => (
                  <li key={ev.id}>
                    <span className={`tl-dot ${ev.source}`} />
                    <div>
                      <strong>{EVENT_COPY[ev.type] || ev.type}</strong>
                      <small className="muted">
                        {ev.label} · {ev.meta?.app || ev.meta?.domain || ev.meta?.device || ev.source}
                      </small>
                    </div>
                    <span className="pill pill-muted tiny">recorded</span>
                  </li>
                ))}
                {data.events.length === 0 && <Empty>Nothing recorded in the last 24 hours.</Empty>}
              </ol>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}