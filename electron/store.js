/*
 * Local agent store.
 *
 * Everything the desktop agent records lives in one JSON file inside the app's
 * userData folder (no server, no cloud). The file is rewritten atomically after
 * every mutation so a crash cannot leave a half-written store.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { app } = require('electron');

const MAX_EVENTS = 3000;
const KEEP_SHIFTS = 120;

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function platformLabel() {
  if (process.platform === 'darwin') return 'macOS';
  if (process.platform === 'win32') return 'Windows';
  if (process.platform === 'linux') return 'Linux';
  return process.platform;
}

function osVersion() {
  const release = os.release();
  if (process.platform === 'darwin') return `macOS ${release}`;
  if (process.platform === 'win32') return `Windows ${release}`;
  return `${os.type()} ${release}`;
}

function minutesOfDay(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function isLate(date, schedule) {
  const start = minutesOfDay(schedule?.start);
  if (start === null) return false;
  const grace = Number(schedule?.graceMinutes) || 0;
  const now = date.getHours() * 60 + date.getMinutes();
  return now > start + grace;
}

class AgentStore {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'agent-store.json');
    this.data = this.load();
  }

  fresh() {
    const now = Date.now();
    return {
      version: 1,
      device: {
        id: 'dev-' + randomUUID().slice(0, 8),
        hostname: os.hostname(),
        name: os.hostname(),
        platform: platformLabel(),
        osVersion: osVersion(),
        appVersion: app.getVersion(),
        status: 'active',
        registeredAt: now,
        lastSeenAt: now,
        userId: null,
        userName: null,
        email: null,
        color: null,
      },
      shifts: [],
      events: [],
      policy: null,
    };
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const base = this.fresh();
      return {
        ...base,
        ...raw,
        device: { ...base.device, ...(raw.device || {}) },
        shifts: Array.isArray(raw.shifts) ? raw.shifts : [],
        events: Array.isArray(raw.events) ? raw.events : [],
        policy: raw.policy || null,
      };
    } catch {
      return this.fresh();
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error('[agent] could not save store', error);
    }
  }

  get policy() {
    return this.data.policy;
  }

  setPolicy(policy) {
    if (!policy || typeof policy !== 'object') return this.data.policy;
    this.data.policy = {
      mode: policy.mode === 'blocklist' ? 'blocklist' : 'allowlist',
      allow: Array.isArray(policy.allow) ? policy.allow.filter(Boolean) : [],
      block: Array.isArray(policy.block) ? policy.block.filter(Boolean) : [],
      schedule: policy.schedule || { start: '09:00', end: '18:00', graceMinutes: 10 },
    };
    this.save();
    return this.data.policy;
  }

  identify(user) {
    if (!user) return this.data.device;
    const device = this.data.device;
    const first = String(user.name || '').trim().split(/\s+/)[0];
    device.userId = user.id ?? null;
    device.userName = user.name ?? null;
    device.email = user.email ?? null;
    device.color = user.color ?? null;
    device.name = first ? `${first} | ${device.platform}` : device.hostname;
    device.lastSeenAt = Date.now();
    this.save();
    return device;
  }

  setDeviceStatus(status) {
    this.data.device.status = status === 'revoked' ? 'revoked' : 'active';
    this.data.device.lastSeenAt = Date.now();
    this.save();
    return this.data.device;
  }

  today() {
    const key = dayKey();
    return this.data.shifts.find((s) => s.date === key) || null;
  }

  openShift() {
    return this.data.shifts.find((s) => !s.clockOut) || null;
  }

  openBreak() {
    const shift = this.openShift();
    if (!shift) return null;
    return (shift.breaks || []).find((b) => !b.end) || null;
  }

  /** Break time recorded today, counting the running break up to now. */
  breakSecondsToday(now = Date.now()) {
    const key = dayKey();
    return this.data.shifts
      .filter((s) => s.date === key)
      .reduce(
        (sum, s) => sum + (s.breaks || []).reduce((inner, b) => inner + Math.max(0, (b.end || now) - b.start), 0),
        0
      ) / 1000;
  }

  clockIn() {
    if (this.data.device.status === 'revoked') {
      throw new Error('This device has been revoked. Ask an administrator to restore it.');
    }
    const open = this.openShift();
    if (open) return open;

    const now = Date.now();
    const shift = {
      id: 'shift-' + now.toString(36),
      date: dayKey(),
      clockIn: now,
      clockOut: null,
      breaks: [],
      late: isLate(new Date(now), this.data.policy?.schedule),
    };
    this.data.shifts.unshift(shift);
    this.data.shifts = this.data.shifts.slice(0, KEEP_SHIFTS);
    this.data.device.lastSeenAt = now;
    this.log({ type: 'session_started', ts: now, detail: shift.late ? 'Late arrival' : 'On time' }, false);
    this.save();
    return shift;
  }

  startBreak() {
    if (this.data.device.status === 'revoked') {
      throw new Error('This device has been revoked. Ask an administrator to restore it.');
    }
    const shift = this.openShift();
    if (!shift) throw new Error('Clock in before taking a break.');
    const running = this.openBreak();
    if (running) return running;

    const now = Date.now();
    shift.breaks = Array.isArray(shift.breaks) ? shift.breaks : [];
    const brk = { id: 'break-' + now.toString(36), start: now, end: null };
    shift.breaks.push(brk);
    this.data.device.lastSeenAt = now;
    this.log({ type: 'break_started', ts: now, detail: 'Break started' }, false);
    this.save();
    return brk;
  }

  endBreak() {
    const brk = this.openBreak();
    if (!brk) return null;
    const now = Date.now();
    brk.end = now;
    this.data.device.lastSeenAt = now;
    this.log(
      { type: 'break_ended', ts: now, detail: `${Math.max(1, Math.round((now - brk.start) / 60000))} min break` },
      false
    );
    this.save();
    return brk;
  }

  clockOut() {
    const open = this.openShift();
    if (!open) return null;
    const now = Date.now();
    this.endBreak();
    open.clockOut = now;
    this.data.device.lastSeenAt = now;
    this.log({ type: 'session_ended', ts: now, detail: `${Math.max(1, Math.round((now - open.clockIn) / 60000))} min` }, false);
    this.save();
    return open;
  }

  log(event, persist = true) {
    const entry = {
      id: 'ev-' + Date.now().toString(36) + '-' + randomUUID().slice(0, 4),
      ts: Number(event.ts) || Date.now(),
      ...event,
    };
    this.data.events.unshift(entry);
    if (this.data.events.length > MAX_EVENTS) this.data.events.length = MAX_EVENTS;
    if (persist) this.save();
    return entry;
  }

  bootstrap() {
    /* Throttle the write: the renderer bootstraps on every agent change. */
    if (Date.now() - this.data.device.lastSeenAt > 20_000) {
      this.data.device.lastSeenAt = Date.now();
      this.save();
    }
    const openBreak = this.openBreak();
    return {
      device: this.data.device,
      shift: this.today(),
      shifts: this.data.shifts.slice(0, 30),
      events: this.data.events.slice(0, 400),
      policy: this.data.policy,
      onBreak: Boolean(openBreak),
      breakStartedAt: openBreak ? openBreak.start : null,
      breakSecondsToday: this.breakSecondsToday(),
      platform: process.platform,
      appVersion: app.getVersion(),
      now: Date.now(),
    };
  }
}

module.exports = { AgentStore, dayKey, isLate, platformLabel, osVersion };
