/*
 * Desktop agent client.
 *
 * In the Electron app this talks to the main process through the preload
 * bridge (window.agent). On the web demo there is no agent, so a small
 * localStorage implementation keeps the workspace usable in preview mode —
 * check-ins persist in the browser, the embedded desk browser is unavailable.
 */

import React from 'react';
import { api, type User } from './api';

export type AgentDevice = {
  id: string;
  name: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  status: 'active' | 'revoked';
  registeredAt: number;
  lastSeenAt: number;
  userId?: number | null;
  userName?: string | null;
  email?: string | null;
  color?: string | null;
};

export type AgentBreak = {
  id: string;
  start: number;
  end: number | null;
};

export type AgentShift = {
  id: string;
  date: string;
  clockIn: number;
  clockOut: number | null;
  breaks?: AgentBreak[];
  late: boolean;
};

export type AgentEventType =
  | 'session_started'
  | 'session_ended'
  | 'break_started'
  | 'break_ended'
  | 'browser_navigation'
  | 'application_submitted'
  | 'block_attempt';

export type AgentEvent = {
  id: string;
  ts: number;
  type: AgentEventType;
  domain?: string;
  url?: string;
  title?: string;
  detail?: string;
  board?: string;
  employer?: string;
  role?: string;
  client?: string;
};

export type AgentPolicy = {
  mode: 'allowlist' | 'blocklist';
  allow: string[];
  block: string[];
  schedule: { start: string; end: string; graceMinutes: number };
};

export type AgentBootstrap = {
  device: AgentDevice;
  shift: AgentShift | null;
  shifts: AgentShift[];
  events: AgentEvent[];
  policy: AgentPolicy | null;
  onBreak: boolean;
  breakStartedAt: number | null;
  breakSecondsToday: number;
  platform: string;
  appVersion: string;
  now: number;
};

export type BrowserTab = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  active: boolean;
};

export type BrowserState = {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  visible: boolean;
  tabs: BrowserTab[];
};

export type BlockedInfo = {
  domain: string;
  url: string;
  reason: string;
  ts: number;
};

export type AgentClient = {
  isElectron: boolean;
  bootstrap: () => Promise<AgentBootstrap>;
  identify: (user: User) => Promise<AgentDevice>;
  clockIn: () => Promise<AgentShift>;
  clockOut: () => Promise<AgentShift | null>;
  startBreak: () => Promise<AgentBreak>;
  endBreak: () => Promise<AgentBreak | null>;
  log: (event: Partial<AgentEvent> & { type: AgentEventType }) => Promise<AgentEvent>;
  setPolicy: (policy: AgentPolicy) => Promise<unknown>;
  setDeviceStatus: (status: 'active' | 'revoked') => Promise<AgentDevice>;
  openExternal: (url: string) => Promise<unknown>;
  onChanged: (callback: (event: AgentEvent | null) => void) => () => void;
  browser: {
    open: (url: string) => Promise<void>;
    close: () => Promise<void>;
    navigate: (url: string) => Promise<void>;
    newTab: (url?: string) => Promise<string | null>;
    closeTab: (id: string) => Promise<void>;
    selectTab: (id: string) => Promise<void>;
    action: (name: 'back' | 'forward' | 'reload' | 'stop' | 'home') => Promise<void>;
    state: () => Promise<BrowserState | null>;
    visible: (visible: boolean) => void;
    bounds: (rect: { x: number; y: number; width: number; height: number }) => void;
    onState: (callback: (state: BrowserState) => void) => () => void;
    onBlocked: (callback: (info: BlockedInfo) => void) => () => void;
  };
};

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/* ------------------------------------------------------------ web preview */

const LOCAL_KEY = 'tnsi.agent.v1';

type LocalState = {
  device: AgentDevice;
  shifts: AgentShift[];
  events: AgentEvent[];
  policy: AgentPolicy | null;
};

function freshLocal(): LocalState {
  const now = Date.now();
  return {
    device: {
      id: 'dev-browser-preview',
      name: 'Browser preview',
      platform: 'Web',
      osVersion: 'Browser',
      appVersion: '1.1.0',
      status: 'active',
      registeredAt: now,
      lastSeenAt: now,
    },
    shifts: [],
    events: [],
    policy: null,
  };
}

function readLocal(): LocalState {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    if (!raw) return freshLocal();
    return {
      ...freshLocal(),
      ...raw,
      device: { ...freshLocal().device, ...(raw.device || {}) },
      shifts: Array.isArray(raw.shifts) ? raw.shifts : [],
      events: Array.isArray(raw.events) ? raw.events : [],
    };
  } catch {
    return freshLocal();
  }
}

function writeLocal(state: LocalState) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch { /* storage may be full or disabled */ }
}

const localListeners = new Set<(event: AgentEvent | null) => void>();

function emitLocal(event: AgentEvent | null) {
  localListeners.forEach((listener) => listener(event));
}

function minutesOfDay(value: string) {
  const [h, m] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function localIsLate(date: Date, schedule?: AgentPolicy['schedule']) {
  const start = minutesOfDay(schedule?.start || '09:00');
  if (start === null) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return now > start + (Number(schedule?.graceMinutes) || 0);
}

function localEvent(entry: Partial<AgentEvent> & { type: AgentEventType }): AgentEvent {
  return {
    id: 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    ts: Date.now(),
    ...entry,
  };
}

const unavailable = async () => {
  throw new Error('The desk browser is only available in the desktop app.');
};

function localBreakSecondsToday(state: LocalState, now = Date.now()) {
  const key = dayKey();
  return state.shifts
    .filter((s) => s.date === key)
    .reduce(
      (sum, s) => sum + (s.breaks || []).reduce((inner, b) => inner + Math.max(0, (b.end || now) - b.start), 0),
      0
    ) / 1000;
}

function localOpenBreak(state: LocalState) {
  const shift = state.shifts.find((s) => !s.clockOut);
  return shift?.breaks?.find((b) => !b.end) || null;
}

const localClient: AgentClient = {
  isElectron: false,

  async bootstrap() {
    const state = readLocal();
    const today = state.shifts.find((s) => s.date === dayKey()) || null;
    const openBreak = localOpenBreak(state);
    state.device.lastSeenAt = Date.now();
    writeLocal(state);
    return {
      device: state.device,
      shift: today,
      shifts: state.shifts.slice(0, 30),
      events: state.events.slice(0, 400),
      policy: state.policy,
      onBreak: Boolean(openBreak),
      breakStartedAt: openBreak ? openBreak.start : null,
      breakSecondsToday: localBreakSecondsToday(state),
      platform: 'web',
      appVersion: '1.1.0',
      now: Date.now(),
    };
  },

  async identify(user) {
    const state = readLocal();
    const first = String(user?.name || '').trim().split(/\s+/)[0];
    state.device = {
      ...state.device,
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      email: user?.email ?? null,
      color: user?.color ?? null,
      name: first ? `${first} | Web preview` : state.device.name,
      lastSeenAt: Date.now(),
    };
    writeLocal(state);
    return state.device;
  },

  async clockIn() {
    const state = readLocal();
    if (state.device.status === 'revoked') {
      throw new Error('This device has been revoked. Ask an administrator to restore it.');
    }
    const open = state.shifts.find((s) => !s.clockOut);
    if (open) return open;
    const now = Date.now();
    const shift: AgentShift = {
      id: 'shift-' + now.toString(36),
      date: dayKey(),
      clockIn: now,
      clockOut: null,
      breaks: [],
      late: localIsLate(new Date(now), state.policy?.schedule),
    };
    state.shifts.unshift(shift);
    state.events.unshift(localEvent({ type: 'session_started', detail: shift.late ? 'Late arrival' : 'On time' }));
    writeLocal(state);
    emitLocal(null);
    return shift;
  },

  async clockOut() {
    const state = readLocal();
    const open = state.shifts.find((s) => !s.clockOut);
    if (!open) return null;
    const running = open.breaks?.find((b) => !b.end);
    if (running) running.end = Date.now();
    open.clockOut = Date.now();
    state.events.unshift(
      localEvent({
        type: 'session_ended',
        detail: `${Math.max(1, Math.round((open.clockOut - open.clockIn) / 60000))} min`,
      })
    );
    writeLocal(state);
    emitLocal(null);
    return open;
  },

  async startBreak() {
    const state = readLocal();
    if (state.device.status === 'revoked') {
      throw new Error('This device has been revoked. Ask an administrator to restore it.');
    }
    const shift = state.shifts.find((s) => !s.clockOut);
    if (!shift) throw new Error('Clock in before taking a break.');
    const running = shift.breaks?.find((b) => !b.end);
    if (running) return running;
    const now = Date.now();
    const brk: AgentBreak = { id: 'break-' + now.toString(36), start: now, end: null };
    shift.breaks = [...(shift.breaks || []), brk];
    state.events.unshift(localEvent({ type: 'break_started', detail: 'Break started' }));
    writeLocal(state);
    emitLocal(null);
    return brk;
  },

  async endBreak() {
    const state = readLocal();
    const shift = state.shifts.find((s) => !s.clockOut);
    const running = shift?.breaks?.find((b) => !b.end);
    if (!running) return null;
    running.end = Date.now();
    state.events.unshift(
      localEvent({
        type: 'break_ended',
        detail: `${Math.max(1, Math.round(((running.end || Date.now()) - running.start) / 60000))} min break`,
      })
    );
    writeLocal(state);
    emitLocal(null);
    return running;
  },

  async log(entry) {
    const state = readLocal();
    const saved = localEvent(entry);
    state.events.unshift(saved);
    if (state.events.length > 1000) state.events.length = 1000;
    writeLocal(state);
    emitLocal(saved);
    return saved;
  },

  async setPolicy(policy) {
    const state = readLocal();
    state.policy = policy;
    writeLocal(state);
    emitLocal(null);
    return policy;
  },

  async setDeviceStatus(status) {
    const state = readLocal();
    state.device.status = status;
    writeLocal(state);
    emitLocal(null);
    return state.device;
  },

  async openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  onChanged(callback) {
    localListeners.add(callback);
    return () => localListeners.delete(callback);
  },

  browser: {
    open: unavailable,
    close: async () => undefined,
    navigate: unavailable,
    newTab: unavailable,
    closeTab: async () => undefined,
    selectTab: async () => undefined,
    action: unavailable,
    state: async () => null,
    visible: () => undefined,
    bounds: () => undefined,
    onState: () => () => undefined,
    onBlocked: () => () => undefined,
  },
};

const desktop = (window as any).agent as AgentClient | undefined;

export const agentClient: AgentClient = desktop?.isElectron ? desktop : localClient;
export const isDesktop = Boolean(desktop?.isElectron);

/* ------------------------------------------------------------ shared bits */

export async function syncPolicyFromApi(): Promise<AgentPolicy> {
  const [policies, boot] = await Promise.all([
    api<{ mode: 'allowlist' | 'blocklist'; policies: { kind: string; domain: string }[] }>('/api/policies'),
    api<{ org: { schedule: AgentPolicy['schedule'] } }>('/api/bootstrap'),
  ]);
  const policy: AgentPolicy = {
    mode: policies.mode,
    allow: policies.policies.filter((p) => p.kind === 'allow').map((p) => p.domain),
    block: policies.policies.filter((p) => p.kind === 'block').map((p) => p.domain),
    schedule: boot.org.schedule,
  };
  await agentClient.setPolicy(policy);
  return policy;
}

/** Bootstrap the agent and re-read it whenever the main process reports a change. */
export function useAgent() {
  const [data, setData] = React.useState<AgentBootstrap | null>(null);
  const [version, setVersion] = React.useState(0);

  const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

  React.useEffect(() => {
    let alive = true;
    const load = () => {
      agentClient
        .bootstrap()
        .then((next) => { if (alive) setData(next); })
        .catch(() => { /* agent unavailable */ });
    };
    load();
    const off = agentClient.onChanged(load);
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      off();
      clearInterval(timer);
    };
  }, [version]);

  return { data, refresh };
}

export function todayEvents(data: AgentBootstrap | null): AgentEvent[] {
  if (!data) return [];
  const from = startOfToday();
  return data.events.filter((event) => event.ts >= from);
}
