"use client";

import { useState } from "react";

import { FormField } from "@/components/FormField";
import { TextInput } from "@/components/TextInput";

const manualBrandOption = "Other / Manual Entry";

export const refrigeratorBrandOptions = [
  "Sub-Zero",
  "Thermador",
  "Bosch",
  "Viking",
  "Wolf",
  "JennAir",
  "KitchenAid",
  "Whirlpool",
  "Maytag",
  "Amana",
  "GE",
  "GE Monogram",
  "Café",
  "Profile",
  "Samsung",
  "LG",
  "Frigidaire",
  "Electrolux",
  "Kenmore",
  "Dacor",
  "Miele",
  "Liebherr",
  "Fisher & Paykel",
  "True",
  "Scotsman",
  "Hoshizaki",
  "U-Line",
  "Marvel",
  manualBrandOption,
];

export function BrandSelector() {
  const [selectedBrand, setSelectedBrand] = useState("");
  const isManualBrand = selectedBrand === manualBrandOption;

  return (
    <div className="grid gap-5">
      <FormField id="brand" label="Brand" required>
        <select
          id="brand"
          name="brand"
          required
          value={selectedBrand}
          onChange={(event) => setSelectedBrand(event.target.value)}
          className="w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
        >
          <option value="" disabled>
            Select one
          </option>
          {refrigeratorBrandOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </FormField>

      {isManualBrand ? (
        <FormField
          id="manual-brand"
          label="Manual brand"
          helperText="Use this when the appliance label shows a brand that is not in the list."
          required
        >
          <TextInput id="manual-brand" name="manualBrand" placeholder="Enter appliance brand" required />
        </FormField>
      ) : null}
    </div>
  );
}
