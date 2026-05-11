type ScheduleServiceParams = {
  brand?: string;
  service?: string;
  technician?: string;
  zip?: string;
};

export function buildScheduleServiceHref(params: ScheduleServiceParams = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();

  return query ? `/schedule-service?${query}` : "/schedule-service";
}
