import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConnectResult, DeviceLimit, ShopSwitch } from '../../shared/models';

export function CloudPanel({notify}:{notify:(message:string)=>void}) {
  const client = useQueryClient();
  const cloud = useQuery({queryKey:['cloud'],queryFn:()=>window.storePos.cloud.state(),refetchInterval:5000});
  const connected = !!cloud.data?.deviceId;
  const devices = useQuery({queryKey:['cloud-devices'],queryFn:()=>window.storePos.cloud.devices(),enabled:connected});
  const [mode,setMode] = useState<'login'|'register'|'join'>('login');
  const [url,setUrl] = useState(import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api');
  const [phone,setPhone] = useState(''),[password,setPassword] = useState(''),[name,setName] = useState('');
  const [deviceName,setDeviceName] = useState('Desktop counter'),[pairingCode,setPairingCode] = useState('');
  const [limit,setLimit] = useState<DeviceLimit|null>(null),[switching,setSwitching] = useState<ShopSwitch|null>(null);
  const [pair,setPair] = useState<{code:string;expiresAt:string}|null>(null);
  useEffect(()=>{if(cloud.data?.apiUrl)setUrl(cloud.data.apiUrl);},[cloud.data?.apiUrl]);
  const action = useMutation({
    mutationFn:(fn:()=>Promise<ConnectResult|void>)=>fn(),
    onSuccess:result=>{
      void client.invalidateQueries();
      if (!result) return;
      if(result.status==='device_limit'){setLimit(result);return;}
      setLimit(null);setPassword('');
      if(result.status==='shop_switch'){setSwitching(result);return;}
      setSwitching(null);
      notify(result.error || (result.status==='signed_out'?'Disconnected; local data is kept.':`Cloud: ${result.status}`));
    },
    onError:(error:Error)=>notify(error.message),
  });
  const connect = async () => {
    await window.storePos.cloud.setApiUrl(url);
    if(mode==='join')return window.storePos.cloud.join({pairingCode:pairingCode.trim(),deviceName});
    if(mode==='register')return window.storePos.cloud.register({phone,password,deviceName,shopName:name});
    return window.storePos.cloud.login({phone,password,deviceName});
  };
  return <div className="card bg-white shadow-lg"><div className="card-body space-y-3">
    <h3 className="text-xl font-bold">Cloud & devices</h3>
    {connected ? <>
      <p>{cloud.data?.shopName} · {cloud.data?.deviceName} · {cloud.data?.role}</p>
      <p role="status">{cloud.data?.status} · {cloud.data?.pending ?? 0} pending</p>
      {cloud.data?.error && <p role="alert" className="text-red-700">{cloud.data.error}</p>}
      <p className="text-sm">Last synced: {cloud.data?.lastSyncedAt ? new Date(cloud.data.lastSyncedAt).toLocaleString() : 'Never'}</p>
      <button className="btn btn-primary" disabled={action.isPending} onClick={()=>action.mutate(()=>window.storePos.cloud.syncNow())}>Sync now</button>
      {cloud.data?.role==='owner' && <>
        <button className="btn btn-outline" disabled={action.isPending} onClick={()=>action.mutate(async()=>{setPair(await window.storePos.cloud.createPairingCode());})}>Create cashier pairing code</button>
        {pair && <p>Pairing code: <strong>{pair.code}</strong> · expires {new Date(pair.expiresAt).toLocaleTimeString()}</p>}
      </>}
      {devices.error && <p role="alert">{devices.error.message}</p>}
      {devices.data?.map(device=><div key={device.id} className="flex justify-between items-center gap-2 border-b py-2">
        <span>{device.name} · {device.deviceCode} · {device.role}{device.isCurrent?' (this desktop)':''}</span>
        {!device.isCurrent && cloud.data?.role==='owner' && <button className="btn btn-sm btn-outline btn-error" disabled={action.isPending} onClick={()=>{
          if(window.confirm(`Disconnect ${device.name}? It will need to sign in again.`))action.mutate(()=>window.storePos.cloud.revokeDevice(device.id));
        }}>Remove</button>}
      </div>)}
      <button className="btn btn-outline btn-error" disabled={action.isPending} onClick={()=>action.mutate(()=>window.storePos.cloud.signOut())}>Disconnect</button>
    </> : <>
      {!limit && !switching && <form className="space-y-3" onSubmit={event=>{event.preventDefault();action.mutate(connect);}}>
        <label className="form-control">Connection<select className="select select-bordered" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="login">Owner sign in</option><option value="register">Create shop</option><option value="join">Join as cashier</option></select></label>
        <label className="form-control">API URL<input className="input input-bordered" required value={url} onChange={e=>setUrl(e.target.value)}/></label>
        {mode==='register' && <label className="form-control">Shop name<input className="input input-bordered" required value={name} onChange={e=>setName(e.target.value)}/></label>}
        {mode==='join' ? <label className="form-control">Pairing code<input className="input input-bordered" required value={pairingCode} onChange={e=>setPairingCode(e.target.value)}/></label> : <>
          <label className="form-control">Shop phone<input className="input input-bordered" required value={phone} onChange={e=>setPhone(e.target.value)}/></label>
          <label className="form-control">Password<input className="input input-bordered" required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
        </>}
        <label className="form-control">Device name<input className="input input-bordered" required value={deviceName} onChange={e=>setDeviceName(e.target.value)}/></label>
        <button className="btn btn-primary" disabled={action.isPending}>{action.isPending?'Connecting…':'Connect'}</button>
      </form>}
      {limit && <div className="space-y-3" role="alert"><p>Device limit reached ({limit.limit}). Choose a device to sign out and replace.</p>
        {limit.devices.map(device=><button key={device.id} className="btn btn-outline" disabled={action.isPending} onClick={()=>action.mutate(()=>window.storePos.cloud.completeLogin({loginTicket:limit.loginTicket,revokeDeviceId:device.id,deviceName}))}>Replace {device.name}</button>)}
        <button className="btn btn-ghost" disabled={action.isPending} onClick={()=>setLimit(null)}>Cancel</button>
      </div>}
      {switching && <div className="alert alert-warning flex-col items-start" role="alert">
        <p>Switch to {switching.shopName}? This replaces the current shop data. {switching.unsyncedCount} changes are unsynced. A local database backup will be kept.</p>
        <button className="btn btn-warning" disabled={action.isPending} onClick={()=>action.mutate(async()=>{await window.storePos.cloud.confirmSwitch();window.location.reload();})}>Back up and switch shop</button>
        <button className="btn" disabled={action.isPending} onClick={()=>action.mutate(async()=>{await window.storePos.cloud.cancelSwitch();setSwitching(null);})}>Cancel</button>
      </div>}
    </>}
  </div></div>;
}
