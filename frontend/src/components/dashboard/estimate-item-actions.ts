export type EstimateItemAction = {
  type: "edit" | "delete";
  lineIndex: number;
  signatures: string[];
};

export function estimateItemSignature(line: object): string {
  return JSON.stringify(Object.entries(line).filter(([key]) => key !== "id").sort(([a], [b]) => a.localeCompare(b)));
}

export function resolveRevisedEstimateItem<T extends object>(lines: T[], action: EstimateItemAction): T | null {
  if (lines.length !== action.signatures.length ||
      lines.some((line, index) => estimateItemSignature(line) !== action.signatures[index])) return null;
  return lines[action.lineIndex] ?? null;
}

export function estimateSwipeDirection(dx: number, dy: number): "horizontal" | "vertical" | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.25 ? "horizontal" : "vertical";
}
