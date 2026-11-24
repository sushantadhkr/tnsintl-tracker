import React from 'react';

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export const fmtHM = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export const fmtClock = (ts: number | null) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const fmtDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

export const relTime = (ts: number) => {
  const diff = Date.now() - ts;
  if (diff < 0) return 'scheduled';
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export const statusMeta: Record<string, { label: string; tone: string }> = {
  working: { label: 'On the clock', tone: 'ok' },
  on_break: { label: 'On break', tone: 'warn' },
  away: { label: 'Away', tone: 'muted' },
  completed: { label: 'Signed off', tone: 'info' },
  absent: { label: 'Not in', tone: 'muted' },
};

export function StatusPill({ status }: { status: string }) {
  const meta = statusMeta[status] || statusMeta.absent;
  return (
    <span className={`pill pill-${meta.tone}`}>
      <i className="dot" /> {meta.label}
    </span>
  );
}

export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `${color}22`, color, borderColor: `${color}44` }}
    >
      {initials(name)}
    </span>
  );
}

export function Card({
  title, subtitle, action, children, className = '', pad = true,
}: {
  title?: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode;
  children: React.ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function Bar({ value, max, color = 'var(--accent)' }: { value: number; max: number; color?: string }) {
  return (
    <span className="bar">
      <span style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%`, background: color }} />
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Modal({
  open, onClose, title, children, width = 560,
}: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; width?: number }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

export function Segmented<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function useNow(interval = 30_000) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}
