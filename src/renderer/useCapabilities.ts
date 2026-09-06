import { useQuery } from '@tanstack/react-query';
import type { Capabilities } from '../shared/models';
const empty: Capabilities = {owner:false,tier:'free',effectivePlan:'free',premiumUntil:null,cloud:false,debt:false,expenses:false,dayEnd:false,flags:{debt:true,expenses:true,dayEnd:true}};
export function useCapabilities(): Capabilities {
  return useQuery({queryKey:['capabilities'],queryFn:()=>window.storePos.pos.capabilities(),refetchInterval:30_000}).data ?? empty;
}
