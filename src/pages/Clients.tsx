import React from 'react';
import {
  Briefcase, Building2, CheckCircle2, Clock3, Download, FileText,
  Inbox, Plus, Search, Timer, X,
} from 'lucide-react';
import { api, post, type Application, type ClientRow, type EfficiencyRow } from '../api';
import { useApp } from '../ctx';
import CvModal from '../CvModal';
import { Avatar, Bar, Card, Empty, Modal, Segmented, Spinner, fmtDate, relTime } from '../ui';

type Period = 7 | 14 | 30;

const PACKAGES: Record<string, { tiers: string[]; fee: number }> = {
  'Job Search & CV Review Subscription': { tiers: ['1 month', '2 months', 'Unlimited'], fee: 150 },
  'Resume Support Package': { tiers: ['One-off'], fee: 50 },
  'LinkedIn Optimization': { tiers: ['One-off'], fee: 50 },
  'Interview Preparation Support': { tiers: ['One-off'], fee: 75 },
};

export default function Clients() {
  const { tick, user } = useApp();
  const [days, setDays] = React.useState<Period>(14);
  const [status, setStatus] = React.useState<'' | 'active' | 'placed' | 'paused'>('');
  const [employeeId, setEmployeeId] = React.useState(0);
  const [q, setQ] = React.useState('');
  const [rows, setRows] = React.useState<ClientRow[] | null>(null);
  const [eff, setEff] = React.useState<EfficiencyRow[]>([]);
  const [apps, setApps] = React.useState<Application[]>([]);
  const [people, setPeople] = React.useState<any[]>([]);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (status) params.set('status', status);
    if (employeeId) params.set('employeeId', String(employeeId));
    if (q) params.set('q', q);
    api<{ clients: ClientRow[] }>(`/api/clients?${params}`).then((r) => setRows(r.clients)).catch(() => setRows([]));
    api<{ rows: EfficiencyRow[] }>(`/api/efficiency?days=${days}`)
      .then((r) => setEff(r.rows)).catch(() => setEff([]));
    api<{ applications: Application[] }>(`/api/applications?days=${days}`)
      .then((r) => setApps(r.applications)).catch(() => setApps([]));
  }, [days, status, employeeId, q]);

  React.useEffect(load, [load, tick]);
  React.useEffect(() => {
    api<{ employees: any[] }>('/api/employees').then((r) => setPeople(r.employees.filter((e: any) => e.role !== 'Admin' && e.role !== 'Super Admin')));
  }, []);

  const clients = rows || [];
  const activeClients = clients.filter((c) => c.status === 'active');
  const totalApplied = clients.reduce((s, c) => s + c.applied, 0);
  const totalInterviews = clients.reduce((s, c) => s + c.interviews, 0);
  const totalQueued = clients.reduce((s, c) => s + c.queued, 0);
  const onTimeWeighted = clients.reduce((s, c) => s + (c.onTimeRate != null ? Math.round((c.onTimeRate / 100) * c.applied) : 0), 0);
  const turnaround = clients.filter((c) => c.avgTurnaroundHours != null);
  const avgTurn = turnaround.length
    ? (turnaround.reduce((s, c) => s + (c.avgTurnaroundHours || 0), 0) / turnaround.length).toFixed(1)
    : '—';

  const canManage = user.role === 'Super Admin' || user.role === 'Admin';

  const exportCsv = () => {
    const head = ['Client', 'Target role', 'Market', 'Package', 'Owner', 'Applications', 'Applied', 'Queued', 'Interviews', 'Weekly quota', 'On-time %', 'Avg turnaround (h)', 'SLA (h)', 'Status'];
    const lines = [head.join(',')].concat(clients.map((c) => [
      JSON.stringify(c.name), JSON.stringify(c.targetRole || ''), JSON.stringify(c.targetMarket || ''),
      JSON.stringify(c.package || ''), JSON.stringify(c.assignees.map((a) => a.name).join(' / ')),
      c.applications, c.applied, c.queued, c.interviews, c.weeklyQuota, c.onTimeRate ?? '', c.avgTurnaroundHours ?? '', c.slaHours, c.status,
    ].join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tnsi-clients-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients &amp; applications</h1>
          <p className="muted">Every job seeker on the book: package, target market, weekly application pace and SLA.</p>
        </div>
        <div className="row gap8">
          <button className="btn ghost" onClick={exportCsv}><Download size={15} /> Export</button>
          {canManage && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Add client</button>}
        </div>
      </div>

      <Card pad={false} className="filter-card">
        <div className="toolbar">
          <label className="search inline">
            <Search size={15} />
            <input placeholder="Search client, target role or owner…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="toolbar-group">
            <select value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value))}>
              <option value={0}>All consultants</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} title="Client stage">
              <option value="">All stages</option>
              <option value="active">Active search</option>
              <option value="placed">Placed</option>
              <option value="paused">Paused</option>
            </select>
            <Segmented
              value={String(days) as any}
              onChange={(v) => setDays(Number(v) as Period)}
              options={[{ value: '7', label: '7d' }, { value: '14', label: '14d' }, { value: '30', label: '30d' }]}
            />
          </div>
        </div>
      </Card>

      <div className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi">
          <span className="kpi-ico blue"><Building2 size={16} /></span>
          <div className="kpi-label">Clients on the book</div>
          <div className="kpi-value">{clients.length}<small> {status || 'all'}</small></div>
          <div className="kpi-foot">
            <span className="muted">{activeClients.length} searching</span>
            <span className="muted">{clients.filter((c) => c.status === 'placed').length} placed</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-ico sky"><Inbox size={16} /></span>
          <div className="kpi-label">Applications filed</div>
          <div className="kpi-value">{totalApplied}</div>
          <div className="kpi-foot">
            <span className="up">{totalInterviews} interviews</span>
            <span className={totalQueued ? 'warn' : 'muted'}>{totalQueued} leads queued</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-ico green"><CheckCircle2 size={16} /></span>
          <div className="kpi-label">On-time rate</div>
          <div className="kpi-value">{totalApplied ? Math.round((onTimeWeighted / totalApplied) * 100) : 0}<small>%</small></div>
          <div className="kpi-foot"><span className="muted">against client SLA</span><span className="muted">{totalApplied} filed</span></div>
        </div>
        <div className="kpi">
          <span className="kpi-ico amber"><Timer size={16} /></span>
          <div className="kpi-label">Avg turnaround</div>
          <div className="kpi-value">{avgTurn}<small>h</small></div>
          <div className="kpi-foot"><span className="muted">lead → filed</span><span className="muted">per client</span></div>
        </div>
      </div>

      <div className="grid-2-1">
        <Card
          title="Client book"
          subtitle={status === 'active' ? 'Active searches only' : status === 'placed' ? 'Clients who landed a role' : status === 'paused' ? 'Paused engagements' : 'All job seekers on the book'}
          pad={false}
        >
          {!rows && <div className="page-loading"><Spinner /></div>}
          {rows && clients.length === 0 && <Empty>No clients match those filters.</Empty>}
          {rows && clients.length > 0 && (
            <table className="table roomy">
              <thead>
                <tr>
                  <th>Client</th><th>Owner</th><th className="right">Apps</th><th className="right">Interviews</th>
                  <th>Weekly pace</th><th className="right">On time</th><th>SLA</th><th>Last filed</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setOpenId(c.id)}>
                    <td>
                      <div className="cell-person">
                        <span className="client-dot" style={{ background: `${c.color}26`, color: c.color }}><Briefcase size={15} /></span>
                        <div>
                          <strong>{c.name}</strong>
                          <small className="muted">{c.targetRole || 'Role TBC'} · {c.targetCity || c.targetMarket || 'Market TBC'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-person">
                        {c.assignees.length
                          ? <><Avatar name={c.assignees[0].name} color={c.assignees[0].color} size={24} /><span>{c.assignees[0].name}</span></>
                          : <span className="muted">Unassigned</span>}
                      </div>
                    </td>
                    <td className="right num">{c.applied}{c.queued > 0 && <span className="muted small"> · {c.queued}q</span>}</td>
                    <td className="right num">{c.interviews || '—'}</td>
                    <td style={{ minWidth: 120 }}>
                      {c.weeklyQuota
                        ? <>
                            <Bar value={Math.min(c.weeklyApplied, c.weeklyQuota)} max={c.weeklyQuota} color="var(--green)" />
                            <small className="muted">{c.weeklyApplied}/{c.weeklyQuota} this week</small>
                          </>
                        : <span className="muted small">No target</span>}
                    </td>
                    <td className="right num">{c.onTimeRate == null ? '—' : `${c.onTimeRate}%`}</td>
                    <td className="muted num">{c.slaHours}h</td>
                    <td className="muted">{c.lastAppliedAt ? relTime(c.lastAppliedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title="Throughput, not ranking"
          subtitle="Applications per tracked active hour"
          action={<Clock3 size={15} className="muted" />}
        >
          {eff.length === 0 && <Empty>No application activity in this period.</Empty>}
          <ul className="eff-list">
            {eff.map((e) => (
              <li key={e.userId}>
                <Avatar name={e.name} color={e.color} size={28} />
                <div className="eff-main">
                  <div className="eff-top">
                    <strong>{e.name}</strong>
                    <span className="muted small">{e.applications} apps · {e.clients} client{e.clients === 1 ? '' : 's'}</span>
                  </div>
                  <Bar value={e.perActiveHour || 0} max={Math.max(...eff.map((x) => x.perActiveHour || 0), 0.1)} color="var(--blue)" />
                  <div className="eff-meta">
                    <span><b>{e.perActiveHour ?? '—'}</b> / active hr</span>
                    <span>{e.onTimeRate == null ? '—' : `${e.onTimeRate}% on time`}</span>
                    <span>{e.activeHours}h tracked</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="fineprint" style={{ marginTop: 10 }}>
            Active hours come from foreground tracking. Low volume can mean complex cases, not low effort —
            use this to spot workload imbalance and SLA risk, not to rank people.
          </p>
        </Card>
      </div>

      <Card title="Recent applications" subtitle="Every role filed for a client, with board and turnaround" pad={false}>
        {apps.length === 0 && <Empty>No applications in this period.</Empty>}
        {apps.length > 0 && (
          <table className="table">
            <thead>
              <tr><th>Filed</th><th>Client</th><th>Employer / role</th><th>Consultant</th><th>Board</th><th className="right">Turnaround</th><th className="right">SLA</th><th className="right">Status</th></tr>
            </thead>
            <tbody>
              {apps.slice(0, 14).map((a) => (
                <tr key={a.id}>
                  <td className="muted num">{a.appliedAt ? new Date(a.appliedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}<small className="muted block">{fmtDate(a.day)}</small></td>
                  <td><strong>{a.client}</strong></td>
                  <td><strong>{a.employer}</strong><small className="muted block">{a.role}</small></td>
                  <td>
                    <div className="cell-person"><Avatar name={a.employee} color={a.color} size={22} /><span>{a.employee}</span></div>
                  </td>
                  <td className="muted">{a.board}</td>
                  <td className="right num">{a.turnaroundHours == null ? '—' : `${a.turnaroundHours}h`}</td>
                  <td className="right muted num">{a.onTime == null ? '—' : a.onTime ? 'met' : 'late'}</td>
                  <td className="right">
                    {a.status === 'offer' ? <span className="pill pill-ok tiny">offer</span>
                      : a.status === 'interview' ? <span className="pill pill-info tiny">interview</span>
                        : a.status === 'rejected' ? <span className="pill pill-danger tiny">closed</span>
                          : <span className="pill pill-muted tiny">filed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ClientDrawer id={openId} days={days} onClose={() => setOpenId(null)} />
      <AddClient open={adding} people={people} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
    </>
  );
}

function ClientDrawer({ id, days, onClose }: { id: number | null; days: number; onClose: () => void }) {
  const [data, setData] = React.useState<{ client: ClientRow; applications: Application[] } | null>(null);
  const [cvOpen, setCvOpen] = React.useState(false);
  React.useEffect(() => {
    if (!id) return;
    setData(null);
    api<{ client: ClientRow; applications: Application[] }>(`/api/clients/${id}?days=${days}`).then(setData).catch(() => setData(null));
  }, [id, days]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (id) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);
  if (!id) return null;
  const c = data?.client;
  const trend = c?.trend || [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  return (
    <div className="drawer-scrim" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="muted small">Client record</span>
          <button className="icon-btn" onClick={onClose}><X size={17} /></button>
        </div>
        {!data && <div className="drawer-loading"><Spinner /></div>}
        {c && data && (
          <div className="drawer-body">
            <div className="drawer-person">
              <span className="client-dot big" style={{ background: `${c.color}22`, color: c.color }}><Briefcase size={20} /></span>
              <div>
                <h2>{c.name}</h2>
                <p className="muted">{c.targetRole || 'Role TBC'} · {c.targetCity || c.targetMarket || 'Market TBC'}</p>
                <p className="muted small">{c.package}{c.packageTier ? ` · ${c.packageTier}` : ''}{c.feeCad ? ` · CAD ${c.feeCad}` : ''}</p>
                <div className="row gap8">
                  {c.assignees.map((a) => (
                    <span className="pill pill-muted" key={a.id}><Avatar name={a.name} color={a.color} size={16} /> {a.name}</span>
                  ))}
                  <span className={`pill tiny ${c.status === 'placed' ? 'pill-ok' : c.status === 'paused' ? 'pill-warn' : 'pill-info'}`}>{c.status}</span>
                </div>
              </div>
            </div>

            <div className="mini-grid">
              <div className="mini"><span>Applications</span><strong>{c.applied}</strong></div>
              <div className="mini"><span>Interviews</span><strong>{c.interviews}</strong></div>
              <div className="mini"><span>On time</span><strong>{c.onTimeRate == null ? '—' : `${c.onTimeRate}%`}</strong></div>
              <div className="mini"><span>Avg turnaround</span><strong>{c.avgTurnaroundHours == null ? '—' : `${c.avgTurnaroundHours}h`}</strong></div>
            </div>

            <div className="drawer-section">
              <h4>Engagement</h4>
              <div className="contact-line"><strong>{c.email || '—'}</strong><span className="muted">SLA {c.slaHours}h · target {c.weeklyQuota || '—'} applications / week</span></div>
              <div style={{ marginTop: 8 }}>
                <Bar value={Math.min(c.weeklyApplied, c.weeklyQuota || 1)} max={c.weeklyQuota || 1} color="var(--green)" />
                <small className="muted">{c.weeklyApplied} filed this week{c.weeklyQuota ? ` of ${c.weeklyQuota}` : ''}</small>
              </div>
            </div>

            {c.cv && (
              <div className="drawer-section">
                <h4><FileText size={14} /> CV on file</h4>
                <div className="cv-card">
                  <span className="cv-ico"><FileText size={18} /></span>
                  <div className="cv-card-main">
                    <strong>{c.cv.fileName}</strong>
                    <small className="muted">
                      {c.cv.pages} pages · updated {relTime(c.cv.updatedAt)} · ATS {c.cv.atsScore}/100
                    </small>
                    <div className="board-chips" style={{ marginTop: 7 }}>
                      {c.cv.skills.slice(0, 6).map((skill) => (
                        <span className="board-chip" key={skill}>{skill}</span>
                      ))}
                      {c.cv.skills.length > 6 && <span className="agent-muted-note">+{c.cv.skills.length - 6}</span>}
                    </div>
                  </div>
                  <button className="btn ghost sm" onClick={() => setCvOpen(true)}>
                    <FileText size={13} /> Preview
                  </button>
                </div>
                <p className="fineprint">
                  Reviewed against the target role. Skills, experience and work authorization stay with the client record.
                </p>
              </div>
            )}

            {trend.length > 0 && (
              <div className="drawer-section">
                <h4>Applications, last 14 days</h4>
                <div className="trend-bars">
                  {trend.map((t) => (
                    <div key={t.day} title={`${t.day}: ${t.count}`}>
                      <i style={{ height: `${Math.max(6, (t.count / maxTrend) * 100)}%` }} />
                      <span>{t.day.slice(8)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="drawer-section">
              <h4>Application history</h4>
              {data.applications.length === 0 && <Empty>No applications in this period.</Empty>}
              <div className="sub-list">
                {data.applications.map((a) => (
                  <div className="sub-row" key={a.id}>
                    <div className="sub-main">
                      <strong>{a.employer} · {a.role}</strong>
                      <small className="muted">{a.board} · {fmtDate(a.day)} · {a.employee}</small>
                    </div>
                    <span className="pill pill-muted tiny">{a.status}</span>
                    <span className="num small muted">{a.turnaroundHours == null ? '—' : `${a.turnaroundHours}h`}</span>
                    {a.status === 'queued'
                      ? <span className="pill pill-warn tiny">queued</span>
                      : a.onTime ? <span className="pill pill-ok tiny">on time</span> : <span className="pill pill-warn tiny">late</span>}
                  </div>
                ))}
              </div>
            </div>

            {c.cv && <CvModal open={cvOpen} cv={c.cv} client={c} onClose={() => setCvOpen(false)} />}
          </div>
        )}
      </aside>
    </div>
  );
}

function AddClient({ open, people, onClose, onDone }: { open: boolean; people: any[]; onClose: () => void; onDone: () => void }) {
  const firstPackage = Object.keys(PACKAGES)[0];
  const [form, setForm] = React.useState({
    name: '', email: '', targetRole: '', targetMarket: 'Canada', targetCity: '',
    package: firstPackage, packageTier: PACKAGES[firstPackage].tiers[0], feeCad: PACKAGES[firstPackage].fee,
    slaHours: 24, weeklyQuota: 12, assignedTo: 0,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = () => setForm({
    name: '', email: '', targetRole: '', targetMarket: 'Canada', targetCity: '',
    package: firstPackage, packageTier: PACKAGES[firstPackage].tiers[0], feeCad: PACKAGES[firstPackage].fee,
    slaHours: 24, weeklyQuota: 12, assignedTo: people[0]?.id ?? 0,
  });

  React.useEffect(() => {
    if (open) {
      reset();
      setError(null);
    }
  }, [open, people]);

  const pickPackage = (name: string) => {
    const p = PACKAGES[name];
    setForm({ ...form, package: name, packageTier: p.tiers[0], feeCad: p.fee });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/clients', { ...form, assignedTo: form.assignedTo ? [form.assignedTo] : [] });
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a job seeker" width={660}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Client name</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aarav Bhandari" />
          </label>
          <label className="field"><span>Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="client@example.com" />
          </label>
          <label className="field"><span>Target role</span>
            <input value={form.targetRole} onChange={(e) => setForm({ ...form, targetRole: e.target.value })} placeholder="AI Engineer" />
          </label>
          <label className="field"><span>Target market</span>
            <select value={form.targetMarket} onChange={(e) => setForm({ ...form, targetMarket: e.target.value })}>
              {['Canada', 'USA', 'Australia', 'New Zealand', 'UK', 'Germany', 'UAE'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="field"><span>Target city</span>
            <input value={form.targetCity} onChange={(e) => setForm({ ...form, targetCity: e.target.value })} placeholder="Toronto" />
          </label>
          <label className="field"><span>Package</span>
            <select value={form.package} onChange={(e) => pickPackage(e.target.value)}>
              {Object.keys(PACKAGES).map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="field"><span>Tier</span>
            <select value={form.packageTier} onChange={(e) => setForm({ ...form, packageTier: e.target.value })}>
              {PACKAGES[form.package].tiers.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field"><span>Fee (CAD)</span>
            <input type="number" min={0} value={form.feeCad} onChange={(e) => setForm({ ...form, feeCad: Number(e.target.value) })} />
          </label>
          <label className="field"><span>SLA (hours)</span>
            <input type="number" min={1} max={240} value={form.slaHours} onChange={(e) => setForm({ ...form, slaHours: Number(e.target.value) })} />
          </label>
          <label className="field"><span>Applications / week</span>
            <input type="number" min={0} max={100} value={form.weeklyQuota} onChange={(e) => setForm({ ...form, weeklyQuota: Number(e.target.value) })} />
          </label>
          <label className="field"><span>Assign to</span>
            <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: Number(e.target.value) })}>
              <option value={0}>Unassigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}><Plus size={15} /> Create client</button>
        </div>
      </form>
    </Modal>
  );
}
