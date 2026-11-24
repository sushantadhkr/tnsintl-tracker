/*
 * Header quick actions for consultants: break toggle, notifications and a
 * one-tap "file application" shortcut. Break state lives in the desktop agent;
 * notifications are derived from the same local events plus the desk queue.
 */

import React from 'react';
import { Bell, Briefcase, Coffee, Play, Plus, X } from 'lucide-react';
import { api } from './api';
import { agentClient, todayEvents, useAgent } from './agent';
import { useApp } from './ctx';
import { fmtClock, useNow } from './ui';

type Queue = {
  queued: {
    id: string; client: string; employer: string; role: string;
    queuedAt: number; ageHours: number; overdue: boolean; slaHours: number;
  }[];
  clients: { id: number; weeklyQuota: number; weeklyApplied: number }[];
};

type Notice = {
  id: string;
  ts: number;
  tone: 'info' | 'warn' | 'danger' | 'ok';
  title: string;
  body: string;
};

const seenKey = (userId: number) => `tnsi.notices.seen.${userId}`;
const readSeen = (userId: number) => Number(localStorage.getItem(seenKey(userId)) || 0);
const writeSeen = (userId: number, ts: number) => {
  try { localStorage.setItem(seenKey(userId), String(ts)); } catch { /* storage disabled */ }
};

function minutesOfDay(value: string) {
  const [h, m] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export default function HeaderActions({ onFile }: { onFile: () => void }) {
  const { user, tick } = useApp();
  const { data, refresh } = useAgent();
  const now = useNow(15_000);
  const [queue, setQueue] = React.useState<Queue | null>(null);
  const [open, setOpen] = React.useState(false);
  const [seen, setSeen] = React.useState(() => readSeen(user.id));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const wrap = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    api<Queue>('/api/my/clients').then(setQueue).catch(() => setQueue(null));
  }, [tick, user.id]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  React.useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const shift = data?.shift ?? null;
  const onBreak = Boolean(data?.onBreak);
  const canBreak = Boolean(shift && !shift.clockOut);

  const toggleBreak = async () => {
    setBusy(true);
    setError(null);
    try {
      if (onBreak) await agentClient.endBreak();
      else await agentClient.startBreak();
      refresh();
    } catch (err: any) {
      setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''));
    } finally {
      setBusy(false);
    }
  };

  const notices = React.useMemo<Notice[]>(() => {
    const today = todayEvents(data);
    const items: Notice[] = [];

    if (shift?.late) {
      items.push({
        id: 'late', ts: shift.clockIn, tone: 'warn',
        title: 'Late arrival recorded',
        body: `You clocked in at ${fmtClock(shift.clockIn)}, after the grace period.`,
      });
    }
    if (onBreak && data?.breakStartedAt) {
      items.push({
        id: 'break', ts: data.breakStartedAt, tone: 'warn',
        title: 'You are on a break',
        body: `Break started at ${fmtClock(data.breakStartedAt)}. End it when you are back.`,
      });
    }
    const schedule = data?.policy?.schedule;
    if (!shift && schedule) {
      const start = minutesOfDay(schedule.start);
      const current = new Date(now).getHours() * 60 + new Date(now).getMinutes();
      if (start !== null && current > start + (schedule.graceMinutes || 0)) {
        items.push({
          id: 'missing', ts: now - 60_000, tone: 'danger',
          title: 'You have not clocked in',
          body: `Desk hours began at ${schedule.start}. Start a session from My desk.`,
        });
      }
    }

    const blocked = today.filter((event) => event.type === 'block_attempt');
    if (blocked.length > 0) {
      items.push({
        id: 'blocked', ts: blocked[0].ts, tone: 'danger',
        title: `${blocked.length} blocked attempt${blocked.length === 1 ? '' : 's'} today`,
        body: `Latest: ${blocked[0].domain || 'unknown site'} was stopped by policy.`,
      });
    }

    const overdue = (queue?.queued || []).filter((lead) => lead.overdue);
    if (overdue.length > 0) {
      items.push({
        id: 'overdue', ts: Math.max(...overdue.map((lead) => lead.queuedAt)), tone: 'warn',
        title: `${overdue.length} lead${overdue.length === 1 ? '' : 's'} past SLA`,
        body: `${overdue[0].employer} · ${overdue[0].role} has been queued ${overdue[0].ageHours}h.`,
      });
    }
    const waiting = queue?.queued.length || 0;
    if (waiting > 0) {
      items.push({
        id: 'queue', ts: Math.max(...queue!.queued.map((lead) => lead.queuedAt)), tone: 'info',
        title: `${waiting} lead${waiting === 1 ? '' : 's'} waiting in your queue`,
        body: 'File them from the queue card on My desk before the SLA window closes.',
      });
    }

    const applications = today.filter((event) => event.type === 'application_submitted').length;
    if (applications > 0) {
      items.push({
        id: 'applications', ts: today.find((event) => event.type === 'application_submitted')!.ts, tone: 'ok',
        title: `${applications} application${applications === 1 ? '' : 's'} filed today`,
        body: 'Nice work. Keep the queue moving while the boards are fresh.',
      });
    }

    return items.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [data, shift, onBreak, queue, now]);

  const unread = notices.filter((notice) => notice.ts > seen).length;

  const openPanel = () => {
    if (!open) {
      const stamp = Date.now();
      writeSeen(user.id, stamp);
      setSeen(stamp);
    }
    setOpen(!open);
  };

  return (
    <div className="header-actions" ref={wrap}>
      <button
        className={`qa-btn ${onBreak ? 'on' : ''}`}
        onClick={toggleBreak}
        disabled={busy || !canBreak}
        title={canBreak ? (onBreak ? 'End your break' : 'Take a break') : 'Clock in on My desk first'}
      >
        {onBreak ? <Play size={14} /> : <Coffee size={14} />}
        <span>{onBreak ? 'End break' : 'Break'}</span>
        {onBreak && data?.breakStartedAt && <small className="num">{fmtClock(data.breakStartedAt)}</small>}
      </button>

      <button className="qa-btn" onClick={onFile} title="File an application">
        <Plus size={14} />
        <span>File</span>
      </button>

      <div className="notif-wrap">
        <button
          className={`qa-btn icon ${open ? 'on' : ''}`}
          onClick={openPanel}
          aria-label={unread ? `${unread} new notifications` : 'Notifications'}
          title="Notifications"
        >
          <Bell size={15} />
          {unread > 0 && <span className="notif-count">{unread}</span>}
        </button>

        {open && (
          <div className="notif-panel">
            <div className="notif-head">
              <strong>Notifications</strong>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close notifications">
                <X size={14} />
              </button>
            </div>
            {notices.length === 0 ? (
              <p className="notif-empty">You are all caught up. Clock in and the desk will report here.</p>
            ) : (
              <ul className="notif-list">
                {notices.map((notice) => (
                  <li key={notice.id} className={`notif-item ${notice.tone}`}>
                    <i className="notif-dot" />
                    <div>
                      <strong>{notice.title}</strong>
                      <p>{notice.body}</p>
                      <small className="muted">{new Date(notice.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button className="notif-all" onClick={() => { setOpen(false); onFile(); }}>
              <Briefcase size={13} /> File an application
            </button>
          </div>
        )}
      </div>

      {error && <div className="qa-toast">{error}</div>}
    </div>
  );
}
