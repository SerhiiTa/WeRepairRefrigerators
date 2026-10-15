// Server-only bounded worker core. No scheduler/provider is activated in phase 02A.
export type Channel = 'push' | 'telegram' | 'sms';
export type Claim = {id:string; channel:Channel; dedupe_key:string; lease_token:string};
export type Recipient = {companyId:string; recipientProfileId:string; eventType:string; priority:string; conversationId:string|null; jobId:string|null};
export type Outcome = {
 kind:'sent'|'accepted'|'retryable'|'permanent'|'unknown';
 // Adapters must return sanitized codes, never tokens, raw response bodies or recipient contacts.
 reference?:string; providerStatus?:string; errorCode?:string; retrySeconds?:number;
};
export interface DeliveryStore {
 claim(channels:Channel[],limit:number):Promise<Claim[]>;
 authorize(claim:Claim):Promise<Recipient|null>;
 finish(claim:Claim,outcome:Outcome):Promise<boolean>;
}
// An adapter must resolve a verified staff-owned endpoint, recheck consent, enforce a <=10s
// request timeout, and report retryable ONLY if the provider definitely did not accept.
// Ambiguous timeouts are unknown; accepted != sent. Future receipt handlers must authenticate.
export type Adapter = (recipient:Recipient,dedupeKey:string,signal:AbortSignal,claim:Claim)=>Promise<Outcome>;
export async function runDeliveryBatch(store:DeliveryStore,adapters:Partial<Record<Channel,Adapter>>,options:{maxClaims?:number;budgetMs?:number}={}) {
 if(typeof window!=='undefined') throw new Error('Server worker only');
 const channels=(['push','telegram','sms'] as const).filter(c=>adapters[c]);
 if(channels.length===0) return {claimed:0,finished:0};
 // One claim at a time keeps later items from expiring while earlier providers are slow.
 let claimed=0,finished=0;
 const started=Date.now();
 while(claimed<Math.min(20,options.maxClaims??3) && Date.now()-started<Math.min(20000,options.budgetMs??20000)){
  const rows=await store.claim(channels,1);
  if(rows.length===0) break;
  const claim=rows[0];claimed++;
  const recipient=await store.authorize(claim);
  if(!recipient) continue;
  const adapter=adapters[claim.channel];
  if(!adapter) throw new Error('Unsupported claimed channel');
  let outcome:Outcome;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {outcome=await Promise.race([adapter(recipient,claim.dedupe_key,controller.signal,claim),new Promise<Outcome>(resolve=>{
   timer=setTimeout(()=>{controller.abort();resolve({kind:'unknown',errorCode:'delivery_outcome_unknown'});},10_000);
  })]);}
  catch {outcome={kind:'unknown',errorCode:'delivery_outcome_unknown'};}
  finally {clearTimeout(timer);}
  // Storage failures propagate: never repeat an already-submitted provider request here.
  if(await store.finish(claim,outcome)) finished++;
 }
 return {claimed,finished};
}
