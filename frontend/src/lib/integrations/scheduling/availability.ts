import type {
  AvailabilityResult,
  AvailabilitySlot,
  BusyTimeBlock,
  NormalizedTimeBlock,
  SchedulingAvailabilityRequest,
  TechnicianWorkBlock,
  TimeBlock,
  TravelBuffer,
} from "./types";

const MS_PER_MINUTE = 60_000;

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function minutesToMs(minutes: number | undefined): number {
  return Math.max(0, Math.floor(minutes ?? 0)) * MS_PER_MINUTE;
}

function normalizeBlock<TBlock extends TimeBlock>(block: TBlock): NormalizedTimeBlock<TBlock> | null {
  const startMs = Date.parse(block.startsAt);
  const endMs = Date.parse(block.endsAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  return {
    ...block,
    startsAt: toIso(startMs),
    endsAt: toIso(endMs),
    startMs,
    endMs,
  };
}

/**
 * Normalizes ISO time blocks into ascending, valid ranges. Invalid or zero-length
 * ranges are dropped so future Google Calendar, CRM appointment, and AI
 * Dispatcher inputs can share the same scheduling primitives safely.
 */
export function normalizeTimeBlocks<TBlock extends TimeBlock>(
  blocks: TBlock[],
): Array<NormalizedTimeBlock<TBlock>> {
  return blocks
    .map(normalizeBlock)
    .filter((block): block is NormalizedTimeBlock<TBlock> => block !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function detectOverlap(first: TimeBlock, second: TimeBlock): boolean {
  const [normalizedFirst] = normalizeTimeBlocks([first]);
  const [normalizedSecond] = normalizeTimeBlocks([second]);

  if (!normalizedFirst || !normalizedSecond) {
    return false;
  }

  return normalizedFirst.startMs < normalizedSecond.endMs && normalizedSecond.startMs < normalizedFirst.endMs;
}

export function mergeOverlappingBlocks<TBlock extends TimeBlock>(blocks: TBlock[]): TimeBlock[] {
  const normalizedBlocks = normalizeTimeBlocks(blocks);
  const merged: TimeBlock[] = [];

  for (const block of normalizedBlocks) {
    const previous = merged.at(-1);

    if (!previous) {
      merged.push({ startsAt: block.startsAt, endsAt: block.endsAt });
      continue;
    }

    const previousEndMs = Date.parse(previous.endsAt);

    if (block.startMs <= previousEndMs) {
      previous.endsAt = toIso(Math.max(previousEndMs, block.endMs));
    } else {
      merged.push({ startsAt: block.startsAt, endsAt: block.endsAt });
    }
  }

  return merged;
}

function applyTravelBuffer(block: BusyTimeBlock, travelBuffer?: TravelBuffer): BusyTimeBlock {
  const beforeMs = minutesToMs(travelBuffer?.beforeMinutes);
  const afterMs = minutesToMs(travelBuffer?.afterMinutes);
  const startMs = Date.parse(block.startsAt);
  const endMs = Date.parse(block.endsAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return block;
  }

  return {
    ...block,
    startsAt: toIso(startMs - beforeMs),
    endsAt: toIso(endMs + afterMs),
  };
}

/**
 * Removes busy appointment ranges from technician work blocks. Travel buffers
 * are applied to busy ranges before subtraction so later provider integrations
 * can account for drive time without changing the core availability math.
 */
export function subtractBusyBlocksFromWorkday(
  workBlocks: TechnicianWorkBlock[],
  busyBlocks: BusyTimeBlock[] = [],
  travelBuffer?: TravelBuffer,
): TimeBlock[] {
  const normalizedWorkBlocks = normalizeTimeBlocks(workBlocks);
  const normalizedBusyBlocks = normalizeTimeBlocks(
    busyBlocks.map((block) => applyTravelBuffer(block, travelBuffer)),
  );
  const availableBlocks: TimeBlock[] = [];

  for (const workBlock of normalizedWorkBlocks) {
    let openRanges: Array<{ startMs: number; endMs: number }> = [
      { startMs: workBlock.startMs, endMs: workBlock.endMs },
    ];

    for (const busyBlock of normalizedBusyBlocks) {
      openRanges = openRanges.flatMap((range) => {
        if (busyBlock.endMs <= range.startMs || busyBlock.startMs >= range.endMs) {
          return [range];
        }

        const nextRanges: Array<{ startMs: number; endMs: number }> = [];

        if (busyBlock.startMs > range.startMs) {
          nextRanges.push({ startMs: range.startMs, endMs: Math.min(busyBlock.startMs, range.endMs) });
        }

        if (busyBlock.endMs < range.endMs) {
          nextRanges.push({ startMs: Math.max(busyBlock.endMs, range.startMs), endMs: range.endMs });
        }

        return nextRanges;
      });
    }

    availableBlocks.push(
      ...openRanges
        .filter((range) => range.endMs > range.startMs)
        .map((range) => ({ startsAt: toIso(range.startMs), endsAt: toIso(range.endMs) })),
    );
  }

  return mergeOverlappingBlocks(availableBlocks);
}

export function generateAvailabilitySlots(request: SchedulingAvailabilityRequest): AvailabilityResult {
  const durationMs = minutesToMs(request.appointmentDuration.minutes);
  const stepMs = minutesToMs(request.slotStepMinutes ?? request.appointmentDuration.minutes);

  if (durationMs <= 0 || stepMs <= 0) {
    return {
      slots: [],
      normalizedWorkBlocks: normalizeTimeBlocks(request.workBlocks),
      normalizedBusyBlocks: normalizeTimeBlocks(request.busyBlocks ?? []),
    };
  }

  const availableBlocks = subtractBusyBlocksFromWorkday(
    request.workBlocks,
    request.busyBlocks ?? [],
    request.travelBuffer,
  );
  const slots: AvailabilitySlot[] = [];

  for (const block of normalizeTimeBlocks(availableBlocks)) {
    for (let slotStartMs = block.startMs; slotStartMs + durationMs <= block.endMs; slotStartMs += stepMs) {
      slots.push({
        startsAt: toIso(slotStartMs),
        endsAt: toIso(slotStartMs + durationMs),
        durationMinutes: durationMs / MS_PER_MINUTE,
      });
    }
  }

  return {
    slots,
    normalizedWorkBlocks: normalizeTimeBlocks(request.workBlocks),
    normalizedBusyBlocks: normalizeTimeBlocks((request.busyBlocks ?? []).map((block) => applyTravelBuffer(block, request.travelBuffer))),
  };
}
