import React from 'react';
import { Filter, Plus, Search, UserPlus } from 'lucide-react';
import { api, post, type EmployeeRow } from '../api';
import { useApp } from '../ctx';
import { Avatar, Card, Empty, Modal, Segmented, Spinner, StatusPill, fmtHM } from '../ui';
import EmployeeDrawer from './EmployeeDrawer';

type Filter = 'all' | 'working' | 'late' | 'absent';

export default function Employees({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const { tick, user } = useApp();
  const [rows, setRows] = React.useState<EmployeeRow[] | null>(null);
  const [teams, setTeams] = React.useState<any[]>([]);
  const [team, setTeam] = React.useState<number | 0>(0);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(() => {
    api<{ employees: EmployeeRow[]; teams: any[] }>('/api/employees')
      .then((r) => { setRows(r.employees); setTeams(r.teams); })
      .catch(() => setRows([]));
  }, []);

  React.useEffect(load, [load, tick]);

  const canManage = user.role === 'Super Admin' || user.role === 'Admin';

  const filtered = (rows || []).filter((e) => {
    if (team && e.team !== teams.find((t) => t.id === team)?.name) return false;
    if (filter === 'working' && !['working', 'on_break'].includes(e.status)) return false;
    if (filter === 'late' && !e.late) return false;
    if (filter === 'absent' && e.status !== 'absent') return false;
    if (query) {
      const hay = `${e.name} ${e.email} ${e.title} ${e.team} ${e.apps.map((a) => a.app).join(' ')} ${e.sites.map((s) => s.domain).join(' ')}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const totalApps = (rows || []).reduce((s, e) => s + e.applicationsToday, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Placement team</h1>
          <p className="muted">Shift, applications filed and job-board activity for every consultant on the desk.</p>
        </div>
        <div className="row gap8">
          {canManage && <button className="btn primary" onClick={() => setAdding(true)}><UserPlus size={15} /> Add consultant</button>}
        </div>
      </div>

      <Card pad={false}>
        <div className="toolbar">
          <label className="search inline">
            <Search size={15} />
            <input placeholder="Search by name, app or board…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="toolbar-group">
            <span className="filter-ico"><Filter size={14} /></span>
            <select value={team} onChange={(e) => setTeam(Number(e.target.value))}>
              <option value={0}>All teams</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'working', label: 'On desk' },
                { value: 'late', label: 'Late' },
                { value: 'absent', label: 'Not in' },
              ]}
            />
            <span className="pill pill-muted tiny">{totalApps} apps today</span>
          </div>
        </div>

        {!rows && <div className="page-loading"><Spinner /></div>}
        {rows && filtered.length === 0 && <Empty>No one matches those filters.</Empty>}
        {rows && filtered.length > 0 && (
          <table className="table roomy">
            <thead>
              <tr>
                <th>Consultant</th><th>Team</th><th>Status</th><th>Clock in</th>
                <th className="right">Apps today</th><th className="right">Leads</th><th className="right">Interviews</th>
                <th className="right">On time</th><th>Top board</th><th className="right">Active</th><th className="right">Blocks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setOpenId(e.id)}>
                  <td>
                    <div className="cell-person">
                      <Avatar name={e.name} color={e.color} size={30} />
                      <div><strong>{e.name}</strong><small className="muted">{e.title}</small></div>
                    </div>
                  </td>
                  <td className="muted">{e.team}</td>
                  <td><StatusPill status={e.status} /></td>
                  <td className="num">{e.clockInLabel || '—'}{e.late && <span className="late-dot" title="Late arrival" />}</td>
                  <td className="right num"><b>{e.applicationsToday}</b></td>
                  <td className="right num">{e.queuedLeads ? <span className={e.overdueLeads ? 'warn' : ''}>{e.queuedLeads}</span> : '—'}</td>
                  <td className="right num">{e.interviewsBooked || '—'}</td>
                  <td className="right num">{e.onTimePct == null ? '—' : `${e.onTimePct}%`}</td>
                  <td className="muted">{e.sites[0]?.domain || '—'}</td>
                  <td className="right num">{fmtHM(e.activeSeconds)}</td>
                  <td className="right">{e.blockedAttempts || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <EmployeeDrawer id={openId} onClose={() => setOpenId(null)} />
      <AddEmployee open={adding} teams={teams} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
    </>
  );
}

function AddEmployee({ open, teams, onClose, onDone }: { open: boolean; teams: any[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = React.useState({ name: '', email: '', title: '', role: 'Employee', teamId: teams[0]?.id ?? 1 });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) { setForm({ name: '', email: '', title: '', role: 'Employee', teamId: teams[0]?.id ?? 1 }); setError(null); }
  }, [open, teams]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/employees', form);
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a consultant">
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          The account is created with the temporary password <code>demo1234</code>. In production this sends an invitation link.
        </p>
        <div className="form-grid">
          <label className="field"><span>Full name</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sneha Rai" />
          </label>
          <label className="field"><span>Work email</span>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="sneha@tnsintl.com" />
          </label>
          <label className="field"><span>Job title</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Career Consultant" />
          </label>
          <label className="field"><span>Team</span>
            <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: Number(e.target.value) })}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option>Employee</option><option>Team Lead</option><option>Admin</option>
            </select>
          </label>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}><Plus size={15} /> Create consultant</button>
        </div>
      </form>
    </Modal>
  );
}
