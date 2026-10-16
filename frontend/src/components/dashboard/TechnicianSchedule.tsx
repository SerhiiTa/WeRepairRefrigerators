"use client";

import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";
import {SERVICE_REQUEST_STATUS_LABELS} from "@/lib/service-request-records";
import {getSupabaseBrowserClient} from "@/lib/supabase/client";
import {loadAppointments,loadTechnicians,loadScheduleCompanies} from "./schedule/data";
import {appointmentTone,dateKey,dateLabel,filterAppointments,initials,minutes,monthDates,positionAppointments,shiftDate,technicianName,timeLabel,timeRange,UNASSIGNED,visibleHours,weekDates,type Appointment,type Technician,type View} from "./schedule/board";
import s from "./schedule/board.module.css";

const views:View[]=["Day","Week","Technicians","List"];
function jobStatus(a:Appointment){return a.request?SERVICE_REQUEST_STATUS_LABELS[a.request.status]??a.request.status:"Job status unavailable";}
function Card({a,onSelect,selected,compact=false}:{a:Appointment;onSelect:(id:string)=>void;selected:boolean;compact?:boolean}) {
 return <button type="button" className={`${s.card} ${s[appointmentTone(a)]} ${selected?s.selected:""} ${compact?s.compact:""}`} onClick={()=>onSelect(a.id)} aria-label={`${a.request?.customerName||"Customer unavailable"}, ${timeRange(a)}, ${jobStatus(a)}${!a.technicianProfileId?", Unassigned":""}`} aria-pressed={selected}>
  <span className={s.cardTime}>{timeRange(a)}</span><strong>{a.request?.customerName||"Customer unavailable"}</strong>
  <span>{[a.request?.applianceBrand,a.request?.applianceType].filter(Boolean).join(" ")||"Appliance unavailable"}</span>
  {a.request?.issueDescription&&<span className={s.ellipsis}>{a.request.issueDescription}</span>}
  <span className={s.cardBottom}><span>{[a.request?.city,a.request?.state].filter(Boolean).join(", ")}</span>{a.request?.jobNumber!=null&&<span>#{a.request.jobNumber}</span>}</span>
  <span className={s.badges}><span>{jobStatus(a)}</span>{!a.technicianProfileId&&<span>Unassigned</span>}{a.status==="no_show"&&<span>Needs attention · No show</span>}</span>
 </button>;
}
function MiniCalendar({date,onDate}:{date:string;onDate:(v:string)=>void}) {
 const [month,setMonth]=useState(date.slice(0,7)+"-01");
 function move(n:number){const d=new Date(month+"T12:00:00");d.setMonth(d.getMonth()+n);setMonth(dateKey(d));}
 return <section className={s.mini} aria-label="Calendar"><div className={s.miniHeading}><button aria-label="Previous month" onClick={()=>move(-1)}>‹</button><strong>{new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(month+"T12:00:00"))}</strong><button aria-label="Next month" onClick={()=>move(1)}>›</button></div><div className={s.monthGrid}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><span key={d}>{d}</span>)}{monthDates(month).map(d=><button key={d} className={`${d===date?s.chosenDate:""} ${d.slice(0,7)!==month.slice(0,7)?s.dim:""}`} aria-label={dateLabel(d)} aria-pressed={d===date} onClick={()=>onDate(d)}>{Number(d.slice(-2))}</button>)}</div></section>;
}
function Details({a,technicians,onClose}:{a:Appointment;technicians:Technician[];onClose:()=>void}) {
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[a.id]);
 const href=`/dashboard/leads/${encodeURIComponent(a.serviceRequestId)}`;
 const technician=a.technicianProfileId?technicianName(technicians.find(t=>t.id===a.technicianProfileId)):"Unassigned";
 return <section className={s.details} aria-labelledby="schedule-detail-title" onKeyDown={e=>{if(e.key==="Escape")onClose();}}>
  <header><h2 id="schedule-detail-title" ref={heading} tabIndex={-1}>Job Details</h2><button aria-label="Close Job Details" onClick={onClose}>×</button></header>
  <div className={s.detailMeta}><span className={s.badge}>{jobStatus(a)}</span><span>{a.request?.jobNumber!=null?`#${a.request.jobNumber}`:"Job number unavailable"}</span></div>
  <h3>{a.request?.customerName||"Customer unavailable"}</h3>{a.phone&&<a href={`tel:${a.phone.replace(/[^+\d]/g,"")}`} className={s.phone}>{a.phone} · Call</a>}
  <dl><dt>Service address</dt><dd>{a.address||[a.request?.city,a.request?.state,a.request?.zipCode].filter(Boolean).join(", ")||"Unavailable"}</dd>
   <dt>Appliance / Brand</dt><dd>{[a.request?.applianceType,a.request?.applianceBrand].filter(Boolean).join(" · ")||"Unavailable"}</dd>
   <dt>Problem</dt><dd>{a.request?.issueDescription||"Unavailable"}</dd>
   <dt>Appointment</dt><dd>{dateLabel(a.appointmentDate)}<br/>{timeRange(a)}<br/><span className={s.muted}>Appointment status: {a.status.replaceAll("_"," ")}</span></dd>
   <dt>Technician</dt><dd>{technician}</dd>
  </dl>
  <div className={s.detailActions}><Link className={s.primary} href={`${href}?tab=appointment`}>Assign Technician</Link><Link className={s.button} href={`${href}?tab=appointment`}>Edit Appointment</Link><Link className={s.button} href={href}>Open Job</Link></div>
 </section>;
}
export function TechnicianSchedule() {
 const [date,setDate]=useState(()=>dateKey());const [view,setView]=useState<View>("Day");
 const [rows,setRows]=useState<Appointment[]>([]);const [technicians,setTechnicians]=useState<Technician[]>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [retry,setRetry]=useState(0);
 const [filters,setFilters]=useState(false);const [search,setSearch]=useState("");const [selectedTechs,setSelectedTechs]=useState<string[]>([]);const [status,setStatus]=useState("");const [selected,setSelected]=useState<string|null>(null);
 const boardRef=useRef<HTMLDivElement>(null);
 const dates=weekDates(date),start=dates[0],end=dates[6];
 useEffect(()=>{
  let active=true;const client=getSupabaseBrowserClient();
  // Clear stale date results while a newly selected week loads.
  void Promise.resolve().then(async()=>{
   if(!active)return;setLoading(true);setError("");
   try {if(!client)throw new Error("Schedule is unavailable: sign in and check your connection.");
    const companies=await loadScheduleCompanies(client);
    const [appointments,staff]=await Promise.all([loadAppointments(client,start,end,companies),loadTechnicians(client,companies)]);
    if(active){setRows(appointments);setTechnicians(staff);}
   }catch(e){if(active){setRows([]);setError(e instanceof Error?e.message:"Could not load Schedule.");}}
   finally{if(active)setLoading(false);}
  });return ()=>{active=false;};
 },[start,end,retry]);
 const allTechnicians=useMemo(()=>{
  const map=new Map(technicians.map(t=>[t.id,t]));
  rows.forEach(a=>{if(a.technicianProfileId&&!map.has(a.technicianProfileId))map.set(a.technicianProfileId,{id:a.technicianProfileId,display_name:null,business_name:null});});return [...map.values()];
 },[rows,technicians]);
 const shownTechnicians=allTechnicians.filter(t=>(!selectedTechs.length||selectedTechs.includes(t.id))&&technicianName(t).toLowerCase().includes(search.toLowerCase()));
 const filtered=filterAppointments(rows,selectedTechs,status).filter(a=>!a.technicianProfileId||(!search||technicianName(allTechnicians.find(t=>t.id===a.technicianProfileId)).toLowerCase().includes(search.toLowerCase())));
 const dayRows=filtered.filter(a=>a.appointmentDate===date);
 const periodRows=view==="Week"?filtered:dayRows;
 const columns=[{id:UNASSIGNED,name:"Unassigned"},...shownTechnicians.map(t=>({id:t.id,name:technicianName(t)}))];
 const selectedAppointment=rows.find(a=>a.id===selected);
 const hours=visibleHours(dayRows);const scale=1.3;const ticks=Array.from({length:(hours.end-hours.start)/60+1},(_,i)=>hours.start+i*60);
 const statuses=[...new Set(rows.flatMap(a=>a.request?[a.request.status]:[]))];
 function pick(id:string){setSelected(id);}
 function closeDetails(){setSelected(null);boardRef.current?.focus();}
 function changeDate(value:string){if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&dateKey(new Date(value+"T12:00:00"))===value)setDate(value);}
 const cards=(items:Appointment[])=>items.length?items.map(a=><Card key={a.id} a={a} onSelect={pick} selected={selected===a.id}/>):<p className={s.empty}>No appointments</p>;
 return <div className={s.board}>
  <header className={s.pageHeader}><div><h1>Schedule</h1><p>Manage appointments, assign technicians, and keep your team on track.</p></div><div className={s.headerActions}><button className={s.button} aria-expanded={filters} onClick={()=>setFilters(!filters)}>☷ Filters{selectedTechs.length||status?" · Active":""}</button><Link className={s.primary} href="/dashboard/leads?newJob=1" title="Create a Job in the existing Jobs workspace">＋ New Job</Link></div></header>
  <div className={s.layout}><main className={s.main}>
   <nav className={s.toolbar} aria-label="Schedule navigation"><div className={s.dateControls}><button className={s.button} aria-label="Previous day" onClick={()=>setDate(shiftDate(date,-1))}>‹</button><button className={s.button} aria-label="Next day" onClick={()=>setDate(shiftDate(date,1))}>›</button><input className={s.dateInput} type="date" value={date} aria-label="Schedule date" onChange={e=>changeDate(e.target.value)}/><button className={s.button} onClick={()=>setDate(dateKey())}>Today</button></div><div className={s.tabs} aria-label="Schedule view">{views.map(v=><button key={v} aria-pressed={view===v} className={view===v?s.activeTab:""} onClick={()=>setView(v)}>{v}</button>)}</div></nav>
   {filters&&<section className={s.filters} aria-label="Schedule filters"><label>Technician search<input type="search" placeholder="Search technicians" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Job status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map(v=><option key={v} value={v}>{SERVICE_REQUEST_STATUS_LABELS[v]??v}</option>)}</select></label><fieldset><legend>Technicians · select none for all</legend><div className={s.techChoices}>{[{id:UNASSIGNED,name:"Unassigned"},...allTechnicians.map(t=>({id:t.id,name:technicianName(t)}))].filter(t=>t.name.toLowerCase().includes(search.toLowerCase())||t.id===UNASSIGNED).map(t=><label key={t.id}><input type="checkbox" checked={selectedTechs.includes(t.id)} onChange={e=>setSelectedTechs(old=>e.target.checked?[...old,t.id]:old.filter(id=>id!==t.id))}/>{t.name}</label>)}</div></fieldset><button className={s.button} onClick={()=>{setSelectedTechs([]);setStatus("");setSearch("");}}>Clear filters</button></section>}
   <div ref={boardRef} tabIndex={-1} className={s.content} aria-busy={loading}>
    {loading?<p className={s.empty} role="status">Loading appointments…</p>:error?<div className={s.empty} role="alert"><p>{error}</p><button className={s.button} onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:<>
    {view==="Day"&&<><div className={s.desktopGrid}><div className={s.gridScroll} tabIndex={0} aria-label="Day grid. Scroll horizontally for more technicians."><div className={s.timeColumn}><div className={s.columnHeading}/><div className={s.timeBody} style={{height:(hours.end-hours.start)*scale+28}}>{ticks.map(t=><span key={t} style={{top:(t-hours.start)*scale}}>{timeLabel(`${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`)}</span>)}</div></div>{columns.map(column=>{
     const items=dayRows.filter(a=>(a.technicianProfileId??UNASSIGNED)===column.id);const placed=positionAppointments(items);const lanes=Math.max(1,...placed.map(p=>p.lanes));
     return <section key={column.id} className={`${s.gridColumn} ${column.id===UNASSIGNED?s.unassignedColumn:""}`} style={{width:Math.max(250,lanes*155)}}><header className={s.columnHeading}><span className={s.avatar}>{column.id===UNASSIGNED?"—":initials(column.name)}</span><div><strong>{column.name}</strong><small>{column.id===UNASSIGNED?"Jobs without a technician":"Appointments"}</small></div><span className={s.count}>{items.length}</span></header><div className={s.columnBody} style={{height:(hours.end-hours.start)*scale+28,backgroundSize:`100% ${60*scale}px`}}>{placed.map(p=><div key={p.appointment.id} className={s.placedCard} style={{top:(minutes(p.appointment.windowStartTime)-hours.start)*scale,height:Math.max(24,(minutes(p.appointment.windowEndTime)-minutes(p.appointment.windowStartTime))*scale-4),left:`calc(${p.lane/p.lanes*100}% + 4px)`,width:`calc(${100/p.lanes}% - 8px)`}}><Card a={p.appointment} onSelect={pick} selected={selected===p.appointment.id} compact/></div>)}</div></section>;
    })}</div></div><div className={s.mobileDay}><h2>{dateLabel(date)}</h2>{cards(dayRows)}</div></>}
    {view==="Week"&&<div className={s.week}>{dates.map(d=><section key={d}><button className={s.weekHeading} onClick={()=>{setDate(d);setView("Day");}} aria-label={`Open ${dateLabel(d)}`}>{dateLabel(d,true)}<small>{new Intl.DateTimeFormat("en-US",{weekday:"short"}).format(new Date(d+"T12:00:00"))}</small></button>{cards(filtered.filter(a=>a.appointmentDate===d))}</section>)}</div>}
    {view==="Technicians"&&<div className={s.technicianView}>{columns.map(c=><section key={c.id}><header className={s.groupHeader}><span className={s.avatar}>{c.id===UNASSIGNED?"—":initials(c.name)}</span><h2>{c.name}</h2><span>{dayRows.filter(a=>(a.technicianProfileId??UNASSIGNED)===c.id).length}</span></header>{cards(dayRows.filter(a=>(a.technicianProfileId??UNASSIGNED)===c.id))}</section>)}</div>}
    {view==="List"&&<section className={s.list}><h2>{dateLabel(date)}</h2>{cards(dayRows)}</section>}
    </>}
   </div>
   <footer className={s.footer}><div className={s.legend}>{[["blue","Scheduled"],["green","In progress"],["gray","Completed"],["yellow","Unassigned"],["red","Needs attention"]].map(([tone,label])=><span key={tone}><i className={s[tone]}/>{label}</span>)}</div><span>{loading?"…":periodRows.length} appointments · {loading?"…":periodRows.filter(a=>!a.technicianProfileId).length} unassigned</span><Link href="/dashboard/leads">View all Jobs →</Link></footer>
  </main><aside className={`${s.sidebar} ${selectedAppointment?s.hasSelection:""}`}><MiniCalendar key={date.slice(0,7)} date={date} onDate={changeDate}/>{selectedAppointment?<Details key={selectedAppointment.id} a={selectedAppointment} technicians={allTechnicians} onClose={closeDetails}/>:<div className={s.detailPlaceholder}>Select an appointment to view Job Details.</div>}</aside></div>
 </div>;
}
