import React from 'react';
import { Laptop, MonitorSmartphone, ShieldCheck, ShieldX, Wifi } from 'lucide-react';
import { api, post } from '../api';
import { useApp } from '../ctx';
import { Avatar, Card, Empty, Spinner, relTime } from '../ui';

export default function Devices() {
  const { tick } = useApp();
  const [data, setData] = React.useState<{ devices: any[]; online: number } | null>(null);

  const load = React.useCallback(() => {
    api<{ devices: any[]; online: number }>('/api/devices').then(setData);
  }, []);
  React.useEffect(load, [load, tick]);

  if (!data) return <div className="page-loading"><Spinner /></div>;

  const act = async (id: string, action: 'revoke' | 'restore') => {
    await post(`/api/devices/${id}/${action}`);
    load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Devices</h1>
          <p className="muted">Each consultant installation is a registered device. Revoke one and its desk events stop being accepted.</p>
        </div>
        <div className="row gap8">
          <span className="pill pill-ok"><Wifi size={13} /> {data.online} online</span>
          <span className="pill pill-muted">{data.devices.length} registered</span>
        </div>
      </div>

      <div className="grid-3">
        <Card title="Coverage" subtitle="Registered installations">
          <div className="coverage">
            <div className="coverage-block"><span>macOS</span><strong>{data.devices.filter((d) => d.platform === 'macOS').length}</strong></div>
            <div className="coverage-block"><span>Windows</span><strong>{data.devices.filter((d) => d.platform === 'Windows').length}</strong></div>
            <div className="coverage-block"><span>Linux</span><strong>{data.devices.filter((d) => d.platform === 'Linux').length}</strong></div>
            <div className="coverage-block"><span>Revoked</span><strong>{data.devices.filter((d) => d.status === 'revoked').length}</strong></div>
          </div>
        </Card>
        <Card title="Trust model" subtitle="How the prototype treats device data">
          <ul className="signals">
            <li><span className="sig green"><ShieldCheck size={14} /></span><div><strong>Device-scoped tokens</strong><small className="muted">Events are accepted only from a registered, active device</small></div></li>
            <li><span className="sig slate"><MonitorSmartphone size={14} /></span><div><strong>Append-only events</strong><small className="muted">Job-board visits and application events are timestamped server-side</small></div></li>
            <li><span className="sig amber"><ShieldX size={14} /></span><div><strong>Revocation is immediate</strong><small className="muted">Revoked devices receive 403 on their next sync</small></div></li>
          </ul>
        </Card>
        <Card title="Production path" subtitle="Roadmap, not in this build">
          <ul className="steps">
            <li><b>Key pair</b><span>Per-device asymmetric keys held in Keychain / TPM / CNG</span></li>
            <li><b>Signing</b><span>Events signed on device, verified at ingest</span></li>
            <li><b>Classification</b><span>Verified / suspicious / unverified trust tiers</span></li>
          </ul>
        </Card>
      </div>

      <Card title="Registered devices" pad={false}>
        {data.devices.length === 0 && <Empty>No devices registered yet.</Empty>}
        <table className="table roomy">
          <thead>
            <tr><th>Device</th><th>Assigned to</th><th>Platform</th><th>Agent</th><th>Status</th><th>Last seen</th><th className="right">Action</th></tr>
          </thead>
          <tbody>
            {data.devices.map((d) => {
              const online = d.status === 'active' && Date.now() - (d.last_seen_at || 0) < 180_000;
              return (
                <tr key={d.id}>
                  <td>
                    <div className="cell-person">
                      <span className="device-ico"><Laptop size={16} /></span>
                      <div><strong>{d.name}</strong><small className="muted">{d.id}</small></div>
                    </div>
                  </td>
                  <td>
                    <div className="cell-person">
                      <Avatar name={d.userName} color={d.color} size={24} />
                      <span>{d.userName}</span>
                    </div>
                  </td>
                  <td className="muted">{d.platform}<small className="muted block">{d.os_version}</small></td>
                  <td className="muted">{d.app_version}</td>
                  <td>
                    <span className={`pill ${d.status === 'revoked' ? 'pill-danger' : online ? 'pill-ok' : 'pill-muted'}`}>
                      <i className="dot" /> {d.status === 'revoked' ? 'revoked' : online ? 'online' : 'idle'}
                    </span>
                  </td>
                  <td className="muted">{d.last_seen_at ? relTime(d.last_seen_at) : '—'}</td>
                  <td className="right">
                    {d.status === 'revoked'
                      ? <button className="btn ghost sm" onClick={() => act(d.id, 'restore')}>Restore</button>
                      : <button className="btn danger sm" onClick={() => act(d.id, 'revoke')}>Revoke</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}