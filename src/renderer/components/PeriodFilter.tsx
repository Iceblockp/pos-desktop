import { useEffect, useState, useSyncExternalStore } from 'react';
import { customRange, periodRange, type PeriodKey } from '../../shared/period';
const labels: Record<PeriodKey,string>={today:'Today',yesterday:'Yesterday',thisMonth:'This month',lastMonth:'Last month',week:'Last 7 days',rolling30:'Last 30 days',custom:'Custom dates'};
const listeners=new Set<()=>void>();
let selection:{key:PeriodKey|'all';from:string;to:string}={key:'today',from:'',to:''};
try { const stored=JSON.parse(localStorage.getItem('store-pos.period')||'null');if(stored&&(stored.key in labels||stored.key==='all'))selection=stored; } catch {}
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
function update(next:typeof selection){selection=next;localStorage.setItem('store-pos.period',JSON.stringify(next));listeners.forEach(fn=>fn());}
export function usePeriod(allowAll=false){
  const value=useSyncExternalStore(subscribe,()=>selection);
  const [date,setDate]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setDate(new Date()),30_000);return()=>clearInterval(timer);},[]);
  const key=value.key==='all'&&!allowAll?'today':value.key;
  const range=key==='all'?null:key==='custom'&&value.from&&value.to?customRange(new Date(value.from+'T00:00:00'),new Date(value.to+'T00:00:00')):periodRange(key as PeriodKey,date);
  return {range,label:key==='all'?'All time':labels[key],key};
}
export function PeriodFilter({allowAll=false}:{allowAll?:boolean}){
  const value=useSyncExternalStore(subscribe,()=>selection);
  return <div className="flex flex-wrap gap-2 items-center"><select aria-label="Date period" className="select select-bordered select-sm" value={value.key==='all'&&!allowAll?'today':value.key} onChange={e=>update({...value,key:e.target.value as typeof value.key})}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}{allowAll&&<option value="all">All time</option>}</select>{value.key==='custom'&&<><input aria-label="From date" className="input input-bordered input-sm" type="date" value={value.from} onChange={e=>update({...value,from:e.target.value})}/><input aria-label="To date" className="input input-bordered input-sm" type="date" value={value.to} onChange={e=>update({...value,to:e.target.value})}/></>}</div>;
}
