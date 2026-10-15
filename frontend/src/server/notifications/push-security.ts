import {createECDH, ECDH, timingSafeEqual} from 'node:crypto';
export type PushSubscriptionInput={endpoint:string;keys:{p256dh:string;auth:string}};
export function validPushSubscription(value:unknown):value is PushSubscriptionInput {
 try {
  if(!value || typeof value!=='object') return false;
  const s=value as PushSubscriptionInput;
  const u=new URL(s.endpoint);
  if(s.endpoint.length>2048 || u.protocol!=='https:' || u.username || u.password || u.port || u.hash || !u.pathname || u.pathname==='/') return false;
  if(!/^(?:[a-z0-9-]+\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)$/.test(u.hostname)) return false;
  if(!/^[A-Za-z0-9_-]{87}$/.test(s.keys.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(s.keys.auth)) return false;
  ECDH.convertKey(Buffer.from(s.keys.p256dh,'base64url'),'prime256v1');
  return Buffer.from(s.keys.auth,'base64url').length===16;
 } catch {return false;}
}
export function workerAuthorized(header:string|null,secret:string|undefined){
 if(!secret || secret.length<32 || !header) return false;
 const expected=Buffer.from(`Bearer ${secret}`);const actual=Buffer.from(header);
 return expected.length===actual.length && timingSafeEqual(expected,actual);
}
export function pushConfiguration(env:NodeJS.ProcessEnv){
 const publicKey=env.VAPID_PUBLIC_KEY,privateKey=env.VAPID_PRIVATE_KEY,subject=env.VAPID_SUBJECT;
 if(!publicKey || !privateKey || !subject || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject))return null;
 try {const ec=createECDH('prime256v1');ec.setPrivateKey(Buffer.from(privateKey,'base64url'));if(ec.getPublicKey().toString('base64url')!==publicKey)return null;} catch{return null;}
 return {publicKey,privateKey,subject};
}
