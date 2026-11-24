import React from 'react';
import { CalendarDays, Download, Printer } from 'lucide-react';
import { api } from '../api';
import { Card, Empty, Spinner, fmtDate } from '../ui';

export default function Reports() {
  const days = React.useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(Date.now() - i * 86_400_000);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return out;
  }, []);
  const [date, setDate] = React.useState(days[0]);
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    setData(null);
    api(`/api/reports/daily?date=${date}`).then(setData);
  }, [date]);

  const download = () => {
    if (!data) return;
    const head = ['Consultant', 'Team', 'Clock in', 'Clock out', 'Late', 'Hours worked', 'Active hours', 'Applications', 'Interviews', 'Leads', 'Top board', 'Blocked attempts'];
    const lines = [head.join(',')].concat(data.rows.map((x: any) =>
      [x.name, x.team, x.clockIn, x.clockOut, x.late ? 'yes' : 'no', x.workedHours, x.activeHours, x.applications, x.interviews, x.queued, x.topBoard, x.blockedAttempts].join(',')
    ));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tnsi-desk-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Daily reports</h1>
          <p className="muted">A shareable summary of applications, interviews, shift and job-board activity for any day.</p>
        </div>
        <div className="row gap8">
          <label className="date-picker">
            <CalendarDays size={15} />
            <select value={date} onChange={(e) => setDate(e.target.value)}>
              {days.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </select>
          </label>
          <button className="btn ghost" onClick={() => window.print()}><Printer size={15} /> Print</button>
          <button className="btn primary" onClick={download}><Download size={15} /> CSV</button>
        </div>
      </div>

      {!data && <div className="page-loading"><Spinner /></div>}
      {data && (
        <>
          <div className="report-head">
            <div>
              <span className="muted small">Daily operations report</span>
              <h2>{fmtDate(data.date)} · {data.org}</h2>
            </div>
            <div className="report-kpis">
              <div><span>Present</span><strong>{data.kpis.present}/{data.kpis.totalEmployees}</strong></div>
              <div><span>Late</span><strong>{data.kpis.late}</strong></div>
              <div><span>Active hours</span><strong>{data.kpis.activeHours}h</strong></div>
              <div><span>Applications</span><strong>{data.kpis.applicationsToday}</strong></div>
              <div><span>Interviews</span><strong>{data.kpis.interviewsBooked}</strong></div>
              <div><span>Policy blocks</span><strong>{data.kpis.blockedAttempts}</strong></div>
            </div>
          </div>

          <Card pad={false}>
            {data.rows.length === 0 && <Empty>No attendance recorded on this day.</Empty>}
            {data.rows.length > 0 && (
              <table className="table roomy">
                <thead>
                  <tr>
                    <th>Consultant</th><th>Team</th><th>In</th><th>Out</th><th>Late</th>
                    <th>Hours</th><th>Active</th><th className="right">Apps</th><th className="right">Interviews</th><th className="right">Leads</th><th>Top board</th><th className="right">Blocks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: any) => (
                    <tr key={r.name}>
                      <td><strong>{r.name}</strong></td>
                      <td className="muted">{r.team}</td>
                      <td className="num">{r.clockIn}</td>
                      <td className="num">{r.clockOut || '—'}</td>
                      <td>{r.late ? <span className="pill pill-warn tiny">late</span> : <span className="muted">—</span>}</td>
                      <td className="num">{r.workedHours}h</td>
                      <td className="num">{r.activeHours}h</td>
                      <td className="right num">{r.applications || 0}</td>
                      <td className="right num">{r.interviews || 0}</td>
                      <td className="right num">{r.queued || 0}</td>
                      <td className="muted">{r.topBoard}</td>
                      <td className="right">{r.blockedAttempts || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="How to read this report" subtitle="Transparency note included in every export">
            <p className="report-note">
              These figures describe time with an application in the foreground, approved job-board time in the desk browser,
              applications filed for clients and presence during a started work session. They are signals for workload and schedule conversations —
              not a productivity score, and not a substitute for a manager's judgement. Idle time includes meetings,
              thinking and offline work, so active time should always be read in context.
            </p>
          </Card>
        </>
      )}
    </>
  );
}