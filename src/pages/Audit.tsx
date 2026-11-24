import React from 'react';
import {
  Ban, Briefcase, FileText, Laptop, LogIn, Shield, UserPlus, Settings2, ScrollText,
} from 'lucide-react';
import { api } from '../api';
import { Card, Empty, Spinner, relTime } from '../ui';

const ICONS: Record<string, React.ElementType> = {
  'device.registered': Laptop,
  'device.login': LogIn,
  'device.revoke': Ban,
  'device.restore': Laptop,
  'policy.added': Shield,
  'policy.removed': Ban,
  'policy.updated': Shield,
  'policy.mode': Settings2,
  'employee.created': UserPlus,
  'employee.invited': UserPlus,
  'employee.updated': FileText,
  'schedule.updated': Settings2,
  'client.created': UserPlus,
  'client.updated': FileText,
  'application.submitted': Briefcase,
  'form.submitted': Briefcase,
};

export default function Audit() {
  const [data, setData] = React.useState<{ logs: any[] } | null>(null);

  React.useEffect(() => {
    api<{ logs: any[] }>('/api/audit').then(setData);
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p className="muted">Every administrative action is recorded and cannot be edited from the console.</p>
        </div>
      </div>

      <Card title="Administrative trail" subtitle="Newest first" action={<ScrollText size={15} className="muted" />}>
        {!data && <div className="page-loading"><Spinner /></div>}
        {data && data.logs.length === 0 && <Empty>No entries yet.</Empty>}
        <ol className="audit">
          {(data?.logs || []).map((l) => {
            const Icon = ICONS[l.action] || FileText;
            return (
              <li key={l.id}>
                <span className="audit-ico"><Icon size={15} /></span>
                <div className="audit-main">
                  <div>
                    <strong>{l.actor}</strong>
                    <span className="muted"> · {l.action.replace(/\./g, ' ')}</span>
                    {l.target && <span className="audit-target">{l.target}</span>}
                  </div>
                  {l.detail && <small className="muted">{l.detail}</small>}
                </div>
                <time className="muted num" title={new Date(l.ts).toLocaleString()}>{relTime(l.ts)}</time>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title="Retention" subtitle="Prototype defaults, configurable per organization">
        <div className="coverage">
          <div className="coverage-block"><span>Raw events</span><strong>90 days</strong></div>
          <div className="coverage-block"><span>Daily summaries</span><strong>24 months</strong></div>
          <div className="coverage-block"><span>Audit log</span><strong>24 months</strong></div>
          <div className="coverage-block"><span>Consultant export</span><strong>on request</strong></div>
        </div>
      </Card>
    </>
  );
}