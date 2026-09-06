import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPreferences } from '../../shared/models';
export function NotificationSettings({notify}:{notify:(message:string)=>void}) {
  const client=useQueryClient();
  const prefs=useQuery({queryKey:['notification-preferences'],queryFn:()=>window.storePos.pos.notificationPreferences(),refetchInterval:30_000});
  const save=useMutation({mutationFn:(value:NotificationPreferences)=>window.storePos.pos.saveNotificationPreferences(value),onSuccess:(result,input)=>{client.setQueryData(['notification-preferences'],result);if((input.lowStock&&!result.lowStock)||(input.dailyEnabled&&!result.dailyEnabled))notify('Notifications could not be enabled. Check this app’s notification permission in system settings.');},onError:(e:Error)=>notify(e.message)});
  const value=prefs.data;
  return <div className="card bg-white shadow-lg"><div className="card-body gap-3">
    <h3 className="font-bold text-lg">Desktop notifications</h3>
    <p className="text-sm">These preferences apply only to this desktop. Reminders run while Store POS is open.</p>
    {value && <>
      {!value.supported&&<p>Notifications are unavailable on this system.</p>}
      <label className="flex gap-3"><input type="checkbox" className="toggle toggle-sm" checked={value.lowStock} disabled={!value.supported||save.isPending} onChange={e=>save.mutate({...value,lowStock:e.target.checked})}/>Alert when a sale takes stock to its minimum</label>
      <label className="flex gap-3"><input type="checkbox" className="toggle toggle-sm" checked={value.dailyEnabled} disabled={!value.supported||save.isPending} onChange={e=>save.mutate({...value,dailyEnabled:e.target.checked})}/>Daily sales reminder</label>
      <label className="form-control">Reminder time<input type="time" className="input input-bordered" value={`${String(value.hour).padStart(2,'0')}:${String(value.minute).padStart(2,'0')}`} disabled={save.isPending} onChange={e=>{if(e.target.value){const [hour,minute]=e.target.value.split(':').map(Number);save.mutate({...value,hour,minute});}}}/></label>
    </>}
  </div></div>;
}
