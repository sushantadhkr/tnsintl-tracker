import React from 'react';
import { Check, Globe2, Plus, Save, Shield, ShieldOff, Trash2, X } from 'lucide-react';
import { api, del, patch, post, type Policy } from '../api';
import { useApp } from '../ctx';
import { Card, Spinner } from '../ui';

export default function Policies() {
  const { user } = useApp();
  const [state, setState] = React.useState<{ mode: 'allowlist' | 'blocklist'; policies: Policy[] } | null>(null);
  const [org, setOrg] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<'allow' | 'block', string>>({ allow: '', block: '' });

  const load = React.useCallback(() => {
    api<{ mode: 'allowlist' | 'blocklist'; policies: Policy[] }>('/api/policies').then(setState);
    api<{ org: any }>('/api/bootstrap').then((r) => setOrg(r.org));
  }, []);
  React.useEffect(load, [load]);

  if (!state || !org) return <div className="page-loading"><Spinner /></div>;

  const canEdit = user.role === 'Super Admin' || user.role === 'Admin';
  const allow = state.policies.filter((p) => p.kind === 'allow');
  const block = state.policies.filter((p) => p.kind === 'block');

  const add = async (kind: 'allow' | 'block') => {
    if (!draft[kind].trim()) return;
    setError(null);
    try {
      await post('/api/policies', { kind, domain: draft[kind] });
      setDraft({ ...draft, [kind]: '' });
      load();
    } catch (e: any) { setError(e.message); }
  };

  const remove = async (id: number) => {
    await del(`/api/policies/${id}`);
    load();
  };

  const setMode = async (mode: 'allowlist' | 'blocklist') => {
    await post('/api/policies/mode', { mode });
    load();
  };

  const saveSchedule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await patch('/api/org/schedule', {
        start: f.get('start'), end: f.get('end'), graceMinutes: Number(f.get('grace')),
      });
      load();
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Browsing policy</h1>
          <p className="muted">Approved job boards, ATS portals and desk hours are pushed to every device the moment you save.</p>
        </div>
        <span className="pill pill-ok"><i className="dot" /> synced to devices</span>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="grid-2">
        <Card title="Enforcement mode" subtitle="How the desk browser treats job boards and domains">
          <div className="mode-cards">
            <button className={`mode-card ${state.mode === 'allowlist' ? 'on' : ''}`} onClick={() => canEdit && setMode('allowlist')}>
              <span className="mode-ico"><Shield size={18} /></span>
              <div>
                <strong>Allowlist <span className="pill pill-ok tiny">recommended</span></strong>
                <p>Only approved job boards, ATS portals and desk tools open. Everything else is blocked with an explanation.</p>
              </div>
              {state.mode === 'allowlist' && <span className="mode-check"><Check size={14} /></span>}
            </button>
            <button className={`mode-card ${state.mode === 'blocklist' ? 'on' : ''}`} onClick={() => canEdit && setMode('blocklist')}>
              <span className="mode-ico"><ShieldOff size={18} /></span>
              <div>
                <strong>Blocklist</strong>
                <p>Browsing is open, and only the listed domains are denied. Useful for a phased rollout.</p>
              </div>
              {state.mode === 'blocklist' && <span className="mode-check"><Check size={14} /></span>}
            </button>
          </div>
          <p className="fineprint">
            Enforcement happens inside the embedded browser session (request filter), not only on navigation —
            redirects, popups and sub-resources are covered too.
          </p>
        </Card>

        <Card title="Working schedule" subtitle="Used to calculate lateness and expected desk hours">
          <form className="form" onSubmit={saveSchedule}>
            <div className="form-grid three">
              <label className="field"><span>Desk start</span>
                <input name="start" defaultValue={org.schedule.start} pattern="\d{2}:\d{2}" required disabled={!canEdit} />
              </label>
              <label className="field"><span>Desk end</span>
                <input name="end" defaultValue={org.schedule.end} pattern="\d{2}:\d{2}" required disabled={!canEdit} />
              </label>
              <label className="field"><span>Grace period (min)</span>
                <input name="grace" type="number" min={0} max={120} defaultValue={org.schedule.graceMinutes} disabled={!canEdit} />
              </label>
            </div>
            <div className="schedule-note">
              <span className="muted small">
                Arrivals after {org.schedule.start} + {org.schedule.graceMinutes}m are flagged late.
                Lateness is evaluated once, at clock-in.
              </span>
              {canEdit && <button className="btn primary" disabled={busy}><Save size={15} /> Save schedule</button>}
            </div>
          </form>
        </Card>
      </div>

      <div className="grid-2">
        <DomainList
          title="Allowed domains" tone="green" icon={<Globe2 size={15} />}
          hint="Subdomains of an allowed domain are approved automatically."
          items={allow} placeholder="linkedin.com" draft={draft.allow} canEdit={canEdit}
          onDraft={(v) => setDraft({ ...draft, allow: v })} onAdd={() => add('allow')} onRemove={remove}
        />
        <DomainList
          title="Blocked domains" tone="red" icon={<ShieldOff size={15} />}
          hint="Blocked domains stay blocked even in blocklist mode."
          items={block} placeholder="tiktok.com" draft={draft.block} canEdit={canEdit}
          onDraft={(v) => setDraft({ ...draft, block: v })} onAdd={() => add('block')} onRemove={remove}
        />
      </div>
    </>
  );
}

function DomainList({
  title, hint, items, tone, icon, placeholder, draft, canEdit, onDraft, onAdd, onRemove,
}: {
  title: string; hint: string; items: Policy[]; tone: 'green' | 'red'; icon: React.ReactNode;
  placeholder: string; draft: string; canEdit: boolean;
  onDraft: (v: string) => void; onAdd: () => void; onRemove: (id: number) => void;
}) {
  return (
    <Card title={<span className="row gap8">{icon} {title}</span>} subtitle={hint} action={<span className={`pill pill-${tone} tiny`}>{items.length} domains</span>}>
      {canEdit && (
        <div className="add-domain">
          <input
            placeholder={placeholder}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAdd())}
          />
          <button className="btn ghost" onClick={onAdd}><Plus size={14} /> Add</button>
        </div>
      )}
      <div className="chips">
        {items.map((p) => (
          <span className={`chip ${tone}`} key={p.id}>
            {p.domain}
            {canEdit && <button onClick={() => onRemove(p.id)} title="Remove"><X size={12} /></button>}
          </span>
        ))}
        {items.length === 0 && <p className="muted small">No domains yet.</p>}
      </div>
    </Card>
  );
}