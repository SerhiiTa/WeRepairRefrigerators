import { NextResponse } from "next/server";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";
import { syncAppointmentCreatedToCalendar } from "@/server/integrations/calendar/appointment-calendar-sync";

type Props = {params: Promise<{id:string}>};
const uuid = (v:unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail = (message:string,status=400) => NextResponse.json({ok:false,message},{status});
async function dispatch(request:Request,{params}:Props) {
  const access = await requireHomeFixPrivateAccess(request);
  if (!access.ok) return access.response;
  const {id} = await params;
  if (!uuid(id)) return fail("Invalid Job ID.");
  let body:Record<string,unknown>;
  try { body=await request.json(); } catch { return fail("Invalid request body."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request body.");
  const assign = body.operation === "assign_technician";
  if (body.operation && !["assign_technician","upsert","reschedule"].includes(String(body.operation))) return fail("Invalid dispatch operation.");
  const technician = body.technicianProfileId || null;
  const appointment = body.appointmentId || null;
  if (technician !== null && !uuid(technician)) return fail("Invalid technician ID.");
  if (appointment !== null && !uuid(appointment)) return fail("Invalid appointment ID.");
  if (body.overrideConflict !== undefined && typeof body.overrideConflict !== "boolean") return fail("Invalid conflict confirmation.");
  if (body.overrideConflict === true && (typeof body.overrideReason !== "string" || !body.overrideReason.trim() || body.overrideReason.length>500)) return fail("Provide an override reason (1–500 characters).");
  if (!assign) {
    const date=body.appointmentDate;
    if (typeof date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) return fail("Choose a valid date.");
    if (![body.windowStartTime,body.windowEndTime].every(v=>typeof v==="string" && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v))) return fail("Choose a valid time window.");
    if (String(body.windowStartTime)>=String(body.windowEndTime)) return fail("End time must be after start time.");
  }
  const db=access.context.supabase;
  const {data,error}=await db.rpc("manual_dispatch_rpc" as never,{
    p_service_request_id:id,p_operation:assign?"assign":request.method==="POST"?"book":"schedule",
    p_technician_profile_id:technician,p_appointment_id:appointment,
    p_appointment_date:assign?null:body.appointmentDate,p_window_start_time:assign?null:body.windowStartTime,p_window_end_time:assign?null:body.windowEndTime,
    p_override_conflict:body.overrideConflict===true,p_override_reason:body.overrideConflict===true?body.overrideReason:null,
  } as never);
  if(error) return fail(error.code==="42501"?"Dispatch is not authorized for this company or technician.":error.message,error.code==="42501"?403:409);
  const result=data as unknown as {conflict?:boolean;message?:string;operation:string;appointment:{id:string;appointment_date:string;window_start_time:string;window_end_time:string;technician_profile_id:string|null}|null};
  if(result.conflict) return NextResponse.json({ok:false,...result},{status:409});
  let calendarSync=null;
  if(result.operation==="created" && result.appointment) {
    const {data:job}=await db.from("service_requests").select("id,customer_name,appliance_type,appliance_brand,issue_description,full_address,street_address,unit,city,state,zip_code").eq("id",id).maybeSingle();
    if(job) calendarSync=await syncAppointmentCreatedToCalendar({supabase:db,appointment:result.appointment,serviceRequest:job});
  }
  return NextResponse.json({ok:true,...result,calendarSync});
}
export const POST=dispatch;
export const PUT=dispatch;
export const PATCH=dispatch;
