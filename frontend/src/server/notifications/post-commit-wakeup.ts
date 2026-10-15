import {after} from 'next/server';
import {processGeneralPush} from './general-push';
// Call only after a successful, awaited persistence boundary. after() is best-effort
// lifetime extension, not durable scheduling. The DB queue + recovery are durable.
export function wakePushAfterCommit(){
 try {after(async()=>{try{await processGeneralPush('event');}catch{console.warn('[staff-push-event]',{outcome:'recovery_required'});}});}
 catch {console.warn('[staff-push-event]',{outcome:'recovery_required'});}
}
