export const COMMON_APPLIANCE_TYPES = [
  "Refrigerator",
  "Freezer",
  "Ice Maker",
  "Wine Cooler",
  "Washer",
  "Dryer",
  "Dishwasher",
  "Oven",
  "Range",
  "Cooktop",
  "Microwave",
  "Range Hood",
  "Vent Hood",
  "Garbage Compactor",
] as const;

export const COMMON_APPLIANCE_BRANDS = [
  "Whirlpool",
  "GE",
  "LG",
  "Samsung",
  "Frigidaire",
  "Electrolux",
  "Maytag",
  "KitchenAid",
  "Bosch",
  "Thermador",
  "Sub-Zero",
  "Wolf",
  "Viking",
  "JennAir",
  "Miele",
  "Fisher & Paykel",
  "Kenmore",
  "Amana",
] as const;

export function getOptionMatches(options: readonly string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return options.slice(0, 8);
  }

  return options
    .filter((option) => option.toLowerCase().includes(normalizedQuery))
    .slice(0, 8);
}
