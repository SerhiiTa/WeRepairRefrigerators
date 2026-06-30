import type { RepairKnowledgePattern } from "@/lib/repair-intelligence/types";

export const refrigerationKnowledge: RepairKnowledgePattern[] = [
  {
    key: "refrigeration.sealed_system.linear_compressor_no_cool",
    applianceCategory: "refrigeration",
    repairType: "sealed_system_compressor_repair",
    intents: [
      "sealed_system_failure_suspected",
      "compressor_replacement_suspected",
      "advanced_cooling_system_diagnosis",
    ],
    terms: ["linear compressor", "линейный компрессор", "не производит холод"],
    operations: [
      {
        id: "sealed-system-diagnosis",
        title: "Advanced sealed-system diagnosis",
        description:
          "Confirm compressor operation, pressure behavior, and sealed-system performance before repair.",
        estimateLineType: "labor",
        laborHours: 1.5,
        customerVisible: true,
      },
      {
        id: "compressor-replacement",
        title: "Compressor / sealed-system repair",
        description:
          "Replace failed compressor or complete equivalent sealed-system repair scope.",
        estimateLineType: "labor",
        laborHours: 4,
        customerVisible: true,
      },
      {
        id: "vacuum-pressure-test",
        title: "Vacuum, pressure, and performance test",
        description:
          "Evacuate, pressure-check, recharge, and verify cooling performance after repair.",
        estimateLineType: "material",
        laborHours: 1,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "compressor",
        customerName: "Compressor Replacement",
        internalName: "Compressor / sealed-system compressor assembly",
        reason: "Suspected compressor or sealed-system failure.",
        quantity: 1,
        required: true,
      },
      {
        id: "filter-drier",
        customerName: "Filter Drier Replacement",
        internalName: "Sealed-system filter drier",
        reason: "Required when opening the sealed refrigeration system.",
        quantity: 1,
        required: true,
      },
    ],
    materials: [
      {
        id: "refrigerant-service-materials",
        customerName: "Refrigerant Recovery and Recharge Materials",
        internalName: "Refrigerant, recovery, evacuation, and brazing materials",
        reason: "Required materials for sealed-system service.",
        quantity: 1,
        required: true,
      },
    ],
    laborConsiderations: [
      "Built-in and high-end refrigerators may require additional access and protection time.",
      "Board programming or inverter checks may be needed on some LG linear-compressor models.",
    ],
    riskNotes: [
      {
        id: "sealed-system-risk",
        severity: "caution",
        note: "Final scope depends on sealed-system pressure and leak checks.",
        customerVisible: true,
      },
    ],
    customerExplanation:
      "The refrigerator symptom points to a likely sealed-system or compressor failure. The repair plan includes advanced diagnosis, compressor/sealed-system repair scope, required sealed-system materials, and final performance testing.",
    estimateStrategy: {
      strategy: "detailed",
      packageTitle: "LG Sealed System Repair Package",
      customerSummary:
        "Sealed-system repair package with compressor scope, filter drier, refrigerant service materials, and performance testing.",
    },
    warranty: {
      days: 90,
      scope: "labor_and_installed_parts",
    },
    confidence: "medium",
  },
  {
    key: "refrigeration.evaporator_fan_iced_defrost",
    applianceCategory: "refrigeration",
    repairType: "evaporator_airflow_defrost_repair",
    intents: [
      "evaporator_fan_failure",
      "evaporator_iced_over",
      "manual_defrost_required",
      "defrost_heater_replacement",
      "heating_element_failure",
    ],
    terms: ["эвапорейтор", "эвик", "evaporator", "хитинг", "defrost heater"],
    operations: [
      {
        id: "evaporator-access-diagnosis",
        title: "Evaporator access, diagnosis, and reassembly",
        description:
          "Access evaporator compartment, verify airflow/defrost failure, reassemble, and test.",
        estimateLineType: "labor",
        laborHours: 1.5,
        customerVisible: true,
      },
      {
        id: "manual-evaporator-defrost",
        title: "Manual evaporator defrost service",
        description: "Manually defrost evaporator and remove ice buildup.",
        estimateLineType: "material",
        laborHours: 1,
        customerVisible: true,
      },
      {
        id: "airflow-cooling-test",
        title: "Airflow and cooling performance test",
        description:
          "Verify fan operation, airflow, defrost operation, and cooling after repair.",
        estimateLineType: "labor",
        laborHours: 0.5,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "evaporator-fan-motor",
        customerName: "Evaporator Fan Motor Replacement",
        internalName: "Evaporator fan motor assembly",
        reason: "Technician identified evaporator fan replacement.",
        quantity: 1,
        required: true,
      },
      {
        id: "defrost-heater",
        customerName: "Defrost Heater Replacement",
        internalName: "Evaporator defrost heater / heating element",
        reason: "Technician identified heater replacement in iced evaporator context.",
        quantity: 1,
        required: true,
      },
    ],
    riskNotes: [
      {
        id: "ice-return-risk",
        severity: "info",
        note: "If ice returns, additional sensor, harness, board, or airflow diagnostics may be required.",
        customerVisible: true,
      },
    ],
    customerExplanation:
      "The repair plan addresses the iced evaporator, failed evaporator fan, and defrost heater/heating element scope, followed by reassembly and cooling verification.",
    estimateStrategy: {
      strategy: "detailed",
      customerSummary:
        "Evaporator airflow and defrost repair with fan motor, defrost heater, manual defrost, and testing.",
    },
    confidence: "high",
  },
  {
    key: "refrigeration.condenser_fan_start_relay",
    applianceCategory: "refrigeration",
    repairType: "condenser_fan_start_relay_repair",
    intents: ["condenser_fan_failure", "start_relay_failure"],
    operations: [
      {
        id: "machine-compartment-service",
        title: "Machine compartment diagnosis and repair labor",
        description:
          "Inspect machine compartment, replace failed components, clean access area, and test operation.",
        estimateLineType: "labor",
        laborHours: 1.25,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "condenser-fan-motor",
        customerName: "Condenser Fan Motor Replacement",
        internalName: "Condenser fan motor assembly",
        reason: "Condenser fan failure identified.",
        quantity: 1,
        required: false,
      },
      {
        id: "start-relay",
        customerName: "Start Relay Replacement",
        internalName: "Compressor start relay / overload",
        reason: "Start relay failure identified.",
        quantity: 1,
        required: false,
      },
    ],
    customerExplanation:
      "The repair plan covers machine-compartment component replacement and cooling verification.",
  },
  {
    key: "refrigeration.dispenser_water_valve_line",
    applianceCategory: "refrigeration",
    repairType: "dispenser_water_supply_repair",
    intents: ["water_inlet_valve_replacement", "frozen_dispenser_water_line"],
    terms: ["dispenser", "диспенсер", "вотер валв", "трубочка подачи воды"],
    operations: [
      {
        id: "dispenser-water-diagnosis",
        title: "Dispenser water supply diagnosis and testing",
        description:
          "Verify dispenser valve operation, thaw water tube, and test dispenser flow.",
        estimateLineType: "labor",
        laborHours: 1,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "water-inlet-valve",
        customerName: "Dispenser Water Valve Replacement",
        internalName: "Water inlet valve / dispenser water valve",
        reason: "Technician requested central water valve replacement.",
        quantity: 1,
        required: true,
      },
    ],
    materials: [
      {
        id: "frozen-dispenser-line-thaw",
        customerName: "Frozen Dispenser Water Line Thawing",
        internalName: "Dispenser door water tube thaw service",
        reason: "Technician requested thawing the water line in the door.",
        quantity: 1,
        required: true,
      },
    ],
    customerExplanation:
      "The repair plan addresses the dispenser water supply by replacing the water valve, thawing the dispenser water tube, and testing water flow.",
    confidence: "high",
  },
  {
    key: "refrigeration.ice_maker_control_board",
    applianceCategory: "refrigeration",
    repairType: "ice_maker_or_control_repair",
    intents: ["ice_maker_failure", "control_board_failure"],
    operations: [
      {
        id: "ice-maker-control-diagnosis",
        title: "Ice maker/control diagnosis and testing",
        description:
          "Verify ice maker fill, harvest, control output, and final operation.",
        estimateLineType: "labor",
        laborHours: 1,
        customerVisible: true,
      },
    ],
    parts: [
      {
        id: "ice-maker",
        customerName: "Ice Maker Replacement",
        internalName: "Ice maker assembly",
        reason: "Ice maker failure indicated.",
        quantity: 1,
        required: false,
      },
      {
        id: "control-board",
        customerName: "Control Board Replacement",
        internalName: "Main control board / ice maker control output board",
        reason: "Control-board failure indicated.",
        quantity: 1,
        required: false,
      },
    ],
    customerExplanation:
      "The plan covers diagnosis of ice maker/control operation and replacement of the failed assembly if confirmed.",
  },
];
