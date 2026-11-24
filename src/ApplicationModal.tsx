/*
 * File an application without leaving the desk.
 *
 * This writes to the console API (so the client book, SLA numbers and reports
 * update) and records an `application_submitted` event in the local agent, so
 * the desktop history and the admin feeds show the same work.
 */

import React from 'react';
import { Briefcase, CheckCircle2 } from 'lucide-react';
import { api, post } from './api';
import { agentClient } from './agent';
import { Empty, Modal, Spinner } from './ui';

type MyClients = {
  clients: { id: number; name: string; color: string; targetRole: string | null; status: string }[];
  queued: {
    id: string; clientId: number; client: string; color: string; employer: string; role: string;
    board: string; matchScore: number | null; ageHours: number; overdue: boolean;
  }[];
};

export type ApplicationDraft = {
  queuedId?: string;
  clientId?: number;
  employer?: string;
  role?: string;
  board?: string;
  matchScore?: number | null;
};

const BOARDS = ['LinkedIn', 'Indeed', 'ZipRecruiter', 'Glassdoor', 'Company site', 'Referral'];

export default function ApplicationModal({
  open, draft, onClose, onFiled,
}: {
  open: boolean;
  draft: ApplicationDraft | null;
  onClose: () => void;
  onFiled: (title: string) => void;
}) {
  const [data, setData] = React.useState<MyClients | null>(null);
  const [form, setForm] = React.useState({
    queuedId: '', clientId: 0, employer: '', role: '', board: BOARDS[0], matchScore: '',
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setData(null);

    api<MyClients>('/api/my/clients')
      .then(async (mine) => {
        if (mine.clients.length > 0) return mine;
        const all = await api<{ clients: any[] }>('/api/clients?days=30');
        return {
          clients: all.clients.map((c) => ({ id: c.id, name: c.name, color: c.color, targetRole: c.targetRole, status: c.status })),
          queued: [],
        } as MyClients;
      })
      .then(setData)
      .catch(() => setData({ clients: [], queued: [] }));
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const lead = data?.queued.find((q) => q.id === draft?.queuedId);
    const client = data?.clients.find((c) => c.id === draft?.clientId);
    setForm({
      queuedId: draft?.queuedId || '',
      clientId: draft?.clientId || lead?.clientId || client?.id || 0,
      employer: draft?.employer || lead?.employer || '',
      role: draft?.role || lead?.role || client?.targetRole || '',
      board: draft?.board || lead?.board || BOARDS[0],
      matchScore: draft?.matchScore != null ? String(draft.matchScore) : lead?.matchScore != null ? String(lead.matchScore) : '',
    });
  }, [open, draft, data]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = form.queuedId
        ? { queuedId: form.queuedId }
        : {
            clientId: Number(form.clientId),
            employer: form.employer.trim(),
            role: form.role.trim(),
            board: form.board,
            matchScore: form.matchScore === '' ? null : Number(form.matchScore),
          };
      const result = await post<{ id: string }>('/api/applications', payload);

      await agentClient.log({
        type: 'application_submitted',
        board: form.board,
        employer: form.employer.trim(),
        role: form.role.trim(),
        client: data?.clients.find((c) => c.id === form.clientId)?.name,
        detail: result?.id ? `ref ${result.id}` : undefined,
      }).catch(() => { /* the console write still counts */ });

      onFiled(`${form.employer.trim() || 'Application'} · ${form.role.trim() || 'role'}`);
      onClose();
    } catch (err: any) {
      setError(String(err?.message || err));
      setBusy(false);
    }
  };

  const leads = data?.queued || [];
  const lead = leads.find((q) => q.id === form.queuedId);

  return (
    <Modal open={open} onClose={onClose} title="File an application" width={620}>
      {!data ? (
        <div className="page-loading"><Spinner /></div>
      ) : data.clients.length === 0 ? (
        <Empty>No clients are assigned to you yet. Ask an administrator to add you to a search.</Empty>
      ) : (
        <form className="form" onSubmit={submit}>
          {lead ? (
            <div className="application-lead">
              <span className="feed-ico green"><Briefcase size={14} /></span>
              <div>
                <strong>{lead.employer} · {lead.role}</strong>
                <small className="muted">{lead.client} · {lead.board} · waiting {lead.ageHours}h</small>
              </div>
              {lead.overdue && <span className="pill pill-warn tiny">past SLA</span>}
            </div>
          ) : (
            <>
              <label className="field">
                <span>Client</span>
                <select
                  value={form.clientId}
                  onChange={(e) => {
                    const id = Number(e.target.value) || 0;
                    const client = data.clients.find((c) => c.id === id);
                    setForm({
                      ...form,
                      clientId: id,
                      role: form.role || client?.targetRole || '',
                    });
                  }}
                  required
                >
                  <option value={0} disabled>Select a client…</option>
                  {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Employer</span>
                  <input value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} placeholder="Shopify" required />
                </label>
                <label className="field">
                  <span>Role</span>
                  <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Senior AI Engineer" required />
                </label>
                <label className="field">
                  <span>Job board</span>
                  <select value={form.board} onChange={(e) => setForm({ ...form, board: e.target.value })}>
                    {BOARDS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Match score (optional)</span>
                  <input
                    type="number" min={0} max={100} value={form.matchScore}
                    onChange={(e) => setForm({ ...form, matchScore: e.target.value })} placeholder="85"
                  />
                </label>
              </div>
            </>
          )}

          {leads.length > 0 && !lead && (
            <div className="application-leads">
              <span className="muted small">Or file one of your queued leads</span>
              <div className="board-chips">
                {leads.slice(0, 6).map((q) => (
                  <button
                    type="button" className="board-chip" key={q.id}
                    onClick={() => setForm({
                      ...form,
                      queuedId: q.id,
                      employer: q.employer,
                      role: q.role,
                      board: q.board,
                      clientId: q.clientId,
                      matchScore: q.matchScore != null ? String(q.matchScore) : form.matchScore,
                    })}
                  >
                    {q.employer} · {q.role}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="alert error">{error}</div>}

          <p className="fineprint">
            The application is added to the client book and marked as filed now. It also appears in your
            desk history on this device.
          </p>

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy || (!form.clientId && !form.queuedId)}>
              <CheckCircle2 size={15} /> {busy ? 'Filing…' : 'Mark as filed'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
