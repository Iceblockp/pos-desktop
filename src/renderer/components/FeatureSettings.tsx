import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCapabilities } from '../useCapabilities';
export function FeatureSettings({notify}:{notify:(message:string)=>void}) {
  const value=useCapabilities(),client=useQueryClient();
  const save=useMutation({mutationFn:({name,enabled}:{name:'debt'|'expenses'|'dayEnd';enabled:boolean})=>window.storePos.pos.setFeature(name,enabled),onSuccess:()=>{void client.invalidateQueries();},onError:(e:Error)=>notify(e.message)});
  return <div className="card bg-white shadow-lg"><div className="card-body gap-3">
    <h3 className="font-bold text-lg">Shop features</h3>
    <p>Plan: {value.effectivePlan}. Debt, expenses and day end require an active paid plan.</p>
    {(['debt','expenses','dayEnd'] as const).map(name=><label className="flex gap-3" key={name}>
      <input type="checkbox" className="toggle toggle-sm" checked={value.flags[name]} disabled={save.isPending} onChange={e=>save.mutate({name,enabled:e.target.checked})}/>
      {name==='dayEnd'?'Day end':name==='debt'?'Customer debt':'Expenses'}
    </label>)}
  </div></div>;
}
