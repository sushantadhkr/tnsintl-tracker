/*
 * Static demo adapter.
 *
 * The console normally talks to the Express API. On GitHub Pages there is no
 * server, so this module installs a tiny in-browser API backed by localStorage.
 * It is loaded only when VITE_DEMO=1; the production console is untouched.
 *
 * All records are fictional. Data is seeded from public/demo-data.json, shifted
 * to the visitor's current day, and kept in this browser. Nothing leaves the page.
 */

export const DEMO = import.meta.env.VITE_DEMO === '1';

const KEY = 'tnsi-tracker.demo.v1';
const PASSWORD = 'demo1234';
const BASE = import.meta.env.BASE_URL;

let db: any = null;
let loading: Promise<void> | null = null;
let installEvent: any = null;

/* --------------------------------------------------------------- utilities */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dayKey(new Date());

function shiftDateString(value: string, deltaDays: number) {
  return value.replace(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, (_m, y, m, d) => {
    const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
    date.setDate(date.getDate() + deltaDays);
    return dayKey(date);
  });
}

const EPOCH_KEY = /(At|_at|^ts$|^now$|^clockIn$|^clockOut$|^generatedAt$|^created_at$)/;

function shiftSnapshot(raw: any) {
  const base = new Date(raw.date + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deltaDays = Math.round((now.getTime() - base.getTime()) / 86400000);
  const deltaMs = deltaDays * 86400000;

  const walk = (value: any, key = ''): any => {
    if (typeof value === 'string') return deltaDays ? shiftDateString(value, deltaDays) : value;
    if (typeof value === 'number') {
      if (EPOCH_KEY.test(key) && Math.abs(value) > 100000000000) return value + deltaMs;
      return value;
    }
    if (Array.isArray(value)) return value.map((v) => walk(v));
    if (value && typeof value === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v, k);
      return out;
    }
    return value;
  };

  const out = walk(raw);
  const shiftKey = (k: string) => (deltaDays ? shiftDateString(k, deltaDays) : k);
  for (const bucket of ['overviews', 'reports'] as const) {
    const next: any = {};
    for (const [k, v] of Object.entries(raw[bucket] || {})) next[shiftKey(k)] = out[bucket][k];
    out[bucket] = next;
  }
  out.date = shiftDateString(raw.date, deltaDays);

  // Keep the "online now" story believable: active devices that were seen in the
  // ten minutes before the snapshot stay just as recent after the date shift.
  const generated = out.generatedAt || Date.now();
  for (const device of out.devices?.devices || []) {
    if (device.status === 'active' && generated - device.last_seen_at < 10 * 60_000) {
      device.last_seen_at = Date.now() - (generated - device.last_seen_at);
    }
  }
  out.overview = out.overviews[out.date] || out.overview;
  return out;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ ...db, savedAt: Date.now() })); } catch { /* quota */ }
}

function seed(raw: any) {
  const data = shiftSnapshot(raw);
  data.seedDate = today();
  data.accounts = raw.accounts;
  db = data;
  persist();
}

async function ready() {
  if (db) return;
  if (!loading) {
    loading = (async () => {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.seedDate === today()) { db = parsed; return; }
        } catch { /* reseed */ }
      }
      const res = await fetch(BASE + 'demo-data.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Could not load the demo dataset');
      seed(await res.json());
    })();
  }
  await loading;
}

/* --------------------------------------------------------------- responses */
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, message: string) => { const e: any = new Error(message); e.status = status; throw e; };
const ok = (extra: any = {}) => ({ ok: true, ...extra });

function tokenUser(headers: any) {
  const h = new Headers(headers || {});
  const auth = h.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token.startsWith('demo:')) return null;
  return db.accounts[token.slice(5).toLowerCase()] || null;
}

const assignedClients = (userId: number) =>
  db.clients.clients.filter((c: any) => c.assignees?.some((a: any) => a.id === userId));

const findApplication = (id: string) => {
  const pools = [
    db.applications.applications,
    ...Object.values(db.clientDetails).map((d: any) => d.applications),
    ...Object.values(db.employeeDetails).map((d: any) => d.applications),
    db.myClients.queued,
    db.myClients.recent,
  ];
  for (const pool of pools) {
    const found = (pool || []).find((a: any) => a.id === id);
    if (found) return found;
  }
  return null;
};

function patchApplication(id: string, patch: any) {
  const pools = [
    db.applications.applications,
    ...Object.values(db.clientDetails).map((d: any) => d.applications),
    ...Object.values(db.employeeDetails).map((d: any) => d.applications),
    db.myClients.queued,
    db.myClients.recent,
  ];
  for (const pool of pools) {
    for (const app of pool || []) if (app.id === id) Object.assign(app, patch);
  }
}

function audit(action: string, target: string, detail: string, actor: string) {
  const id = Math.max(0, ...db.audit.logs.map((l: any) => l.id)) + 1;
  db.audit.logs.unshift({ id, actor, action, target, detail, ts: Date.now() });
}

function touchClient(clientId: number, onTime: boolean, conversion = true) {
  const client = db.clients.clients.find((c: any) => c.id === clientId);
  if (!client) return;
  const previous = client.applied || 0;
  client.applications += 1;
  client.applied = previous + 1;
  client.weeklyApplied += 1;
  client.lastAppliedAt = Date.now();
  if (conversion) client.queued = Math.max(0, client.queued - 1);
  const priorOnTime = client.onTimeRate == null ? 0 : (client.onTimeRate / 100) * previous;
  client.onTimeRate = Math.round(((priorOnTime + (onTime ? 1 : 0)) / client.applied) * 100);
  const detail = db.clientDetails[client.id];
  if (detail) detail.client = client;
}

function touchOverview(board: string, userId: number, conversion: boolean) {
  const o = db.overviews[db.date] || db.overview;
  if (!o) return;
  o.kpis.applicationsToday += 1;
  if (conversion) o.kpis.queuedLeads = Math.max(0, o.kpis.queuedLeads - 1);
  const boardRow = o.topBoards.find((b: any) => b.board === board);
  if (boardRow) boardRow.count += 1;
  else o.topBoards.push({ board, count: 1 });
  for (const list of [o.employees, db.employees.employees]) {
    const person = list.find((e: any) => e.id === userId);
    if (person) {
      person.applicationsToday = (person.applicationsToday || 0) + 1;
      if (conversion) person.queuedLeads = Math.max(0, (person.queuedLeads || 0) - 1);
    }
  }
  db.overview = o;
}

/* --------------------------------------------------------------- handlers */
function overview(date?: string) {
  if (date && date !== db.date) {
    const day = db.overviews[date];
    if (!day) fail(404, 'No overview for that date');
    return clone(day);
  }
  return clone(db.overviews[db.date] || db.overview);
}

function clients(url: URL) {
  const status = url.searchParams.get('status') || '';
  const employeeId = Number(url.searchParams.get('employeeId')) || 0;
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const pack = url.searchParams.get('package') || '';
  const rows = db.clients.clients.filter((c: any) => {
    if (status && c.status !== status) return false;
    if (employeeId && !c.assignees?.some((a: any) => a.id === employeeId)) return false;
    if (pack && c.package !== pack) return false;
    if (q && !`${c.name} ${c.email || ''} ${c.targetRole || ''} ${c.targetCity || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  return { days: Number(url.searchParams.get('days')) || 30, clients: clone(rows) };
}

function clientDetail(id: number) {
  const detail = db.clientDetails[id];
  if (detail) return clone(detail);
  const client = db.clients.clients.find((c: any) => c.id === id);
  if (!client) fail(404, 'Client not found');
  return { client: clone(client), applications: [], days: 30 };
}

function applications(url: URL) {
  const days = Math.min(120, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const cutoff = Date.now() - days * 86400000;
  const clientId = Number(url.searchParams.get('clientId')) || 0;
  const employeeId = Number(url.searchParams.get('employeeId')) || 0;
  const board = url.searchParams.get('board') || '';
  const status = url.searchParams.get('status') || '';
  const rows = db.applications.applications.filter((a: any) => {
    const when = a.appliedAt || a.queuedAt || 0;
    if (when < cutoff) return false;
    if (clientId && a.clientId !== clientId) return false;
    if (employeeId && a.employeeId !== employeeId) return false;
    if (board && a.board !== board) return false;
    if (status === 'applied' && !a.appliedAt) return false;
    if (status && status !== 'applied' && a.status !== status) return false;
    return true;
  });
  return { days, applications: clone(rows.slice(0, 200)) };
}

function myClients(user: any) {
  const mine = assignedClients(user.id);
  const all = db.applications.applications;
  const queued = all
    .filter((a: any) => a.employeeId === user.id && a.status === 'queued')
    .map((a: any) => {
      const c = db.clients.clients.find((x: any) => x.id === a.clientId) || {};
      const ageHours = +((Date.now() - a.queuedAt) / 3600000).toFixed(1);
      return {
        id: a.id, clientId: a.clientId, employer: a.employer, role: a.role, board: a.board,
        matchScore: a.matchScore, queuedAt: a.queuedAt, client: c.name, color: c.color,
        slaHours: c.slaHours, ageHours, overdue: ageHours > (c.slaHours || 24),
      };
    });
  const recent = all
    .filter((a: any) => a.employeeId === user.id && a.status !== 'queued')
    .slice(0, 25)
    .map((a: any) => {
      const c = db.clients.clients.find((x: any) => x.id === a.clientId) || {};
      return { ...a, client: c.name, color: c.color, slaHours: c.slaHours };
    });
  return { clients: clone(mine), queued, recent, days: 30 };
}

function addApplication(user: any, body: any) {
  const now = Date.now();
  let app: any;
  if (body.queuedId) {
    app = findApplication(body.queuedId);
    if (!app) fail(404, 'That lead is no longer waiting');
    if (app.status !== 'queued') fail(409, 'That lead has already been filed');
    const client = db.clients.clients.find((c: any) => c.id === app.clientId);
    const turnaround = +((now - app.queuedAt) / 3600000).toFixed(1);
    Object.assign(app, {
      status: 'submitted', day: db.date, appliedAt: now, interviewAt: null,
      turnaroundHours: turnaround,
      onTime: turnaround <= (client?.slaHours || 24),
      employeeId: app.employeeId || user.id,
    });
    patchApplication(app.id, app);
    db.myClients.queued = db.myClients.queued.filter((a: any) => a.id !== app.id);
    touchClient(app.clientId, app.onTime);
    touchOverview(app.board, app.employeeId || user.id, true);
    audit('application.submitted', `${app.client} · ${app.employer}`, `${app.board} · ${turnaround}h turnaround`, user.name);
  } else {
    if (!body.clientId || !body.employer?.trim() || !body.role?.trim()) fail(400, 'Client, employer and role are required');
    const client = db.clients.clients.find((c: any) => c.id === Number(body.clientId));
    if (!client) fail(404, 'Client not found');
    const id = 'demo-' + now;
    const reference = 'TNSI-DM-' + String(Math.floor(1000 + Math.random() * 9000));
    app = {
      id, clientId: client.id, client: client.name, employeeId: user.id, employee: user.name, color: user.color,
      employer: body.employer.trim(), role: body.role.trim(), board: body.board || 'LinkedIn', reference,
      matchScore: body.matchScore || null, status: 'submitted', day: db.date,
      market: client.targetMarket, queuedAt: now, appliedAt: now, interviewAt: null,
      turnaroundHours: 0, onTime: true,
    };
    db.applications.applications.unshift(app);
    const detail = db.clientDetails[client.id];
    if (detail) detail.applications.unshift(app);
    const person = db.employeeDetails[user.id];
    if (person) person.applications.unshift(app);
    db.myClients.recent.unshift(app);
    touchClient(client.id, true, false);
    touchOverview(app.board, user.id, false);
    audit('application.submitted', `${client.name} · ${app.employer}`, `${app.board} · filed by ${user.name}`, user.name);
  }
  persist();
  return ok({ id: app.id, reference: app.reference });
}

function addClient(user: any, body: any) {
  if (!body.name?.trim()) fail(400, 'Client name is required');
  const id = Math.max(0, ...db.clients.clients.map((c: any) => c.id)) + 1;
  const palette = ['#297cbb', '#0f7a68', '#6f4bb0', '#c47f1a', '#a05a8c'];
  const assignees = (body.assignedTo || [])
    .map((userId: number) => db.employees.employees.find((e: any) => e.id === Number(userId)))
    .filter(Boolean)
    .map((e: any) => ({ id: e.id, name: e.name, color: e.color }));
  const trend = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (9 - i));
    return { day: dayKey(d), count: 0 };
  });
  const client = {
    id, name: body.name.trim(), email: body.email || null, targetRole: body.targetRole || null,
    targetMarket: body.targetMarket || null, targetCity: body.targetCity || null,
    package: body.package || null, packageTier: body.packageTier || null, feeCad: body.feeCad ?? null,
    slaHours: Number(body.slaHours) || 24, weeklyQuota: Number(body.weeklyQuota) || 12,
    status: 'active', color: palette[id % palette.length], assignees,
    applications: 0, applied: 0, queued: 0, interviews: 0, onTimeRate: null,
    avgTurnaroundHours: null, lastAppliedAt: null, weeklyApplied: 0, trend,
  };
  db.clients.clients.unshift(client);
  db.clientDetails[id] = { client, applications: [], days: 30 };
  const o = db.overviews[db.date] || db.overview;
  if (o) { o.kpis.activeClients += 1; db.overview = o; }
  audit('client.created', client.name, `${client.package || 'No package'} · ${client.targetMarket || ''}`, user.name);
  persist();
  return ok({ id });
}

/* --------------------------------------------------------------- router */
async function route(input: string, init: RequestInit = {}) {
  await ready();
  const url = new URL(input, location.origin);
  const path = url.pathname;
  const method = (init.method || 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? JSON.parse(init.body || '{}') : (init.body || {});
  const user = tokenUser(init.headers);

  if (path.endsWith('/api/auth/login') && method === 'POST') {
    const email = String(body.email || '').toLowerCase();
    const account = db.accounts[email];
    if (!account || body.password !== PASSWORD) fail(401, 'Use a demo account and the password demo1234');
    return json({ token: 'demo:' + email, user: account });
  }
  if (path.endsWith('/api/me')) {
    if (!user) fail(401, 'Not signed in');
    return json({ user });
  }
  if (!user) fail(401, 'Not signed in');

  if (path.endsWith('/api/bootstrap')) return json({ ...db.bootstrap, user });
  if (path.endsWith('/api/overview')) return json(overview(url.searchParams.get('date') || undefined));
  if (path.endsWith('/api/employees') && method === 'GET') return json(db.employees);
  if (path.endsWith('/api/employees') && method === 'POST') {
    const id = Math.max(0, ...db.employees.employees.map((e: any) => e.id), ...Object.values(db.accounts).map((a: any) => a.id)) + 1;
    const employee = {
      id, name: body.name, email: body.email, title: body.title || null, role: body.role || 'Employee',
      color: '#297cbb', team: db.employees.teams.find((t: any) => t.id === Number(body.teamId))?.name || 'Placement Desk',
      status: 'absent', late: false, clockIn: null, clockOut: null, clockInLabel: null, clockOutLabel: null,
      workedSeconds: 0, activeSeconds: 0, idleSeconds: 0, distractionSeconds: 0, appCount: 0,
      apps: [], sites: [], blockedAttempts: 0, applicationsToday: 0, queuedLeads: 0,
      overdueLeads: 0, interviewsBooked: 0, onTimePct: null, device: null,
    };
    db.employees.employees.push(employee);
    db.employeeDetails[id] = { employee, history: [], events: [], week: [], applications: [], devices: [] };
    db.accounts[String(body.email).toLowerCase()] = {
      id, name: body.name, email: body.email, title: body.title || null,
      role: body.role || 'Employee', teamId: Number(body.teamId) || null, color: '#297cbb',
    };
    audit('employee.created', body.name, body.email, user.name);
    persist();
    return json(ok({ id }));
  }
  const emp = path.match(/\/api\/employees\/(\d+)$/);
  if (emp) {
    const id = Number(emp[1]);
    const detail = db.employeeDetails[id];
    if (method === 'GET') {
      if (!detail) fail(404, 'Employee not found');
      return json(clone(detail));
    }
    if (method === 'PATCH') {
      Object.assign(detail.employee, body);
      const row = db.employees.employees.find((e: any) => e.id === id);
      if (row) Object.assign(row, body);
      persist();
      return json(ok());
    }
  }
  if (path.endsWith('/api/clients') && method === 'GET') return json(clients(url));
  if (path.endsWith('/api/clients') && method === 'POST') return json(addClient(user, body));
  const cli = path.match(/\/api\/clients\/(\d+)$/);
  if (cli) {
    const id = Number(cli[1]);
    if (method === 'GET') return json(clientDetail(id));
    if (method === 'PATCH') {
      const detail = db.clientDetails[id];
      if (!detail) fail(404, 'Client not found');
      Object.assign(detail.client, body);
      const row = db.clients.clients.find((c: any) => c.id === id);
      if (row) Object.assign(row, body);
      audit('client.updated', detail.client.name, 'Client record updated', user.name);
      persist();
      return json(ok());
    }
  }
  if (path.endsWith('/api/applications') && method === 'GET') return json(applications(url));
  if (path.endsWith('/api/applications') && method === 'POST') return json(addApplication(user, body));
  if (path.endsWith('/api/efficiency')) return json(db.efficiency);
  if (path.endsWith('/api/reports/daily')) {
    const date = url.searchParams.get('date') || db.date;
    const report = db.reports[date];
    if (!report) fail(404, 'No report for that date');
    return json(clone(report));
  }
  if (path.endsWith('/api/live')) {
    const since = Number(url.searchParams.get('since')) || 0;
    return json({ events: db.live.events.filter((e: any) => e.ts >= since), blocked: clone(db.live.blocked) });
  }
  if (path.endsWith('/api/audit')) return json(db.audit);
  if (path.endsWith('/api/devices')) return json(db.devices);
  if (path.endsWith('/api/policies') && method === 'GET') return json(db.policies);
  if (path.endsWith('/api/policies') && method === 'POST') {
    const id = Math.max(0, ...db.policies.policies.map((p: any) => p.id)) + 1;
    db.policies.policies.push({ id, org_id: 1, kind: body.kind, domain: body.domain, note: null, created_at: Date.now() });
    audit('policy.added', body.domain, body.kind === 'allow' ? 'Allowed domain' : 'Blocked domain', user.name);
    persist();
    return json(ok({ id }));
  }
  if (path.endsWith('/api/policies/mode') && method === 'POST') {
    db.policies.mode = body.mode;
    const org = db.bootstrap.org;
    org.mode = body.mode;
    audit('policy.mode', body.mode, 'Enforcement mode changed', user.name);
    persist();
    return json(ok());
  }
  if (path.endsWith('/api/org/schedule') && method === 'PATCH') {
    db.bootstrap.org.schedule = { start: body.start, end: body.end, graceMinutes: Number(body.graceMinutes) || 0 };
    const o = db.overviews[db.date] || db.overview;
    if (o) o.schedule = db.bootstrap.org.schedule;
    audit('schedule.updated', `${body.start}–${body.end}`, `Grace period ${body.graceMinutes} min`, user.name);
    persist();
    return json(ok());
  }
  const pol = path.match(/\/api\/policies\/(\d+)$/);
  if (pol && method === 'DELETE') {
    db.policies.policies = db.policies.policies.filter((p: any) => p.id !== Number(pol[1]));
    persist();
    return json(ok());
  }
  const dev = path.match(/\/api\/devices\/([^/]+)\/(revoke|restore)$/);
  if (dev && method === 'POST') {
    const device = db.devices.devices.find((d: any) => d.id === dev[1]);
    if (!device) fail(404, 'Device not found');
    if (dev[2] === 'revoke') { device.status = 'revoked'; device.revoked_at = Date.now(); }
    else { device.status = 'active'; device.revoked_at = null; device.last_seen_at = Date.now(); }
    db.devices.online = db.devices.devices.filter((d: any) => d.status === 'active').length;
    audit(dev[2] === 'revoke' ? 'device.revoked' : 'device.restored', device.name, device.id, user.name);
    persist();
    return json(ok());
  }
  if (path.endsWith('/api/my/clients')) return json(myClients(user));

  fail(404, 'Not found in the static demo');
}

/* --------------------------------------------------------------- install */
export function installDemo() {
  if (!DEMO) return;
  (window as any).__TNSI_DEMO__ = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.includes('/api/')) return original(input, init);
    try {
      return await route(url, init);
    } catch (err: any) {
      return json({ error: err?.message || 'Demo request failed' }, err?.status || 500);
    }
  };

  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    installEvent = event;
    window.dispatchEvent(new Event('tnsi:installable'));
  });

  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(BASE + 'sw.js').catch(() => { /* offline is optional */ });
    }
  });
}

export async function promptInstall() {
  if (!installEvent) return false;
  installEvent.prompt();
  const choice = await installEvent.userChoice;
  installEvent = null;
  return choice?.outcome === 'accepted';
}

export function resetDemo() {
  localStorage.removeItem(KEY);
  location.reload();
}