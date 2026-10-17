import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../../../../node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(new URL('./hub-navigation.ts',import.meta.url),'utf8');
const api={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,URL,URLSearchParams,Event});
function browser(search=''){
 const entries=[{url:'/dashboard/communications'+search,state:{__NA:true}}];let index=0,events=0;
 const store=new Map();const win={location:{origin:'https://qa.invalid',search},sessionStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},dispatchEvent(){events++}};
 const update=()=>{win.location.search=new URL(entries[index].url,win.location.origin).search};
 win.history={get state(){return entries[index].state},pushState(state,_,url){entries.splice(index+1);entries.push({state,url});index++;update()},replaceState(state,_,url){entries[index]={state,url};update()},go(delta){index=Math.max(0,Math.min(entries.length-1,index+delta));update()}};
 return {win,entries,get index(){return index},get events(){return events}};
}
test('duplicate conversation destinations create one entry and retain Next state',()=>{
 const b=browser('?channel=sms');assert(api.navigateHub(b.win,{conversation:'a',view:'detail'}));assert(!api.navigateHub(b.win,{conversation:'a',view:'detail'}));assert.equal(b.entries.length,2);assert.equal(b.win.history.state.__NA,true);assert.equal(b.events,1);
});
test('list, tabs, mobile Back and Forward use existing entries without loops',()=>{
 const b=browser('?channel=calls&box=unread&q=QA');api.navigateHub(b.win,{conversation:'a',view:'detail'});api.navigateHub(b.win,{tab:'activity'});api.navigateHub(b.win,{tab:'job'});
 assert.equal(api.hubTab(new URLSearchParams(b.win.location.search).get('tab')),'job');
 b.win.history.go(-1);assert.equal(api.hubTab(new URLSearchParams(b.win.location.search).get('tab')),'activity');
 const n=b.entries.length;api.backToHubList(b.win);assert.equal(b.index,0);assert.equal(b.entries.length,n);assert(b.win.location.search.includes('q=QA'));
 b.win.history.go(1);assert.equal(new URLSearchParams(b.win.location.search).get('view'),'detail');assert.equal(api.hubTab(new URLSearchParams(b.win.location.search).get('tab')),'conversation');
});
test('direct link refresh retains tab; direct-entry Back safely replaces with list',()=>{
 const b=browser('?conversation=a&view=detail&tab=customer&channel=web&q=test');assert.equal(api.hubTab(new URLSearchParams(b.win.location.search).get('tab')),'customer');api.backToHubList(b.win);assert.equal(b.entries.length,1);assert.equal(b.win.location.search,'?channel=web&q=test');
});
test('transient filters/search replace only and tabs push once',()=>{
 const b=browser();api.navigateHub(b.win,{q:'test',channel:'messages',box:'needs_action'},'replace');assert.equal(b.entries.length,1);api.navigateHub(b.win,{conversation:'a',view:'detail'});api.navigateHub(b.win,{tab:'activity'});api.navigateHub(b.win,{tab:'activity'});assert.equal(b.entries.length,3);for(const entry of b.entries)assert(entry.url.includes('q=test'));
});
test('scroll positions are bounded to each route/tab/panel and storage failure is harmless',()=>{
 const b=browser('?conversation=a&view=detail');api.saveHubScroll(b.win,'detail-mobile',125);api.navigateHub(b.win,{tab:'activity'});assert.equal(api.readHubScroll(b.win,'detail-mobile'),0);api.saveHubScroll(b.win,'detail-mobile',48);b.win.history.go(-1);assert.equal(api.readHubScroll(b.win,'detail-mobile'),125);b.win.sessionStorage.getItem=()=>{throw Error()};assert.equal(api.readHubScroll(b.win,'detail-mobile'),0);
});
test('invalid tab falls back and list URLs discard detail-only state',()=>{
 assert.equal(api.hubTab('invalid'),'conversation');assert.equal(api.hubDestination('?view=detail&tab=job',{}),'/dashboard/communications');
});
test('Hub integration restores state without history writes and keeps document behavior',()=>{
 const hub=fs.readFileSync(new URL('./CommunicationsHub.tsx',import.meta.url),'utf8');
 const restore=hub.slice(hub.indexOf('const restoreConversationUrl'),hub.indexOf('claimHubOrigin(window)'));
 assert(restore.includes('setMobileDetailTab'));assert(!/pushState|replaceState|navigateHub/.test(restore));
 assert(hub.includes('onClick={() => backToHubList(window)}'));assert(hub.includes('onClick={() => changeHubTab(value)}'));assert(hub.includes('panel.scrollTop = readHubScroll'));
 assert(hub.includes('resolveCustomerThread(supabase'));assert(hub.includes('item.threadConversationIds.includes(selectedConversationId'));
 const git=fs.readFileSync(new URL('./CommunicationsHub.tsx',import.meta.url),'utf8');assert(git.includes('target="_blank" rel="noopener noreferrer">View'));
});

test('after direct-entry fallback a new detail visit has a known list predecessor',()=>{
 const b=browser('?conversation=a&view=detail');api.backToHubList(b.win);api.navigateHub(b.win,{conversation:'b',view:'detail'});api.navigateHub(b.win,{tab:'activity'});api.backToHubList(b.win);assert.equal(b.index,0);assert.equal(b.win.location.search,'');
});

const customer='10000000-0000-0000-0000-000000000001',job='20000000-0000-0000-0000-000000000001',company='30000000-0000-0000-0000-000000000001';
const id=n=>`40000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const convo=(n,j=null)=>({id:id(n),company_id:company,customer_id:customer,service_request_id:j});
function database({conversations=[],jobs=[],people=[{id:customer,company_id:company}],deny=false,errorTable=null}={}) {
 const reads=[];
 return {reads,rpc:async()=>({data:!deny,error:null}),from(table){
 const filters=[];let start=0,end=Infinity,single=false;
 const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},range(a,b){start=a;end=b;return q},maybeSingle(){single=true;return q},then(resolve,reject){
 reads.push({table,start});const data=({customers:people,service_requests:jobs,communication_conversations:conversations}[table]??[]).filter(r=>filters.every(f=>f(r))).slice(start,end+1);
 return Promise.resolve({data:single?data[0]??null:data,error:table===errorTable?{message:'denied'}:null}).then(resolve,reject);
 }};return q;
 }};
}
test('customer resolution pages beyond latest 50 and 200 without duplicate records',async()=>{
 const db=database({conversations:Array.from({length:205},(_,n)=>convo(n))});
 const rows=await api.resolveCustomerThread(db,{customer,job:null,conversation:null});assert.equal(rows.length,205);assert.equal(new Set(rows.map(r=>r.id)).size,205);assert(db.reads.some(r=>r.start===200));
});
test('Job context includes other customer Jobs even without a direct conversation',async()=>{
 const another='20000000-0000-0000-0000-000000000002';
 const db=database({jobs:[{id:job,customer_id:customer,company_id:company},{id:another,customer_id:customer,company_id:company}],conversations:[convo(1,another),convo(2)]});
 assert.equal((await api.resolveCustomerThread(db,{customer,job,conversation:null})).length,2);
});
test('customer without conversations returns empty without writes',async()=>{assert.equal((await api.resolveCustomerThread(database(),{customer,job:null,conversation:null})).length,0)});
test('direct older conversation expands the customer group',async()=>{assert.equal((await api.resolveCustomerThread(database({conversations:[convo(1),convo(2)]}),{customer:null,job:null,conversation:id(2)})).length,2)});
test('cross-company, mismatched customer and unauthorized Job fail closed',async()=>{
 for(const fixture of [{jobs:[{id:job,customer_id:customer,company_id:'other'}]},{jobs:[{id:job,customer_id:'other',company_id:company}]},{jobs:[{id:job,customer_id:customer,company_id:company}],deny:true}]) await assert.rejects(api.resolveCustomerThread(database(fixture),{customer,job,conversation:null}));
 await assert.rejects(api.resolveCustomerThread(database({conversations:[{...convo(1),company_id:'other'}]}),{customer,job:null,conversation:id(1)}));
});
test('inaccessible linked Job and lookup errors never return partial history',async()=>{
 await assert.rejects(api.resolveCustomerThread(database({conversations:[convo(1,job)]}),{customer,job:null,conversation:null}));
 await assert.rejects(api.resolveCustomerThread(database({errorTable:'communication_conversations'}),{customer,job:null,conversation:null}));
});
test('return paths preserve tabs and reject external or unrelated paths',()=>{
 const path=`/dashboard/leads/${job}?tab=finance&financeSection=payments`;assert.equal(api.workspaceReturnTo(path),path);
 for(const path of ['https://evil.test','//evil.test','/dashboard/leads/%2f%2fevil','/dashboard/settings',`/dashboard/leads/${job}\\x`]) assert.equal(api.workspaceReturnTo(path),null);
 const u=new URL(api.customerCommunicationsHref(customer,job,path),'https://qa.invalid');assert.equal(u.searchParams.get('returnTo'),path);assert.equal(u.searchParams.get('job'),job);
});
test('known origin returns through history; direct entry uses validated fallback',()=>{
 const origin=`/dashboard/customers/${customer}?tab=activity`,href=api.customerCommunicationsHref(customer,undefined,origin);
 const b=browser(new URL(href,'https://qa.invalid').search);b.win.sessionStorage.removeItem=()=>{};
 b.win.sessionStorage.setItem('wra-hub-entry',JSON.stringify({href:api.hubDestination(b.win.location.search,{}),origin}));api.claimHubOrigin(b.win);
 api.navigateHub(b.win,{conversation:id(1)},'replace');api.navigateHub(b.win,{tab:'activity'});
 let delta;b.win.history.go=d=>{delta=d};api.backToHubList(b.win);assert.equal(delta,-2);
 const direct=browser(new URL(href,'https://qa.invalid').search);let target;direct.win.location.replace=v=>{target=v};api.backToHubList(direct.win);assert.equal(target,origin);
});
test('grouping uses canonical company/customer only, never phone/email',()=>{
 const hub=fs.readFileSync(new URL('./CommunicationsHub.tsx',import.meta.url),'utf8');const key=hub.slice(hub.indexOf('function getCustomerThreadKey'),hub.indexOf('function getConversationStatusRank'));
 assert(!key.includes('customerPhone'));assert(!key.includes('customerEmail'));assert(key.includes('companyId'));assert(!source.includes("eq('service_request_id', input.job)"));
});
test('Customer/Job entry preserves the originating tab and ignores rapid duplicate clicks',()=>{
 const b=browser();b.win.location={origin:'https://qa.invalid',href:`https://qa.invalid/dashboard/leads/${job}?financeSection=payments`,pathname:`/dashboard/leads/${job}`,search:'?financeSection=payments'};
 const targets=[];api.enterCustomerCommunications(b.win,customer,job,v=>targets.push(v),'finance');api.enterCustomerCommunications(b.win,customer,job,v=>targets.push(v),'finance');
 assert.equal(targets.length,1);const params=new URL(targets[0],b.win.location.origin).searchParams;assert.equal(params.get('customer'),customer);assert.equal(params.get('job'),job);assert(params.get('returnTo').includes('tab=finance'));assert(params.get('returnTo').includes('financeSection=payments'));
});

test('Customer quick actions are exactly Call, Text, Email, Communications with existing navigation',()=>{
 const s=fs.readFileSync(new URL('../DashboardCustomers.tsx',import.meta.url),'utf8');
 const row=s.match(/<section className="grid grid-cols-4 gap-2 px-2 py-3">([\s\S]*?)<\/section>/)[1];
 assert.deepEqual([...row.matchAll(/label="([^"]+)"/g)].map(m=>m[1]),['Call','Text','Email','Communications']);
 assert.match(row,/enterCustomerCommunications\(window, customerId, undefined, href => router.push\(href\)\)/);
 assert.match(row,/onClick={customer.phone \? \(\) => setIsBrowserCallOpen\(true\) : undefined}/);
 assert.match(row,/href={customerSmsHref}/);assert.match(row,/href={customerEmailHref}/);
 assert(!s.includes('>Communications</button>'));
});
test('Customer header menu, More tab and existing Customer Actions remain available',()=>{
 const s=fs.readFileSync(new URL('../DashboardCustomers.tsx',import.meta.url),'utf8');
 const start=s.indexOf('aria-label="More customer actions"',s.indexOf('export function DashboardCustomerDetail'));
 const header=s.slice(start,start+600);
 assert.match(header,/openCustomerActions/);assert.match(header,/name="more"/);
 for(const label of ['Overview','Jobs','Assets','More']) assert(s.includes(`label: "${label}"`));
 for(const action of ['Copy Customer Info','Copy Primary Address','New Job','Add Internal Note']) assert(s.includes(action));
});
test('Communications uses blue circular messages-square icon and bounded mobile label',()=>{
 const s=fs.readFileSync(new URL('../DashboardCustomers.tsx',import.meta.url),'utf8');
 const action=s.slice(s.indexOf('function CustomerQuickAction('),s.indexOf('type BrowserCallStatus'));
 assert.match(action,/Communications: "messages-square"/);assert.match(action,/h-10 w-10.*rounded-full.*text-\[#0F6BFF\]/);
 assert.match(action,/min-w-0/);assert.match(action,/max-w-full break-words text-center text-\[10px\]/);
 assert(s.includes('if (name === "messages-square")'));
});
