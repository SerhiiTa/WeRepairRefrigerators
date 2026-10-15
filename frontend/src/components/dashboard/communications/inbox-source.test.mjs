import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
function load(name,dependencies={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(read(name),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{exports,React,require:key=>dependencies[key]});
 return exports;
}
const policy=load('./communication-source.ts');
const {CommunicationSourceIcon}=load('./CommunicationSourceIcon.tsx',{'./communication-source':policy});
const hub=read('./CommunicationsHub.tsx');
for (const [source,glyph,label] of [['phone','phone','Phone'],['sms','message','SMS'],['website_form','globe','Website'],['email','mail','Email'],['web_chat','message','Web Chat'],['ai_chatbot','bot','AI Chatbot']]) {
 test(`${source} identity and accessible icon`,()=>{
  assert.equal(policy.getCommunicationSource({source}).glyph,glyph);
  const html=renderToStaticMarkup(React.createElement(CommunicationSourceIcon,{source}));
  assert.match(html,new RegExp(`aria-label="${label}"`));assert.match(html,/<svg/);
 });
}
test('future brands use explicit neutral fallback, not imitation logos',()=>{
 for (const source of ['instagram','facebook','facebook_messenger','yelp','thumbtack','whatsapp','telegram']) {
  const result=policy.getCommunicationSource({source});assert.equal(result.fallback,true);assert.equal(result.glyph,'generic');
 }
});
test('unknown source retains known channel; provider and message never infer source',()=>{
 assert.equal(policy.getCommunicationSource({source:'unknown',channel:'sms',handler:'retell'}).label,'SMS');
 assert.equal(policy.getCommunicationSource({source:'__proto__'}).label,'Other');
 assert.equal(policy.getCommunicationSource({handler:'retell',message:'Instagram'}).label,'Other');
 assert.equal(policy.getCommunicationSource({source:'website_form',channel:'sms'}).label,'Website');
});
test('one deterministic business attention badge independent of unread acknowledgment',()=>{
 assert.equal(policy.getConversationAttention('needs_action',7).label,'Needs Action');
 assert.equal(policy.getConversationAttention('needs_action',0).label,'Needs Action');
 assert.equal(policy.getConversationAttention('open',0).label,'Needs Review');
 assert.equal(policy.getConversationAttention('resolved',5),null);
 assert.equal(policy.getConversationAttention('archived',5),null);
 assert.equal(policy.getConversationAttention('unknown',1).label,'New');
 assert.equal(policy.getConversationAttention('unknown',0),null);
 assert.equal((hub.match(/<Badge tone=\{attention.tone\}>\{attention.label\}<\/Badge>/g)||[]).length,2);
 assert.doesNotMatch(hub,/flags.slice|<Badge tone="blue">\{getSourceLabel\(conversation.sourceType\)\}/);
});
const effectStart=hub.indexOf('  useEffect(() => {',hub.indexOf('  const selectedConversation = useMemo'));
const effect=hub.slice(effectStart+'  useEffect(() => {'.length,hub.indexOf('  }, [',effectStart));
async function acknowledge({desktop=false,open=true,visibility='visible',error=null}={}) {
 let timer,listener;const calls=[],updates=[];
 const document={visibilityState:visibility,addEventListener:(name,fn)=>{listener=fn;},removeEventListener:()=>{}};
 const ctx=vm.createContext({document,window:{matchMedia:()=>({matches:desktop}),setTimeout:fn=>{timer=fn;},clearTimeout:()=>{}},isConversationVisible:policy.isConversationVisible,mobileDetailOpen:open,selectedConversationId:'a',detailState:{status:'ready'},selectedConversation:{id:'a',unreadCount:2,threadConversationIds:['a','b']},getSupabaseBrowserClient:()=>({rpc:async(name,args)=>{calls.push([name,args]);return {error};}}),setRawConversations:fn=>updates.push(fn([{id:'a',unreadCount:2,status:'needs_action'}])),setHubState:fn=>updates.push(fn({conversations:[{id:'a',unreadCount:2,status:'needs_action'}]}))});
 vm.runInContext(`function run(){${effect}};run();`,ctx);timer();await new Promise(resolve=>setImmediate(resolve));
 return {calls,updates,foreground:async()=>{document.visibilityState='visible';listener();await new Promise(resolve=>setImmediate(resolve));}};
}
test('acknowledges visible conversation using existing RPC, preserves business status',async()=>{
 const h=await acknowledge();assert.equal(h.calls.length,2);assert.equal(h.calls[0][0],'mark_communication_conversation_read_rpc');assert.equal(h.updates[0][0].unreadCount,0);assert.equal(h.updates[0][0].status,'needs_action');
});
test('failed acknowledgment never clears unread',async()=>assert.equal((await acknowledge({error:{message:'failed'}})).updates.length,0));
test('hidden mobile pane is not read; desktop pane is read',async()=>{assert.equal((await acknowledge({open:false})).calls.length,0);assert.equal((await acknowledge({desktop:true,open:false})).calls.length,2);});
test('background document waits for foreground',async()=>{const h=await acknowledge({visibility:'hidden'});assert.equal(h.calls.length,0);await h.foreground();assert.equal(h.calls.length,2);});
test('workflow filtering respects unread, actions and archive without assignment guesses',()=>{
 for(const status of ['open','needs_action','resolved','archived']) {
  const archived=['resolved','archived'].includes(status);
  assert.equal(policy.matchesInboxWorkflow(status,2,'archived'),archived);
  assert.equal(policy.matchesInboxWorkflow(status,0,'inbox'),!archived);
  assert.equal(policy.matchesInboxWorkflow(status,0,'unread'),false);
  assert.equal(policy.matchesInboxWorkflow(status,2,'unread'),!archived);
  assert.equal(policy.matchesInboxWorkflow(status,2,'needs_action'),status==='needs_action');
 }
 assert.match(hub,/<option disabled>Assigned to Me — unavailable/);
});
test('canonical channel filters never infer source from content',()=>{
 for(const source of ['phone','sms','website_form','web_chat','email','instagram','facebook_messenger','whatsapp','telegram','other']) {
  assert.equal(policy.matchesInboxChannel(source,'all'),true);
  assert.equal(policy.matchesInboxChannel(source,'calls'),source==='phone');
  assert.equal(policy.matchesInboxChannel(source,'messages'),['sms','instagram','facebook_messenger','whatsapp','telegram'].includes(source));
  assert.equal(policy.matchesInboxChannel(source,'web'),['website_form','web_chat'].includes(source));
 }
 assert.equal(policy.matchesInboxChannel('sms','web'),false);
});
test('search combines with channel and workflow; selected conversation is not reset',()=>{
 const body=hub.slice(hub.indexOf('    return hubState.conversations.filter'),hub.indexOf('  }, [activeFilter, hubState.conversations'));
 const filter=(activeFilter,searchQuery,inboxTab='inbox')=>vm.runInNewContext(`(()=>{const query=searchQuery.toLowerCase();${body}})()`,{activeFilter,searchQuery,inboxTab,hubState:{conversations:[{sourceType:'phone',status:'open',customerPhone:'111',summary:'Alice'},{sourceType:'sms',status:'open',customerPhone:'222',summary:'Alice https://site.test'},{sourceType:'website_form',status:'archived',summary:'Alice'}]},hasConversationChannel:c=>policy.matchesInboxChannel(c.sourceType,activeFilter,c.unreadCount),matchesInboxWorkflow:policy.matchesInboxWorkflow,getConversationTitle:()=>'',getSourceLabel:x=>x,formatProviderName:()=>''});
 assert.equal(filter('messages','alice').length,1);
 assert.equal(filter('calls','222').length,0);
 assert.equal(filter('web','alice','archived').length,1);
 assert.doesNotMatch(body,/setSelectedConversationId/);
});
test('mobile rows have natural compact height with no empty badge container',()=>{
 const start=hub.indexOf('filteredConversations.map((conversation) => {');
 const end=hub.indexOf('\n                })',start);
 const callback=hub.slice(start+'filteredConversations.map('.length,end)+'\n                })';
 const ctx=vm.createContext({React,CommunicationSourceIcon,getConversationAttention:policy.getConversationAttention,getConversationTitle:c=>c.title,getConversationPreview:c=>c.preview,formatActivity:()=> 'Yesterday',formatProviderName:()=>'',openConversation:()=>{},Badge:({children})=>React.createElement('span',{'data-attention':true},children)});
 vm.runInContext(ts.transpileModule('const row = '+callback.slice(0,-1)+'; globalThis.row=row;',{compilerOptions:{jsx:ts.JsxEmit.React}}).outputText,ctx);
 const render=status=>renderToStaticMarkup(ctx.row({id:'a',sourceType:'sms',status,unreadCount:0,title:'Long customer name '.repeat(10),preview:'Long preview '.repeat(30),customerPhone:'12345678901234567890'}));
 const plain=render('linked');assert.match(plain,/block h-auto min-h-11/);assert.match(plain,/line-clamp-2 break-words/);assert.doesNotMatch(plain,/mt-1 flex flex-wrap|data-attention/);
 assert.equal((render('needs_action').match(/data-attention/g)||[]).length,1);
});
test('source icons use lightweight colored outlines without filled tiles',()=>{
 for(const source of ['phone','sms','website_form','web_chat','email','ai_chatbot']) {
  const html=renderToStaticMarkup(React.createElement(CommunicationSourceIcon,{source}));
  assert.match(html,/h-10 w-10/);assert.match(html,/rounded-xl/);assert.match(html,/width="26" height="26"/);assert.match(html,/stroke-width="1.5"/);assert.match(html,/fill="none"/);assert.doesNotMatch(html,/bg-|text-white|fill="currentColor"|shadow|gradient/);
 }
});
test('row selection, search, mobile containment and desktop structure retained',()=>{
 assert.equal((hub.match(/onClick=\{\(\) => openConversation\(conversation.id\)\}/g)||[]).length,2);
 assert.match(hub,/onChange=\{\(event\) => setSearchQuery\(event.target.value\)\}/);
 assert.match(hub,/h-11 w-full min-w-0/);assert.match(hub,/max-w-\[30%\]/);assert.match(hub,/line-clamp-2 break-words/);
 assert.match(hub,/min-h-11 min-w-11 flex-1/);
 assert.match(hub,/shadow-\[inset_3px_0_0_#0F6BFF\]/);
 assert.equal((hub.match(/<CommunicationSourceIcon source=\{conversation.sourceType\} \/>/g)||[]).length,2);
});

test('mobile card removes duplicate heading and preserves subtitle and controls',()=>{
 const mobile=hub.slice(hub.indexOf('<section className="xl:hidden">'),hub.indexOf(') : selectedConversation ? ('));
 assert.doesNotMatch(mobile,/<h1/);
 assert.match(mobile,/Calls, texts, and web requests in one timeline/);
 assert.match(mobile,/aria-label="New communication"/);
 assert.match(mobile,/Search conversations/);
 assert.match(mobile,/Conversation channels/);
 assert.match(mobile,/Workflow filter/);
 assert.match(hub,/<h1 className="text-2xl font-semibold text-\[#0F172A\]">Communications<\/h1>/);
});
