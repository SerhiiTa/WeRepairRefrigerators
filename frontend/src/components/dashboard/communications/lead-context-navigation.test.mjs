import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {getLeadReturnTo, getLeadConversationHref} from './lead-navigation.ts';
const id='a2d57416-69ac-474a-98c6-3741625453f2';
const conversation=getLeadConversationHref(id);
const fallback='/dashboard/communication-leads';
const hub=readFileSync(new URL('./CommunicationsHub.tsx',import.meta.url),'utf8');
const detail=readFileSync(new URL('./CommunicationLeadsWorkspace.tsx',import.meta.url),'utf8');
test('safe Communications returnTo retains canonical conversation',()=>assert.equal(getLeadReturnTo(conversation),conversation));
test('Leads and direct Lead entry use list fallback',()=>{
 for(const value of [undefined,null,'',fallback]) assert.equal(getLeadReturnTo(value),fallback);
});
test('external, encoded, unrelated and looping destinations rejected',()=>{
 for(const value of ['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/dashboard/communication-leads/123','/dashboard/customers','/dashboard/communications?conversation=bad','/dashboard/communications?conversation='+id+'#fragment']) assert.equal(getLeadReturnTo(value),fallback,value);
});
test('missing conversation has no destination',()=>assert.equal(getLeadConversationHref(null),null));
test('both Lead actions use canonical conversation and Back uses validated source',()=>{
 assert.match(detail,/getLeadConversationHref\(lead\?\.conversation_id \?\? null\)/);
 assert.match(detail,/href=\{conversationHref \?\? "#"\}/);
 assert.match(detail,/href=\{conversationHref!\}/);
 assert.match(detail,/href=\{backHref\} replace/);
 assert.match(detail,/No linked conversation/);
});
test('Open Lead preserves source history, pushes once, native Back restores source',async()=>{
 const entries=['/dashboard/communication-leads','/dashboard/communications'];
 const window={location:{pathname:'/dashboard/communications',search:''},history:{state:{marker:'preserve'},replaceState(state,unused,url){assert.equal(state.marker,'preserve');entries[entries.length-1]=url;}}};
 const handler=hub.slice(hub.indexOf('  async function handleCreateLeadFromConversation()'),hub.indexOf('  async function handleSendMessage()'));
 const c=vm.createContext({window,selectedConversation:{},linkedLeadId:id,canOpenLinkedLead:true,leadNavigationPendingRef:{current:false},destinationReturnTo:conversation,withReturnTo:href=>href+'?returnTo='+encodeURIComponent(conversation),router:{push:href=>entries.push(href)},setCreateJobState(){throw Error('unexpected mutation');}});
 vm.runInContext(ts.transpileModule(handler,{}).outputText,c);
 await c.handleCreateLeadFromConversation(); await c.handleCreateLeadFromConversation();
 assert.equal(entries.length,3);
 entries.pop(); // native history Back; no gesture interception
 assert.equal(entries.at(-1),conversation);
});
test('URL restoration reads current conversation on mount and popstate without navigation',()=>{
 const start=hub.indexOf('    const restoreConversationUrl =');
 const end=hub.indexOf('    restoreConversationUrl();',start);
 const values={};
 const pending={current:true};
 const c=vm.createContext({window:{location:{pathname:'/dashboard/communications'}},leadNavigationPendingRef:pending,claimHubOrigin:()=>{},setNavigationContext:()=>{},startTransition:fn=>fn(),getInitialQueryParam:key=>({conversation:id,view:'detail',q:'search',tab:'activity'})[key],getInitialChannelFilter:()=> 'texts',getInitialInboxTab:()=> 'assigned',setSelectedConversationId:v=>values.id=v,setMobileDetailOpen:v=>values.open=v,hubTab:v=>v,setMobileDetailTab:v=>values.tab=v,setActiveFilter:v=>values.filter=v,setInboxTab:v=>values.box=v,setSearchQuery:v=>values.query=v});
 vm.runInContext(ts.transpileModule(hub.slice(start,end)+'restoreConversationUrl();',{}).outputText,c);
 assert.equal(values.tab,'activity');assert.equal(values.id,id);assert.equal(values.open,true);assert.equal(pending.current,false);
 assert.match(hub,/addEventListener\("popstate", restoreConversationUrl\)/);
 assert.match(hub,/removeEventListener\("popstate", restoreConversationUrl\)/);
 assert.doesNotMatch(hub.slice(start,end),/router\.|history\.|location\.(assign|replace)/);
});
