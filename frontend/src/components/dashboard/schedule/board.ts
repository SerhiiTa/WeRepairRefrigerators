import type { DashboardServiceRequestAppointment } from "@/lib/service-request-records";

export type View = "Day" | "Week" | "Technicians" | "List";
export type Technician = {id:string; display_name:string|null; business_name:string|null};
export type Appointment = DashboardServiceRequestAppointment & {phone:string|null; address:string|null};
export const UNASSIGNED = "unassigned";
export function dateKey(date=new Date()):string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
export function shiftDate(key:string,days:number):string {
  const date=new Date(`${key}T12:00:00`); date.setDate(date.getDate()+days); return dateKey(date);
}
export function weekDates(key:string):string[] {
  const day=new Date(`${key}T12:00:00`).getDay(); const start=shiftDate(key,-((day+6)%7));
  return Array.from({length:7},(_,i)=>shiftDate(start,i));
}
export function dateLabel(key:string,short=false):string {
  return new Intl.DateTimeFormat("en-US",short?{month:"short",day:"numeric"}:{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date(`${key}T12:00:00`));
}
export function minutes(time:string):number {const [h,m]=time.split(":").map(Number);return h*60+m;}
export function timeLabel(time:string):string {
  const m=minutes(time); if(!Number.isFinite(m))return "Time unavailable";
  return `${Math.floor(m/60)%12||12}:${String(m%60).padStart(2,"0")} ${m%1440<720?"AM":"PM"}`;
}
export function timeRange(a:Appointment):string {return `${timeLabel(a.windowStartTime)} – ${timeLabel(a.windowEndTime)}`;}
export function visibleHours(rows:Appointment[]) {
  const valid=rows.filter(a=>Number.isFinite(minutes(a.windowStartTime))&&Number.isFinite(minutes(a.windowEndTime)));
  return {start:Math.min(480,...valid.map(a=>Math.floor(minutes(a.windowStartTime)/60)*60)),end:Math.max(1080,...valid.map(a=>Math.ceil(minutes(a.windowEndTime)/60)*60))};
}
// Interval partitioning: touching windows do not overlap; each connected cluster shares lanes.
export function positionAppointments(rows:Appointment[]) {
  const sorted=[...rows].sort((a,b)=>minutes(a.windowStartTime)-minutes(b.windowStartTime)||a.id.localeCompare(b.id));
  const result:{appointment:Appointment;lane:number;lanes:number}[]=[];
  let cluster:typeof result=[];let ends:number[]=[];let clusterEnd=-1;
  const flush=()=>{for(const item of cluster){item.lanes=ends.length;result.push(item);}cluster=[];ends=[];};
  for(const a of sorted){const start=minutes(a.windowStartTime),end=minutes(a.windowEndTime);
    if(start>=clusterEnd){flush();clusterEnd=-1;}
    let lane=ends.findIndex(e=>e<=start);if(lane<0)lane=ends.length;ends[lane]=end;
    cluster.push({appointment:a,lane,lanes:1});clusterEnd=Math.max(clusterEnd,end);
  }flush();return result;
}
export function appointmentTone(a:Appointment):"blue"|"green"|"gray"|"yellow"|"red" {
  if(a.request?.status==="completed"||a.request?.status==="closed"||a.status==="completed"||a.status==="canceled")return "gray";
  if(a.status==="no_show")return "red";
  if(!a.technicianProfileId)return "yellow";
  if(a.request?.status==="diagnosed")return "green";
  return "blue";
}
export function filterAppointments(rows:Appointment[],technicians:string[],status:string) {
  return rows.filter(a=>(!technicians.length||technicians.includes(a.technicianProfileId??UNASSIGNED))&&(!status||a.request?.status===status));
}
export function technicianName(t?:Technician):string {return t?.display_name||t?.business_name||"Technician details unavailable";}
export function initials(name:string):string {return name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join("").toUpperCase();}
export function monthDates(key:string):string[] {
  const first=key.slice(0,7)+"-01";return Array.from({length:42},(_,i)=>shiftDate(first,i-new Date(first+"T12:00:00").getDay()));
}
