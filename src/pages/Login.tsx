import React from 'react';
import { ArrowRight, Compass, Laptop, ShieldCheck, UserRound } from 'lucide-react';
import { api, setToken, type User } from '../api';
import { DEMO } from '../demo';
import { Spinner } from '../ui';

const DEMO = [
  { email: 'aashika@tnsintl.com', label: 'Aashika · Director' },
  { email: 'suman@tnsintl.com', label: 'Suman · Placement Manager' },
  { email: 'prakriti@tnsintl.com', label: 'Prakriti · Senior Consultant' },
];

export default function Login({ onDone }: { onDone: (u: User) => void }) {
  const [email, setEmail] = React.useState('aashika@tnsintl.com');
  const [password, setPassword] = React.useState('demo1234');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      onDone(res.user);
    } catch (err: any) {
      setError(err.message || 'Could not sign in');
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <div className="login-brand">
          <span className="brand-mark"><Compass size={18} /></span>
          <strong>TNSI Compass</strong>
        </div>
        <h1>Every placement,<br /><em>in view.</em></h1>
        <p className="login-lede">
          The placement desk for The Next Step International: consultant shifts,
          applications filed for every job seeker, SLA turnaround, interviews and
          job-board browsing in one calm workspace.
        </p>
        <ul className="login-points">
          <li><Laptop size={16} /> Desktop agent logs approved job-board work as it happens</li>
          <li><ShieldCheck size={16} /> Job-board-only browsing, enforced on the device</li>
          <li><UserRound size={16} /> Consultants see only the clients assigned to them</li>
        </ul>
        <div className="login-foot">Prototype build · The Next Step International · Kathmandu → Canada · Australia · UK · UAE</div>
      </div>

      <div className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <h2>Sign in to the desk</h2>
          <p className="muted">Use a demo account below to explore the workspace.</p>

          <label className="field">
            <span>Work email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" />
          </label>
          <label className="field">
            <span>Password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="btn primary block" disabled={busy}>
            {busy ? <Spinner /> : <>Sign in <ArrowRight size={16} /></>}
          </button>

          <div className="demo-accounts">
            <span className="muted small">Quick switch</span>
            {DEMO.map((d) => (
              <button type="button" key={d.email} onClick={() => { setEmail(d.email); setPassword('demo1234'); }}>
                {d.label}
              </button>
            ))}
          </div>
          <p className="fineprint">
            Password for every demo account is <code>demo1234</code>.
            {DEMO && <> This is a static demo — no server, no tracking. Everything you change stays in this browser.</>}
          </p>
        </form>
      </div>
    </div>
  );
}