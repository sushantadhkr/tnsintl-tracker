const TOKEN_KEY = 'tnsicompass.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 && !path.includes('/auth/login')) {
      setToken(null);
      window.dispatchEvent(new Event('tnsicompass:logout'));
    }
    let message = 'Request failed';
    try {
      const body = await res.json();
      message = body.error || message;
    } catch { /* ignore */ }
    throw new ApiError(message, res.status);
  }
  return res.json();
}

export const post = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const patch = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

export type User = {
  id: number; name: string; email: string; title: string | null;
  role: 'Super Admin' | 'Admin' | 'Team Lead' | 'Employee';
  teamId: number | null; color: string;
};

export type EmployeeRow = {
  id: number; name: string; email: string; title: string | null; role: string;
  color: string; team: string; status: 'working' | 'on_break' | 'away' | 'completed' | 'absent';
  late: boolean; clockIn: number | null; clockOut: number | null;
  clockInLabel: string | null; clockOutLabel: string | null;
  workedSeconds: number; activeSeconds: number; idleSeconds: number; distractionSeconds: number;
  appCount: number; apps: { app: string; category: string; seconds: number }[];
  sites: { domain: string; seconds: number; pages: number }[];
  blockedAttempts: number;
  applicationsToday: number; queuedLeads: number; overdueLeads: number;
  interviewsBooked: number; onTimePct: number | null;
  device: { id: string; name: string; platform: string; status: string; lastSeenAt: number } | null;
};

export type Overview = {
  date: string;
  schedule: { start: string; end: string; graceMinutes: number; mode: string };
  employees: EmployeeRow[];
  kpis: {
    totalEmployees: number; present: number; late: number; absent: number;
    workingNow: number; avgActiveHours: number; focusedPct: number;
    blockedAttempts: number; activeHours: number;
    applicationsToday: number; queuedLeads: number; overdueLeads: number;
    interviewsBooked: number; onTimePct: number; activeClients: number; placedClients: number;
  };
  topBoards: { board: string; count: number }[];
  hourly: { hour: number; focus: number; distraction: number; idle: number }[];
  topApps: { app: string; category: string; seconds: number }[];
  topSites: { domain: string; seconds: number; pages: number }[];
  now: number;
};

export type Assignee = { id: number; name: string; color: string };

export type ClientCv = {
  fileName: string;
  updatedAt: number;
  pages: number;
  atsScore: number;
  summary: string;
  skills: string[];
  experience: { role: string; company: string; period: string; highlights: string[] }[];
  education: { degree: string; school: string; year: string }[];
  certifications: string[];
  links: { label: string; url: string }[];
  languages: string[];
  workAuthorization: string;
};

export type ClientRow = {
  id: number;
  name: string;
  email: string | null;
  targetRole: string | null;
  targetMarket: string | null;
  targetCity: string | null;
  package: string | null;
  packageTier: string | null;
  feeCad: number | null;
  slaHours: number;
  weeklyQuota: number;
  status: 'active' | 'placed' | 'paused';
  color: string;
  assignees: Assignee[];
  applications: number;
  applied: number;
  queued: number;
  interviews: number;
  onTimeRate: number | null;
  avgTurnaroundHours: number | null;
  lastAppliedAt: number | null;
  weeklyApplied: number;
  trend: { day: string; count: number }[];
  cv?: ClientCv | null;
};

export type Application = {
  id: string; clientId: number; client: string; employeeId: number; employee: string; color: string;
  employer: string; role: string; board: string; reference: string; matchScore: number | null;
  status: 'queued' | 'submitted' | 'interview' | 'offer' | 'rejected'; day: string; market?: string;
  queuedAt: number; appliedAt: number | null; interviewAt: number | null;
  turnaroundHours: number | null; onTime: boolean | null;
};

export type EfficiencyRow = {
  userId: number; name: string; color: string; role: string;
  clients: number; applications: number; submitted: number; queued: number; interviews: number;
  onTimeRate: number | null; avgTurnaroundHours: number | null;
  activeHours: number; perActiveHour: number | null;
};

export type Policy = { id: number; org_id: number; kind: 'allow' | 'block'; domain: string; note: string | null; created_at: number };