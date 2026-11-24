import React from 'react';
import {
  ArrowUpRight, Ban, Briefcase, CalendarCheck, Clock3, Download, Flame, Globe, Radio, ShieldCheck,
  Timer, Users,
} from 'lucide-react';
import { useApp } from '../ctx';
import { api, type Overview as OverviewData } from '../api';
import { ActivityChart, AttendanceBar } from '../charts';
import { Avatar, Card, Empty, Spinner, StatusPill, fmtHM, relTime } from '../ui';
import EmployeeDrawer from './EmployeeDrawer';

export default function Overview({ onOpenEmployee, goLive }: { onOpenEmployee: () => void; goLive: () => void }) {
  const { tick } = useApp();
  const [data, setData] = React.useState<OverviewData | null>(null);
  const [blocked, setBlocked] = React.useState<any[]>([]);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Early in the day there is nothing to plot yet. Fall back to the most recent
  // day that has activity rather than showing an empty chart.
  const [chartDay, setChartDay] = React.useState<{ date: string; hourly: OverviewData['hourly'] } | null>(null);
  const triedFallback = React.useRef(false);

  React.useEffect(() => {
    api<OverviewData>('/api/overview').then(setData).catch((e) => setError(e.message));
    api<{ blocked: any[] }>('/api/live').then((r) => setBlocked(r.blocked)).catch(() => {});
  }, [tick]);

  React.useEffect(() => {
    if (!data || triedFallback.current) return;
    const busyHours = data.hourly.filter((h) => h.focus + h.distraction > 0).length;
    if (busyHours >= 3) return;
    triedFallback.current = true;
    for (let back = 1; back <= 3; back++) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      api<OverviewData>(`/api/overview?date=${key}`).then((prev) => {
        const busy = prev.hourly.filter((h) => h.focus + h.distraction > 0).length;
        if (busy >= 3) {
          // Requests run in parallel; keep the most recent qualifying day.
          setChartDay((cur) => (!cur || prev.date > cur.date ? { date: prev.date, hourly: prev.hourly } : cur));
        }
      }).catch(() => {});
    }
  }, [data]);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="page-loading"><Spinner /></div>;

  const { kpis, employees } = data;
  const onTimeArrivals = Math.max(0, kpis.present - kpis.late);
  const punctuality = kpis.present ? Math.round((onTimeArrivals / kpis.present) * 100) : 100;
  const staff = employees.filter((e) => e.role === 'Employee' || e.role === 'Team Lead');
  const deskRows = employees.filter((e) => e.status !== 'absent' || e.role === 'Employee');
  const totalApplications = staff.reduce((s, e) => s + e.applicationsToday, 0);

  const exportCsv = async () => {
    const r = await api<{ rows: any[] }>('/api/reports/daily');
    const head = ['Consultant', 'Team', 'Clock in', 'Clock out', 'Late', 'Hours', 'Active hours', 'Top board', 'Blocked', 'Applications', 'Interviews', 'Queued'];
    const lines = [head.join(',')].concat(
      r.rows.map((x) => [x.name, x.team, x.clockIn, x.clockOut, x.late ? 'yes' : 'no', x.workedHours, x.activeHours, x.topBoard, x.blockedAttempts, x.applications, x.interviews, x.queued].join(','))
    );
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tnsi-desk-${data.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Placement desk, today</h1>
          <p className="muted">
            {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} ·
            {' '}Desk hours {data.schedule.start}–{data.schedule.end} · Canada · Australia · UK · UAE
          </p>
        </div>
        <div className="row gap8">
          <button className="btn ghost" onClick={exportCsv}><Download size={15} /> Export day</button>
          <button className="btn primary" onClick={goLive}><Radio size={15} /> Live desk</button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-ico blue"><Briefcase size={16} /></span>
          <div className="kpi-label">Applications filed</div>
          <div className="kpi-value">{kpis.applicationsToday}<small> today</small></div>
          <div className="kpi-foot">
            <span className="up">{kpis.onTimePct}% inside SLA</span>
            <span className="muted">{kpis.activeClients} active clients</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-ico green"><CalendarCheck size={16} /></span>
          <div className="kpi-label">Interviews booked</div>
          <div className="kpi-value">{kpis.interviewsBooked}<small> · 14d</small></div>
          <div className="kpi-foot">
            <span className="up">{kpis.placedClients} placement{kpis.placedClients === 1 ? '' : 's'}</span>
            <span className="muted">offers &amp; interviews</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-ico amber"><Timer size={16} /></span>
          <div className="kpi-label">Leads waiting</div>
          <div className="kpi-value">{kpis.queuedLeads}</div>
          <div className="kpi-foot">
            <span className={kpis.overdueLeads ? 'warn' : 'up'}>{kpis.overdueLeads} past SLA</span>
            <span className="muted">ready to apply</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-ico purple"><Users size={16} /></span>
          <div className="kpi-label">On the clock</div>
          <div className="kpi-value">{kpis.workingNow}<small> / {kpis.totalEmployees}</small></div>
          <div className="kpi-foot">
            <span className="up">{kpis.present} checked in</span>
            <span className="muted">{punctuality}% on time</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-ico sky"><ShieldCheck size={16} /></span>
          <div className="kpi-label">Policy blocks</div>
          <div className="kpi-value">{kpis.blockedAttempts}</div>
          <div className="kpi-foot">
            <span className="muted">job boards only</span>
            <span className="pill pill-ok tiny">on device</span>
          </div>
        </div>
      </div>

      <div className="grid-2-1">
        <Card
          title="Activity across the day"
          subtitle={chartDay
            ? `Nothing logged today yet — showing ${new Date(`${chartDay.date}T12:00:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}`
            : 'Job boards, documents and desk tools — minutes by hour'}
          action={<span className="pill pill-muted tiny">updates live</span>}
        >
          <ActivityChart data={chartDay ? chartDay.hourly : data.hourly} />
        </Card>

        <Card
          title="Desk coverage"
          subtitle={`${kpis.present} of ${kpis.totalEmployees} consultants checked in`}
          action={<span className="pill pill-muted tiny">{punctuality}% on time</span>}
        >
          <AttendanceBar
            segments={[
              { label: 'On time', value: Math.max(0, kpis.present - kpis.late), color: 'var(--green)' },
              { label: 'Late', value: kpis.late, color: 'var(--amber)' },
              { label: 'Not in', value: kpis.absent, color: 'var(--paper-3)' },
            ]}
          />
          <div className="attendance-summary">
            <div><span>Applications</span><b>{totalApplications}</b></div>
            <div><span>Interviews</span><b>{kpis.interviewsBooked}</b></div>
            <div><span>Leads</span><b>{kpis.queuedLeads}</b></div>
          </div>
        </Card>
      </div>

      <div className="grid-2-1">
        <Card
          title="Placement desk today"
          subtitle="Click a consultant to open their full activity record"
          action={<button className="link-btn" onClick={onOpenEmployee}>View all <ArrowUpRight size={13} /></button>}
          pad={false}
        >
          <table className="table">
            <thead>
              <tr>
                <th>Consultant</th>
                <th>Status</th>
                <th className="right">Applications</th>
                <th className="right">Leads</th>
                <th className="right">Interviews</th>
                <th>Top board</th>
                <th className="right">Active</th>
              </tr>
            </thead>
            <tbody>
              {deskRows.map((e) => (
                <tr key={e.id} onClick={() => setOpenId(e.id)} className="clickable">
                  <td>
                    <div className="cell-person">
                      <Avatar name={e.name} color={e.color} size={28} />
                      <div>
                        <strong>{e.name}</strong>
                        <small className="muted">{e.title}</small>
                      </div>
                    </div>
                  </td>
                  <td><StatusPill status={e.status} /></td>
                  <td className="right num"><b>{e.applicationsToday}</b></td>
                  <td className="right num">{e.queuedLeads ? <span className={e.overdueLeads ? 'warn' : ''}>{e.queuedLeads}</span> : '—'}</td>
                  <td className="right num">{e.interviewsBooked || '—'}</td>
                  <td className="muted">{e.sites[0]?.domain || '—'}</td>
                  <td className="right num">{fmtHM(e.activeSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="stack">
          <Card title="Applications by board" subtitle="Filed today across the desk">
            {data.topBoards.length === 0 && <Empty>No applications filed yet today.</Empty>}
            <ul className="rank">
              {data.topBoards.map((b, i) => (
                <li key={b.board}>
                  <span className="rank-n">{i + 1}</span>
                  <div className="rank-main">
                    <span>{b.board}</span>
                    <small className="muted">job board</small>
                  </div>
                  <b className="num">{b.count}</b>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Blocks today" subtitle="Attempts stopped by policy" action={<Ban size={15} className="muted" />}>
            {blocked.length === 0 && <Empty>No blocked attempts yet. Try one from the desktop app.</Empty>}
            <ul className="feed compact">
              {blocked.slice(0, 5).map((b) => (
                <li key={b.id}>
                  <span className="feed-dot danger" />
                  <div>
                    <strong>{b.domain}</strong>
                    <small className="muted">{b.name} · {relTime(b.ts)}</small>
                  </div>
                  <span className="pill pill-danger tiny">blocked</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid-3">
        <Card title="Where the desk browsed" subtitle="Approved job boards, today">
          {data.topSites.length === 0 && <Empty>No browsing recorded yet.</Empty>}
          <ul className="rank">
            {data.topSites.map((s) => (
              <li key={s.domain}>
                <span className="rank-ico"><Globe size={14} /></span>
                <div className="rank-main">
                  <span>{s.domain}</span>
                  <small className="muted">{s.pages} pages</small>
                </div>
                <b className="num">{fmtHM(s.seconds)}</b>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Signals worth a look" subtitle="Not performance scores — conversation starters">
          <ul className="signals">
            {kpis.overdueLeads > 0 && (
              <li><span className="sig amber"><Flame size={14} /></span><div><strong>{kpis.overdueLeads} lead{kpis.overdueLeads === 1 ? '' : 's'} past SLA</strong><small className="muted">Nudge the assigned consultant</small></div></li>
            )}
            {kpis.late > 0 && (
              <li><span className="sig slate"><Clock3 size={14} /></span><div><strong>{kpis.late} late arrival{kpis.late === 1 ? '' : 's'}</strong><small className="muted">Review against the {data.schedule.start} desk start</small></div></li>
            )}
            {kpis.blockedAttempts > 0 && (
              <li><span className="sig red"><Ban size={14} /></span><div><strong>{kpis.blockedAttempts} blocked website attempt{kpis.blockedAttempts === 1 ? '' : 's'}</strong><small className="muted">Policy working as configured</small></div></li>
            )}
            {kpis.queuedLeads === 0 && kpis.overdueLeads === 0 && (
              <li><span className="sig green"><ShieldCheck size={14} /></span><div><strong>Lead queue is clear</strong><small className="muted">Every queued role has been filed</small></div></li>
            )}
            <li><span className="sig green"><ShieldCheck size={14} /></span><div><strong>No integrity warnings</strong><small className="muted">All synced events passed validation</small></div></li>
          </ul>
        </Card>

        <Card title="Coverage" subtitle="Placement desk snapshot">
          <div className="coverage">
            <div className="coverage-block">
              <span>Active clients</span>
              <strong>{kpis.activeClients}</strong>
            </div>
            <div className="coverage-block">
              <span>Placed</span>
              <strong>{kpis.placedClients}</strong>
            </div>
            <div className="coverage-block">
              <span>Devices reporting</span>
              <strong>{staff.filter((e) => e.device && e.status !== 'absent').length} / {staff.length}</strong>
            </div>
            <div className="coverage-block">
              <span>Avg apps / consultant</span>
              <strong>{staff.length ? (totalApplications / staff.length).toFixed(1) : '0'}</strong>
            </div>
          </div>
        </Card>
      </div>

      <EmployeeDrawer id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
