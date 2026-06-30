export type TimeBlockSource =
  | "manual"
  | "crm_appointment"
  | "calendar_provider"
  | "ai_dispatcher"
  | "unknown";

export type TimeBlock = {
  startsAt: string;
  endsAt: string;
};

export type TechnicianWorkBlock = TimeBlock & {
  technicianId?: string;
  label?: string;
  source?: TimeBlockSource;
};

export type BusyTimeBlock = TimeBlock & {
  appointmentId?: string;
  label?: string;
  source?: TimeBlockSource;
};

export type ServiceWindow = TimeBlock & {
  label?: string;
};

export type AppointmentDuration = {
  minutes: number;
};

export type TravelBuffer = {
  beforeMinutes?: number;
  afterMinutes?: number;
};

export type AvailabilitySlot = TimeBlock & {
  durationMinutes: number;
};

export type SchedulingAvailabilityRequest = {
  workBlocks: TechnicianWorkBlock[];
  busyBlocks?: BusyTimeBlock[];
  appointmentDuration: AppointmentDuration;
  travelBuffer?: TravelBuffer;
  slotStepMinutes?: number;
};

export type AvailabilityResult = {
  slots: AvailabilitySlot[];
  normalizedWorkBlocks: Array<NormalizedTimeBlock<TechnicianWorkBlock>>;
  normalizedBusyBlocks: Array<NormalizedTimeBlock<BusyTimeBlock>>;
};

export type NormalizedTimeBlock<TBlock extends TimeBlock = TimeBlock> = TBlock & {
  startMs: number;
  endMs: number;
};
