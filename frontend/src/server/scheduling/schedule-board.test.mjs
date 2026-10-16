import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function load(source,require=()=>({})){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require,Date,Map,Set,Intl});return exports;}
const b=load(read('../../components/dashboard/schedule/board.ts'));
const records=load(read('../../lib/service-request-records.ts'));
const appointment=(id,start='10:00',end='12:00',tech=null,status='scheduled')=>({id,companyId:'company',technicianProfileId:tech,appointmentDate:'2026-10-19',windowStartTime:start,windowEndTime:end,status,request:{id:'job-'+id,jobNumber:100,customerName:'Synthetic',status:'scheduled'}});
const plain=v=>JSON.parse(JSON.stringify(v));
test('time scale positions AM/PM without reinterpretation',()=>{assert.equal(b.minutes('10:00'),600);assert.equal(b.timeLabel('10:00'),'10:00 AM');assert.equal(b.timeLabel('22:00'),'10:00 PM');assert.equal(b.timeLabel('24:00'),'12:00 AM');assert.equal(b.minutes('10:00')-b.visibleHours([]).start,120);});
test('default hours extend for early and late appointments',()=>{assert.deepEqual(plain(b.visibleHours([])),{start:480,end:1080});assert.deepEqual(plain(b.visibleHours([appointment('1','06:30','23:30')])),{start:360,end:1440});});
test('overlaps receive distinct lanes; adjacent appointments reuse space',()=>{const p=b.positionAppointments([appointment('a'),appointment('b','11:00','13:00'),appointment('c','13:00','14:00')]);assert.equal(p[0].lanes,2);assert.equal(p[1].lane,1);assert.equal(p[2].lanes,1);});
test('nested and chained overlaps remain visible',()=>{const p=b.positionAppointments([appointment('a','09:00','17:00'),appointment('b'),appointment('c','11:00','13:00'),appointment('d','13:00','14:00')]);assert.equal(p.length,4);assert.ok(p.every(v=>v.lanes===3));});
test('week has seven actual dates across month and year',()=>{assert.deepEqual(plain(b.weekDates('2026-12-31')),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);});
test('date navigation handles leap day and DST boundaries',()=>{assert.equal(b.shiftDate('2024-02-28',1),'2024-02-29');assert.equal(b.shiftDate('2026-03-08',1),'2026-03-09');assert.equal(b.shiftDate('2026-11-01',-1),'2026-10-31');});
test('calendar uses valid six-week month grid',()=>{const dates=b.monthDates('2026-10-19');assert.equal(dates.length,42);assert.equal(new Set(dates).size,42);assert.ok(dates.includes('2026-10-19'));});
test('unassigned filtering does not convert status',()=>{const rows=[appointment('a'),appointment('b','10:00','12:00','tech')];assert.equal(b.filterAppointments(rows,['unassigned'],'scheduled')[0].id,'a');assert.equal(rows[0].request.status,'scheduled');});
test('multiple technician and Job status filters',()=>{const rows=[appointment('a',undefined,undefined,'a'),appointment('b',undefined,undefined,'b'),appointment('c')];assert.equal(b.filterAppointments(rows,['a','b'],'scheduled').length,2);assert.equal(b.filterAppointments(rows,[],'completed').length,0);});
test('canonical Job status and supplementary attention remain distinct',()=>{const a=appointment('a');assert.equal(b.appointmentTone(a),'yellow');a.request.status='completed';assert.equal(b.appointmentTone(a),'gray');a.request.status='scheduled';a.status='no_show';assert.equal(b.appointmentTone(a),'red');});
test('missing optional fields do not fabricate names or records',()=>{const a=appointment('a');a.request=null;assert.equal(b.appointmentTone(a),'yellow');assert.equal(b.technicianName(),'Technician details unavailable');});
test('50 technicians retain independent appointments',()=>{const rows=Array.from({length:50},(_,i)=>appointment(String(i),'10:00','12:00','t'+i));assert.equal(b.filterAppointments(rows,[],'').length,50);assert.equal(b.filterAppointments(rows,['t49'],'').length,1);});
const ui=read('../../components/dashboard/TechnicianSchedule.tsx');const css=read('../../components/dashboard/schedule/board.module.css');
test('four functional views and shared navigation state',()=>{for(const v of ['Day','Week','Technicians','List'])assert.ok(ui.includes(`view==="${v}"`));assert.match(ui,/setView\(v\)/);assert.match(ui,/shiftDate\(date,-1\)/);assert.match(ui,/shiftDate\(date,1\)/);assert.match(ui,/setDate\(dateKey\(\)\)/);});
test('grid scales and mobile swaps to cards',()=>{assert.match(ui,/Math\.max\(250,lanes\*155\)/);assert.match(css,/overflow:auto/);assert.match(css,/position:sticky;left:0/);assert.match(css,/@media\(max-width:640px\)/);assert.match(css,/\.desktopGrid\{display:none\}/);assert.match(css,/\.mobileDay\{display:grid/);assert.match(css,/content-visibility:auto/);});
test('details close preserves calendar, actions reuse existing Job workflow',()=>{assert.match(ui,/setSelected\(null\);boardRef/);assert.match(ui,/tab=appointment/);assert.doesNotMatch(ui,/intake_requests|linked_service_request_id|requestedAppointmentReference|extracted_data|raw_payload/);assert.doesNotMatch(ui,/\.rpc\(|\.insert\(|\.update\(|\.delete\(/);});
test('New Job opens existing wizard without modifying its creation contract',()=>{assert.match(ui,/\/dashboard\/leads\?newJob=1/);const inbox=read('../../components/dashboard/ServiceRequestsInbox.tsx');assert.match(inbox,/useState\(initialNewJob\)/);assert.match(read('../../app/dashboard/leads/page.tsx'),/!query.conversationId && !query.customerId/);});
export {load,read,records};
function renderBoard({view='Day',selected=null,rows=[],technicians=[]}={}) {
 const updates=[];let slot=0;const state=['2026-10-19',view,rows,technicians,false,'',0,false,'',[],'',selected];
 const jsx=(type,props)=>({type,props});
 const components=load(ui,name=>{
  if(name==='react')return {useState:init=>{const index=slot++;return [index<state.length?state[index]:(typeof init==='function'?init():init),v=>updates.push([index,v])];},useMemo:f=>f(),useEffect:()=>{},useRef:()=>({current:null})};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='./schedule/board')return b;
  if(name==='@/lib/service-request-records')return records;
  if(name==='./schedule/board.module.css')return {default:new Proxy({},{get:(_,key)=>key})};
  if(name==='next/link')return {default:'a'};
  return {};
 });
 const tree=components.TechnicianSchedule();const nodes=[];
 function walk(node){if(Array.isArray(node)){node.forEach(walk);return;}if(!node||typeof node!=='object')return;nodes.push(node);walk(node.props?.children);}
 walk(tree);return {nodes,updates};
}
test('Day renders unassigned plus all 50 technician columns without compressing them',()=>{const r=renderBoard({technicians:Array.from({length:50},(_,i)=>({id:'t'+i,display_name:'Staff '+i}))});assert.equal(r.nodes.filter(n=>n.props?.className?.startsWith('gridColumn')).length,51);});
test('Week renders seven actual day controls and List preserves chronological cards',()=>{const week=renderBoard({view:'Week'});assert.equal(week.nodes.filter(n=>n.props?.className==='weekHeading').length,7);const list=renderBoard({view:'List',rows:[appointment('early','09:00','10:00'),appointment('late','14:00','15:00')]});assert.deepEqual(list.nodes.filter(n=>n.props?.a).map(n=>n.props.a.id),['early','late']);});
test('Technicians includes unassigned and empty staff groups',()=>{const r=renderBoard({view:'Technicians',technicians:[{id:'t1',display_name:'Staff'}]});assert.equal(r.nodes.filter(n=>n.props?.className==='groupHeader').length,2);});
test('Card selection and closing Details update selection only',()=>{const a=appointment('a');const r=renderBoard({view:'List',rows:[a],selected:'a'});const card=r.nodes.find(n=>n.props?.a&&n.props.onSelect);card.props.onSelect('a');assert.deepEqual(r.updates,[[11,'a']]);const detail=r.nodes.find(n=>n.props?.onClose);detail.props.onClose();assert.deepEqual(r.updates.at(-1),[11,null]);});
