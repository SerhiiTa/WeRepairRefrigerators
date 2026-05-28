-- Task 96B: Tighten anonymous photo metadata reads.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Task 96 verification showed anonymous SELECT on service_request_photos
--   succeeded with an empty RLS result. That did not expose rows, but the
--   intended security posture is a hard anonymous read block.
--
-- Security model after this patch:
--   - anon may INSERT customer_upload metadata after creating a request.
--   - anon may not SELECT service_request_photos metadata.
--   - authenticated dashboard users may SELECT/INSERT according to existing
--     RLS policies/RPCs.

revoke all on public.service_request_photos from public;
revoke select on public.service_request_photos from anon;
grant insert on public.service_request_photos to anon;
grant select, insert on public.service_request_photos to authenticated;

comment on table public.service_request_photos is
  'Task 96 private photo metadata for service requests. Anonymous clients may insert customer uploads but cannot read/list metadata.';
