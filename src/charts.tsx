import React from 'react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const INK = '#12263f';
const GREEN = '#0f7a68';
const SIGNAL = '#d98b2b';
const FAINT = '#8c98a4';
const RULE = '#d8e2ec';
const MUTED = '#5c6770';

export function ActivityChart({ data }: { data: { hour: number; focus: number; distraction: number; idle: number }[] }) {
  const active = data.filter((d) => d.focus + d.distraction > 0);
  const first = active.length ? Math.max(0, active[0].hour - 1) : 8;
  const last = active.length ? Math.min(23, active[active.length - 1].hour + 1) : 19;
  const window = data.filter((d) => d.hour >= first && d.hour <= last);
  const rows = window.map((d) => ({
    label: `${String(d.hour).padStart(2, '0')}`,
    Focus: Math.round(d.focus / 60),
    Other: Math.round(d.distraction / 60),
    Idle: Math.round(d.idle / 60),
  }));
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={238}>
        <AreaChart data={rows} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="fillFocus" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.14} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="fillOther" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SIGNAL} stopOpacity={0.1} />
              <stop offset="100%" stopColor={SIGNAL} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={RULE} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: MUTED, fontSize: 9, fontFamily: 'ui-monospace, monospace' }}
            axisLine={{ stroke: RULE }}
            tickLine={false}
            interval={Math.max(0, Math.floor(rows.length / 8))}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 9, fontFamily: 'ui-monospace, monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}m`}
            tickCount={4}
            allowDecimals={false}
            width={54}
          />
          <Tooltip
            contentStyle={{
              background: '#ffffff', border: '1px solid #d8e2ec', borderRadius: 6,
              fontSize: 11, fontFamily: 'ui-monospace, monospace', color: INK,
            }}
            labelStyle={{ color: MUTED, marginBottom: 4 }}
            cursor={{ stroke: INK, strokeDasharray: '2 3' }}
          />
          <Area type="monotone" dataKey="Focus" stroke={GREEN} strokeWidth={1.75} fill="url(#fillFocus)" dot={false} />
          <Area type="monotone" dataKey="Other" stroke={SIGNAL} strokeWidth={1.25} fill="url(#fillOther)" dot={false} />
          <Area type="monotone" dataKey="Idle" stroke={FAINT} strokeWidth={1} fill="transparent" dot={false} strokeDasharray="3 3" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i style={{ background: GREEN }} /> Client work</span>
        <span><i style={{ background: SIGNAL }} /> Off-desk</span>
        <span><i style={{ background: FAINT }} /> Idle</span>
      </div>
    </div>
  );
}

/**
 * Attendance as a proportion bar rather than a donut: it reads faster and keeps
 * the "not in" remainder visible without inventing a fourth colour.
 */
export function AttendanceBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  return (
    <div className="att-bar">
      <div className="att-track">
        {segments.filter((s) => s.value > 0).map((s) => (
          <span key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <ul className="att-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}