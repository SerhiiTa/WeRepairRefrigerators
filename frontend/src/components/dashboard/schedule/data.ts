import { APPOINTMENT_SELECT_COLUMNS, mapAppointmentRow } from "@/lib/service-request-records";
import type { AppointmentRow, ServiceRequestRow } from "@/lib/supabase/types";
import type { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Appointment, Technician } from "./board";
export const SCHEDULE_SELECT = APPOINTMENT_SELECT_COLUMNS.replace("service_requests(","service_requests!appointments_service_request_id_fkey(").replace("issue_description,zip_code","issue_description,customer_phone,full_address,street_address,unit,zip_code");
type Client=NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
// Scope only to the signed-in user's active memberships; RLS remains authoritative.
export async function loadScheduleCompanies(client:Client):Promise<string[]> {
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError||!auth.user)throw new Error("Sign in to view Schedule.");
  const {data,error}=await client.from("company_members").select("company_id").eq("profile_id",auth.user.id).eq("member_status","active").is("archived_at",null).is("removed_at",null).is("suspended_at",null);
  if(error)throw new Error(error.message);
  return [...new Set((data??[]).map(m=>m.company_id))];
}
export async function loadAppointments(client:Client,start:string,end:string,companyIds:string[]):Promise<Appointment[]> {
  if(!companyIds.length)return [];
  const rows:Appointment[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await client.from("appointments").select(SCHEDULE_SELECT).in("company_id",companyIds).gte("appointment_date",start).lte("appointment_date",end).order("appointment_date").order("window_start_time").order("id").range(offset,offset+999);
    if(error)throw new Error(error.message);
    const page=(data??[]) as unknown as (AppointmentRow & {service_requests:ServiceRequestRow|null})[];
    rows.push(...page.map(row=>({...mapAppointmentRow(row),phone:row.service_requests?.customer_phone??null,address:row.service_requests?.full_address||row.service_requests?.street_address||null})));
    if(page.length<1000)break;
  }
  return [...new Map(rows.map(a=>[a.id,a])).values()];
}
export async function loadTechnicians(client:Client,companyIds:string[]):Promise<Technician[]> {
  if(!companyIds.length)return [];
  const rows:Technician[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await client.from("technician_profiles").select("id,display_name,business_name").in("company_id",companyIds).is("archived_at",null).order("id").range(offset,offset+999);
    if(error)throw new Error(error.message);rows.push(...(data??[]));if(!data||data.length<1000)break;
  }return rows.sort((a,b)=>(a.display_name||a.business_name||"").localeCompare(b.display_name||b.business_name||""));
}
