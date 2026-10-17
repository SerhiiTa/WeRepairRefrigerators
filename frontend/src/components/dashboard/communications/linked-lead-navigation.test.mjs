import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const source = readFileSync(new URL('./CommunicationsHub.tsx', import.meta.url), 'utf8');
const id = '11111111-1111-4111-8111-111111111111';
const detail = { lead: { id, conversation_id: 'conversation', customer_name: 'Test' } };
const ctx = vm.createContext({ React, getStatusLabel: () => 'New', Panel: ({children}) => React.createElement('section', null, children), ContextRow: () => null, EmptyState: () => null });
vm.runInContext(ts.transpileModule(source.slice(source.indexOf('function LeadPanel('), source.indexOf('function MobileJobPanel(')), { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText, ctx);
const render = (name, props) => renderToStaticMarkup(React.createElement(ctx[name], { detail, state: {}, ...props }));
const guard = source.match(/const canOpenLinkedLead = (Boolean\([\s\S]*?\n  \));/)[1];
const eligible = (overrides = {}) => vm.runInNewContext(guard, { detailState: {status:'ready'}, linkedLeadId:id, detail, selectedConversation:{threadConversationIds:['conversation']}, ...overrides });
test('linked Lead action and 44px target', () => {
 assert.equal(eligible(), true);
 assert.match(render('LeadPanel', {onOpenLead(){}}), /min-h-11 min-w-11/);
 assert.match(render('LeadPanel', {onOpenLead(){}}), /Open Lead →/);
});
test('no Lead hides navigation', () => {
 assert.doesNotMatch(render('LeadPanel', {detail:{lead:null}}), /Open Lead/);
 assert.equal(eligible({linkedLeadId:null,detail:{lead:null}}), false);
});
test('loading, stale and invalid IDs blocked', () => {
 assert.equal(eligible({detailState:{status:'loading'}}), false);
 assert.equal(eligible({selectedConversation:{threadConversationIds:['other']}}), false);
 assert.equal(eligible({linkedLeadId:'../job'}), false);
});
test('mobile uses shared action', () => assert.match(render('MobileLeadPanel', {onOpenLead(){}}), /Open Lead →/));
test('both layouts reuse handler', () => {
 assert.match(source, /<MobileLeadPanel[\s\S]*?onOpenLead=\{canOpenLinkedLead \? \(\) => void handleCreateLeadFromConversation\(\)/);
 assert.match(source, /\{canOpenLinkedLead \? \(\s*<LeadPanel[\s\S]*?onOpenLead=\{\(\) => void handleCreateLeadFromConversation\(\)\}/);
});
const handler = source.slice(source.indexOf('  async function handleCreateLeadFromConversation()'),source.indexOf('  async function handleSendMessage()'));
async function navigate(allowed, clicks = 1) {
 const urls=[];
 const c=vm.createContext({selectedConversation:{},linkedLeadId:id,canOpenLinkedLead:allowed,destinationReturnTo:"/dashboard/communications",window:{location:{pathname:"/dashboard/communications",search:""},history:{state:{},replaceState(){}}},router:{push:url=>urls.push(url)},leadNavigationPendingRef:{current:false},withReturnTo:url=>url+'?returnTo=context',setCreateJobState:()=>{throw Error('Unexpected creation');}});
 vm.runInContext(ts.transpileModule(handler,{}).outputText,c);
 for (let click = 0; click < clicks; click++) await c.handleCreateLeadFromConversation();
 return urls;
}
test('canonical Lead route, return context, no creation',async()=>assert.deepEqual(await navigate(true),[`/dashboard/communication-leads/${id}?returnTo=context`]));
test('stale Lead cannot navigate or create',async()=>assert.deepEqual(await navigate(false),[]));
test('button invokes only supplied callback',()=>{
 let calls=0;
 const panel=ctx.LeadPanel({detail,onOpenLead:()=>calls++,state:{}});
 const button=panel.props.children.props.children[0];
 button.props.onClick();
 assert.equal(calls,1);
 assert.equal(button.props.type,'button');
});

test('repeated clicks enqueue only one Next router navigation', async () => {
 assert.equal((await navigate(true, 2)).length, 1);
 assert.doesNotMatch(handler.slice(0, handler.indexOf('setCreateJobState')), /location\.assign|router\.replace/);
});
test('real returnTo builder encodes conversation and filters safely', () => {
 const start = source.indexOf('  const buildCommunicationsReturnTo =');
 const end = source.indexOf('  const openConversation =', start);
 const wrapper = source.slice(source.indexOf('  const destinationReturnTo ='),source.indexOf('  const linkedLeadId ='));
 const c = vm.createContext({URLSearchParams, mobileDetailTab:'activity', selectedConversationId:'conversation', activeFilter:'texts', inboxTab:'assigned', searchQuery:'a&b # test'});
 vm.runInContext(ts.transpileModule(source.slice(start,end)+wrapper+`; globalThis.destination = withReturnTo('/dashboard/communication-leads/${id}');`,{}).outputText,c);
 const url = new URL(c.destination,'https://example.test');
 const back = new URL(url.searchParams.get('returnTo'),'https://example.test');
 assert.equal(back.pathname,'/dashboard/communications');
 assert.equal(back.searchParams.get('conversation'),'conversation');
 assert.equal(back.searchParams.get('view'),'detail');
 assert.equal(back.searchParams.get('tab'),'activity');
 assert.equal(back.searchParams.get('q'),'a&b # test');
 assert.equal(back.searchParams.get('channel'),'texts');
 assert.equal(back.searchParams.get('box'),'assigned');
});
test('conversation history and initial selection remain intact for Back', () => {
 assert.match(source, /navigateHub\(window, \{ conversation: conversationId, customer: null, job: null, view: "detail", tab: "conversation" \}\)/);
 assert.match(source, /getInitialQueryParam\("conversation"\)/);
 assert.match(source, /const router = useRouter\(\)/);
});
