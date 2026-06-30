import type { RepairKnowledgePattern } from "@/lib/repair-intelligence/types";

export const laundryKnowledge: RepairKnowledgePattern[] = [
  {
    key: "laundry.washer_door_boot_leak",
    applianceCategory: "laundry",
    repairType: "washer_door_boot_replacement",
    intents: ["door_boot_leak"],
    terms: ["door boot", "leaking from door boot", "washer leaking"],
    operations: [
      {
        id: "washer-front-panel-disassembly",
        title: "Washer front-panel disassembly and reassembly",
        description:
          "Remove front-access components, replace boot, reassemble, and align seal.",
        estimateLineType: "labor",
        laborHours: 1.5,
        customerVisible: true,
      },
      {
        id: "washer-leak-spin-test",
        title: "Leak and spin test",
        description: "Run fill, drain, and spin checks to verify no active leak.",
        estimateLineType: "labor",
        laborHours: 0.5,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "washer-door-boot",
        customerName: "Washer Door Boot Replacement",
        internalName: "Door boot / bellow seal",
        reason: "Door boot leak identified.",
        quantity: 1,
        required: true,
      },
    ],
    customerExplanation:
      "The washer leak points to a failed door boot. The plan includes replacing the boot, reassembling the front panel, and running leak/spin tests.",
    confidence: "high",
  },
  {
    key: "laundry.drain_pump_no_drain",
    applianceCategory: "laundry",
    repairType: "washer_drain_pump_repair",
    intents: ["drain_pump_failure", "drain_restriction"],
    operations: [
      {
        id: "washer-drain-path-inspection",
        title: "Washer drain path inspection and pump access",
        description:
          "Inspect drain path, access pump, clear restrictions, and test drain operation.",
        estimateLineType: "labor",
        laborHours: 1,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "washer-drain-pump",
        customerName: "Drain Pump Replacement",
        internalName: "Washer drain pump assembly",
        reason: "Drain pump failure indicated.",
        quantity: 1,
        required: true,
      },
    ],
    customerExplanation:
      "The plan covers drain-path inspection, drain pump replacement, and drain-cycle testing.",
  },
  {
    key: "laundry.dryer_no_heat",
    applianceCategory: "laundry",
    repairType: "dryer_heating_repair",
    intents: ["heating_element_failure"],
    terms: ["dryer no heat", "secadora no calienta"],
    operations: [
      {
        id: "dryer-heating-diagnosis",
        title: "Dryer heating diagnosis and airflow test",
        description:
          "Verify heater circuit, thermal protection, airflow, and final temperature rise.",
        estimateLineType: "labor",
        laborHours: 1,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "dryer-heating-element",
        customerName: "Dryer Heating Element Replacement",
        internalName: "Dryer heating element / heater assembly",
        reason: "Dryer no-heat condition indicates heater circuit repair.",
        quantity: 1,
        required: true,
      },
    ],
    customerExplanation:
      "The dryer no-heat plan includes heater circuit diagnosis, heating element replacement if confirmed, and airflow/temperature testing.",
  },
];
