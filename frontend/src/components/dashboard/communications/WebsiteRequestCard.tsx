import { CommunicationSourceIcon } from './CommunicationSourceIcon';
import { websiteRequestFields, type WebsiteRequest } from '@/lib/communications/website-request';

export function WebsiteRequestCard({request, body, submittedAt}: {request?: WebsiteRequest | null; body: string | null; submittedAt: string}) {
  const fields = websiteRequestFields(request, body);
  const submitted = new Date(submittedAt);
  const submittedLabel = Number.isNaN(submitted.getTime()) ? null : submitted.toLocaleString("en-US", {dateStyle: "medium", timeStyle: "short"});
  return (
    <details className="group min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-[#172033]">
      <summary className="min-h-11 cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
        <span className="flex min-h-11 items-center gap-2 font-bold">
          <CommunicationSourceIcon source="website_form" />
          <span className="flex-1">Website request</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg>
        </span>
        <span className="mt-2 block break-words text-sm font-normal text-[#64748B]">
          {[request?.appliance_type, request?.brand].filter(Boolean).join(' · ')}
        </span>
        <span className="mt-1 block break-words text-sm font-normal">{request?.problem_description || body || 'Submitted request'}</span>
        {submittedLabel && <time dateTime={submittedAt} className="mt-2 block text-xs font-normal text-[#64748B]">Submitted {submittedLabel}</time>}
        <span className="mt-2 block text-xs font-medium text-blue-600">View submitted details</span>
      </summary>
      {fields.some(([label]) => label.startsWith('Requested')) && <p className="mt-4 text-sm font-semibold">Requested appointment <span className="font-normal text-[#64748B]">· Not confirmed</span></p>}
      <dl className="mt-4 space-y-3 border-t border-[#E5E7EB] pt-3 text-sm">
        {fields.map(([label,value]) => <div key={label}><dt className="text-xs font-medium text-[#64748B]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>)}
      </dl>
      {fields.some(([label]) => label.startsWith('Requested')) && <p className="mt-3 text-xs text-[#64748B]">Requested appointment only — not a confirmed booking.</p>}
      {!request && <p className="mt-3 text-xs text-[#64748B]">Structured request details are unavailable.</p>}
    </details>
  );
}
