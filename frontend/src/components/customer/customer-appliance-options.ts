import { COMMON_APPLIANCE_TYPES } from "@/lib/appliance-options";

export const customerApplianceGroups = [
  {
    label: "Cold storage",
    options: COMMON_APPLIANCE_TYPES.filter((option) =>
      ["Refrigerator", "Freezer", "Ice Maker", "Wine Cooler"].includes(option),
    ),
  },
  {
    label: "Laundry",
    options: COMMON_APPLIANCE_TYPES.filter((option) =>
      ["Washer", "Dryer"].includes(option),
    ),
  },
  {
    label: "Cooking",
    options: COMMON_APPLIANCE_TYPES.filter((option) =>
      ["Range", "Oven", "Cooktop", "Microwave", "Vent Hood", "Garbage Compactor"].includes(option),
    ),
  },
  {
    label: "Kitchen cleanup",
    options: COMMON_APPLIANCE_TYPES.filter((option) => option === "Dishwasher"),
  },
];
