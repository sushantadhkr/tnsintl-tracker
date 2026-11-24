import React from 'react';
import {
  BarChart3, Briefcase, Clock3, Compass, Globe, Laptop, LayoutDashboard, LogOut,
  Radio, ScrollText, Search, ShieldCheck, Timer, Users, Zap,
} from 'lucide-react';
import { api, getToken, setToken, type User } from './api';
import { DEMO, promptInstall, resetDemo } from './demo';
import { syncPolicyFromApi, agentClient } from './agent';
import { Avatar, Spinner } from './ui';
import { AppCtx } from './ctx';
import ApplicationModal, { type ApplicationDraft } from './ApplicationModal';
import HeaderActions from './HeaderActions';
import Login from './pages/Login';
import MyDesk from './pages/MyDesk';
import DeskBrowser from './pages/DeskBrowser';
import Overview from './pages/Overview';
import Employees from './pages/Employees';
import Clients from './pages/Clients';
import Live from './pages/Live';
import Policies from './pages/Policies';
import Devices from './pages/Devices';
import Reports from './pages/Reports';
import Audit from './pages/Audit';

type PageKey = 'mydesk' | 'browser' | 'overview' | 'employees' | 'clients' | 'live' | 'policies' | 'devices' | 'reports' | 'audit';

const NAV: { key: PageKey; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { key: 'mydesk', label: 'My desk', icon: Timer },
  { key: 'browser', label: 'Desk browser', icon: Globe },
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'employees', label: 'Team', icon: Users },
  { key: 'clients', label: 'Clients', icon: Briefcase },
  { key: 'live', label: 'Live desk', icon: Radio },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'policies', label: 'Browsing policy', icon: ShieldCheck, adminOnly: true },
  { key: 'devices', label: 'Devices', icon: Laptop, adminOnly: true },
  { key: 'audit', label: 'Audit log', icon: ScrollText, adminOnly: true },
];

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [booting, setBooting] = React.useState(true);
  const [page, setPage] = React.useState<PageKey>('overview');
  const [browserUrl, setBrowserUrl] = React.useState('https://www.linkedin.com/jobs/');
  const [tick, setTick] = React.useState(0);
  const [q, setQ] = React.useState('');
  const [live, setLive] = React.useState(false);
  const [installable, setInstallable] = React.useState(false);
  const [applicationOpen, setApplicationOpen] = React.useState(false);
  const [applicationDraft, setApplicationDraft] = React.useState<ApplicationDraft | null>(null);

  const load = React.useCallback(() => {
    if (!getToken()) { setBooting(false); return; }
    api<{ user: User }>('/api/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  React.useEffect(load, [load]);

  React.useEffect(() => {
    const onInstall = () => setInstallable(true);
    window.addEventListener('tnsi:installable', onInstall);
    return () => window.removeEventListener('tnsi:installable', onInstall);
  }, []);

  React.useEffect(() => {
    const onLogout = () => { setUser(null); setPage('overview'); };
    window.addEventListener('tnsicompass:logout', onLogout);
    return () => window.removeEventListener('tnsicompass:logout', onLogout);
  }, []);

  // Consultants land on their own workspace; admins land on the desk overview.
  React.useEffect(() => {
    if (!user) return;
    setPage(user.role === 'Employee' || user.role === 'Team Lead' ? 'mydesk' : 'overview');
    agentClient.identify(user).catch(() => { /* identity is best-effort */ });
  }, [user?.id]);

  // Keep the on-device browsing policy in step with the console.
  React.useEffect(() => {
    if (!user) return;
    const sync = () => { syncPolicyFromApi().catch(() => { /* best-effort */ }); };
    sync();
    const timer = setInterval(sync, 30_000);
    window.addEventListener('focus', sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', sync);
    };
  }, [user, tick]);

  // Live updates: the server pushes a refresh whenever devices sync.
  React.useEffect(() => {
    if (!user) return;
    if (DEMO) { setLive(true); return; }
    const token = getToken();
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(token || '')}`);
    es.addEventListener('ready', () => setLive(true));
    es.onopen = () => setLive(true);
    es.addEventListener('refresh', () => setTick((t) => t + 1));
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [user]);

  if (booting) {
    return (
      <div className="boot">
        <div className="boot-mark"><Compass size={26} /></div>
        <Spinner />
      </div>
    );
  }

  if (!user) return <Login onDone={(u) => { setUser(u); setTick((t) => t + 1); }} />;

  const isAdmin = user.role !== 'Team Lead' && user.role !== 'Employee';
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin);

  const signOut = () => {
    setToken(null);
    setUser(null);
  };

  const fileApplication = (draft?: ApplicationDraft) => {
    setApplicationDraft(draft ?? null);
    setApplicationOpen(true);
  };

  return (
    <AppCtx.Provider value={{ tick, user }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark"><Compass size={18} /></span>
            <div>
              <strong>TNSI Compass</strong>
              <span className="brand-sub">Placement operations</span>
            </div>
          </div>

          <nav className="nav">
            {nav.map((n) => (
              <button
                key={n.key}
                className={`nav-item ${page === n.key ? 'active' : ''}`}
                onClick={() => setPage(n.key)}
              >
                <n.icon size={17} />
                <span>{n.label}</span>
                {n.key === 'live' && live && <i className="live-dot" />}
              </button>
            ))}
          </nav>

          <div className="sidebar-note">
            <div className="sidebar-note-head"><ShieldCheck size={15} /> Transparent by design</div>
            <p>Only work-session activity and approved job-board domains are recorded. No keystrokes, screenshots, passwords or page contents are ever captured.</p>
            {DEMO && (
              <div className="demo-tools">
                {installable && <button className="link-btn" onClick={promptInstall}>Install demo app</button>}
                <button className="link-btn" onClick={resetDemo}>Reset demo data</button>
              </div>
            )}
          </div>

          <div className="profile">
            <Avatar name={user.name} color={user.color} size={34} />
            <div className="profile-meta">
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </div>
            <button className="icon-btn" onClick={signOut} title="Sign out"><LogOut size={16} /></button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="mobile-brand">
              <span className="brand-mark"><Compass size={16} /></span> TNSI Compass
            </div>
            <label className="search">
              <Search size={15} />
              <input
                placeholder="Search consultants, clients, boards…"
                value={q}
                onChange={(e) => { setQ(e.target.value); if (e.target.value) setPage('employees'); }}
              />
            </label>
            <div className="topbar-right">
              <HeaderActions onFile={() => fileApplication()} />
              <span className={`sync ${live ? 'on' : ''}`}>
                <Zap size={13} /> {live ? 'Live sync' : 'Reconnecting…'}
              </span>
              <span className="date-chip">
                <Clock3 size={13} />
                {new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>
          </header>

          <div className={`content ${page === 'browser' ? 'content-flush' : ''}`}>
            {page === 'mydesk' && <MyDesk onOpenBrowser={(url) => { setBrowserUrl(url); setPage('browser'); }} onLogApplication={fileApplication} />}
            {page === 'browser' && <DeskBrowser initialUrl={browserUrl} onClose={() => setPage('mydesk')} />}
            {page === 'overview' && <Overview onOpenEmployee={() => setPage('employees')} goLive={() => setPage('live')} />}
            {page === 'employees' && <Employees query={q} setQuery={setQ} />}
            {page === 'clients' && <Clients />}
            {page === 'live' && <Live />}
            {page === 'policies' && <Policies />}
            {page === 'devices' && <Devices />}
            {page === 'reports' && <Reports />}
            {page === 'audit' && <Audit />}
          </div>
        </main>
      </div>

      <ApplicationModal
        open={applicationOpen}
        draft={applicationDraft}
        onClose={() => setApplicationOpen(false)}
        onFiled={() => setTick((t) => t + 1)}
      />
    </AppCtx.Provider>
  );
}