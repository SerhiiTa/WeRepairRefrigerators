import type { RepairKnowledgePattern } from "@/lib/repair-intelligence/types";

export const cookingKnowledge: RepairKnowledgePattern[] = [
  {
    key: "cooking.double_oven_bake_element",
    applianceCategory: "cooking",
    repairType: "oven_bake_element_replacement",
    intents: ["heating_element_failure"],
    terms: ["double oven", "bake element", "oven not heating"],
    operations: [
      {
        id: "double-oven-remove-reinstall",
        title: "Double oven removal and reinstall labor",
        description:
          "Safely remove or access the double oven as needed, protect cabinetry, and reinstall after repair.",
        estimateLineType: "labor",
        laborHours: 1.5,
        customerVisible: true,
      },
      {
        id: "oven-circuit-temperature-test",
        title: "Wiring, safety, and temperature verification",
        description:
          "Verify heater circuit, thermal fuse/control output, and final oven temperature rise.",
        estimateLineType: "labor",
        laborHours: 1,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "oven-bake-element",
        customerName: "Bake Element Replacement",
        internalName: "Oven bake element",
        reason: "Bake element tested open or failed.",
        quantity: 1,
        required: true,
      },
    ],
    riskNotes: [
      {
        id: "double-oven-access",
        severity: "caution",
        note: "Double oven access may require additional labor depending on installation.",
        customerVisible: true,
      },
    ],
    customerExplanation:
      "The oven no-heat plan includes bake element replacement, safe double-oven access, wiring/control verification, and temperature testing.",
    confidence: "high",
  },
  {
    key: "cooking.igniter_control_fan",
    applianceCategory: "cooking",
    repairType: "cooking_heat_control_repair",
    intents: ["control_board_failure"],
    terms: ["igniter", "thermal fuse", "convection fan", "control board"],
    operations: [
      {
        id: "cooking-heat-control-diagnosis",
        title: "Cooking appliance heat/control diagnosis",
        description:
          "Verify ignition/heating, thermal safety, control output, fan operation, and final performance.",
        estimateLineType: "labor",
        laborHours: 1,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "igniter",
        customerName: "Igniter Replacement",
        internalName: "Oven/range igniter",
        reason: "Igniter failure indicated.",
        quantity: 1,
        required: false,
      },
      {
        id: "control-board",
        customerName: "Control Board Replacement",
        internalName: "Cooking appliance control board",
        reason: "Control output failure indicated.",
        quantity: 1,
        required: false,
      },
      {
        id: "convection-fan",
        customerName: "Convection Fan Replacement",
        internalName: "Convection fan motor",
        reason: "Convection fan failure indicated.",
        quantity: 1,
        required: false,
      },
    ],
    customerExplanation:
      "The plan verifies heat/control operation and replaces the confirmed failed component.",
  },
];
