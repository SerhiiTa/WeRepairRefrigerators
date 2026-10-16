// A conflict is never retried unless the dispatcher explicitly confirms it.
export async function submitManualDispatch(url:string, options:RequestInit):Promise<Response> {
  const response=await fetch(url,options);
  if(response.status!==409) return response;
  const body=await response.clone().json().catch(()=>null);
  if(!body?.conflict || !window.confirm(`${body.message}\nOverride this conflict?`)) return response;
  const reason=window.prompt("Reason for manual conflict override (required):");
  if(!reason?.trim()) return response;
  return fetch(url,{...options,body:JSON.stringify({...JSON.parse(String(options.body)),overrideConflict:true,overrideReason:reason.trim()})});
}
