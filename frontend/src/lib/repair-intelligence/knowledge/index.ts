import { cookingKnowledge } from "@/lib/repair-intelligence/knowledge/cooking";
import { dishwasherKnowledge } from "@/lib/repair-intelligence/knowledge/dishwasher";
import { laundryKnowledge } from "@/lib/repair-intelligence/knowledge/laundry";
import { refrigerationKnowledge } from "@/lib/repair-intelligence/knowledge/refrigeration";
import type { RepairKnowledgePattern } from "@/lib/repair-intelligence/types";

export const repairKnowledgePacks: RepairKnowledgePattern[] = [
  ...refrigerationKnowledge,
  ...laundryKnowledge,
  ...dishwasherKnowledge,
  ...cookingKnowledge,
];

export {
  cookingKnowledge,
  dishwasherKnowledge,
  laundryKnowledge,
  refrigerationKnowledge,
};
