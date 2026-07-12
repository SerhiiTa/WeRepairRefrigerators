-- Task 165.24 - Contextual Job Details problem catalog seed
--
-- 0063 created the catalog architecture. This migration only fills missing
-- default problem options for existing system job types so the mobile
-- Description picker can stay contextual without dumping every problem.

insert into public.service_problem_types (
  company_id,
  job_type_id,
  appliance_category,
  name,
  normalized_name,
  sort_order
)
select
  null,
  sjt.id,
  sjt.appliance_category,
  problem.name,
  public.normalize_catalog_label(problem.name),
  problem.sort_order
from public.service_job_types sjt
join (
  values
    ('Washer Repair', 'Full of water', 50),
    ('Washer Repair', 'Not starting', 60),
    ('Washer Repair', 'Door locked', 70),
    ('Washer Repair', 'Shaking', 80),
    ('Washer Repair', 'Error code', 90),
    ('Washer Repair', 'Not filling', 100),
    ('Refrigerator Repair', 'Not making ice', 90),
    ('Refrigerator Repair', 'Error code', 100),
    ('Dishwasher Repair', 'Error code', 90),
    ('Dryer Repair', 'Shutting off', 70),
    ('Dryer Repair', 'Error code', 80)
) as problem(job_type_name, name, sort_order)
  on sjt.company_id is null
 and sjt.normalized_name = public.normalize_catalog_label(problem.job_type_name)
on conflict do nothing;
