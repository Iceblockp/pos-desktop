import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
export function PaymentSlips({notify}:{notify:(message:string)=>void}) {
  const client=useQueryClient();
  const slips=useQuery({queryKey:['payment-slips'],queryFn:()=>window.storePos.cloud.listSlips()});
  const [tier,setTier]=useState<'offline_plus'|'cloud_pro'>('cloud_pro'),[method,setMethod]=useState('kbzpay');
  const [amount,setAmount]=useState(''),[reference,setReference]=useState(''),[note,setNote]=useState('');
  const submit=useMutation({mutationFn:()=>window.storePos.cloud.submitSlip({tier,method,amount:Number(amount),reference:reference.trim(),note:note.trim()||undefined}),onSuccess:()=>{setReference('');setNote('');void client.invalidateQueries({queryKey:['payment-slips']});notify('Payment submitted for review');},onError:(e:Error)=>notify(e.message)});
  return <div className="card bg-white shadow-lg mt-5"><div className="card-body">
    <h3 className="font-bold text-lg">Submit payment reference</h3>
    <form className="grid gap-3" onSubmit={e=>{e.preventDefault();submit.mutate();}}>
      <label>Plan<select className="select select-bordered w-full" value={tier} onChange={e=>setTier(e.target.value as typeof tier)}><option value="offline_plus">Offline Plus</option><option value="cloud_pro">Cloud Pro</option></select></label>
      <label>Method<select className="select select-bordered w-full" value={method} onChange={e=>setMethod(e.target.value)}><option value="kbzpay">KBZPay</option><option value="wavepay">WavePay</option><option value="ayapay">AYAPay</option><option value="bank">Bank transfer</option></select></label>
      <label>Amount<input className="input input-bordered w-full" type="number" min="1" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label>Transfer reference<input className="input input-bordered w-full" required minLength={4} maxLength={64} value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <label>Note<input className="input input-bordered w-full" maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <button className="btn btn-primary" disabled={submit.isPending}>Submit for review</button>
    </form>
    {slips.error && <p role="alert">{slips.error.message}</p>}
    {slips.data?.map(slip=><div className="border-b py-2" key={slip.id}><strong>{slip.reference}</strong> · {slip.amount} · {slip.tier} · {slip.status}{slip.reviewNote && <p>{slip.reviewNote}</p>}</div>)}
  </div></div>;
}
