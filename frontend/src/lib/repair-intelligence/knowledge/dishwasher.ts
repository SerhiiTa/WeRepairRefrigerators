import type { RepairKnowledgePattern } from "@/lib/repair-intelligence/types";

export const dishwasherKnowledge: RepairKnowledgePattern[] = [
  {
    key: "dishwasher.drain_pump_failure",
    applianceCategory: "dishwasher",
    repairType: "dishwasher_drain_pump_replacement",
    intents: ["drain_pump_failure", "drain_restriction"],
    terms: ["dishwasher not draining", "drain pump failed"],
    operations: [
      {
        id: "dishwasher-drain-path-inspection",
        title: "Drain path inspection and pump access",
        description:
          "Inspect drain hose/path, access drain pump, replace failed pump, and verify drain.",
        estimateLineType: "labor",
        laborHours: 1.25,
        customerVisible: true,
      },
      {
        id: "dishwasher-leak-cycle-test",
        title: "Leak and cycle test",
        description: "Run dishwasher drain and leak checks after repair.",
        estimateLineType: "labor",
        laborHours: 0.5,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "dishwasher-drain-pump",
        customerName: "Dishwasher Drain Pump Replacement",
        internalName: "Dishwasher drain pump assembly",
        reason: "Drain pump failure identified.",
        quantity: 1,
        required: true,
      },
    ],
    customerExplanation:
      "The dishwasher not-draining repair plan includes drain-path inspection, drain pump replacement, and leak/cycle testing.",
    confidence: "high",
  },
  {
    key: "dishwasher.inlet_or_heater_control",
    applianceCategory: "dishwasher",
    repairType: "dishwasher_fill_heat_control_repair",
    intents: [
      "water_inlet_valve_replacement",
      "heating_element_failure",
      "control_board_failure",
    ],
    operations: [
      {
        id: "dishwasher-electrical-water-test",
        title: "Dishwasher fill/heat/control verification",
        description:
          "Verify fill valve, heater circuit, control outputs, and final cycle operation.",
        estimateLineType: "labor",
        laborHours: 1,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "dishwasher-inlet-valve",
        customerName: "Dishwasher Inlet Valve Replacement",
        internalName: "Dishwasher water inlet valve",
        reason: "Water inlet valve replacement indicated.",
        quantity: 1,
        required: false,
      },
      {
        id: "dishwasher-heater",
        customerName: "Dishwasher Heater Replacement",
        internalName: "Dishwasher heating element",
        reason: "Dishwasher no-heat condition indicated.",
        quantity: 1,
        required: false,
      },
      {
        id: "dishwasher-control-board",
        customerName: "Dishwasher Control Board Replacement",
        internalName: "Dishwasher electronic control board",
        reason: "Control-board failure indicated.",
        quantity: 1,
        required: false,
      },
    ],
    customerExplanation:
      "The plan verifies dishwasher fill, heat, and control output before replacing the failed component.",
  },
];
