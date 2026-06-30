function getReferenceYear(createdAt: string | null | undefined): string {
  if (!createdAt) {
    return String(new Date().getFullYear());
  }

  const date = new Date(createdAt);

  return Number.isNaN(date.getTime())
    ? String(new Date().getFullYear())
    : String(date.getFullYear());
}

function getReferenceSequence(id: string | null | undefined): string {
  const hex = (id ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 12);

  if (!hex) {
    return "000000";
  }

  const numeric = Number.parseInt(hex, 16) % 1000000;

  return String(numeric).padStart(6, "0");
}

export function getCustomerRepairReference(
  request: { id: string | null | undefined; created_at?: string | null } | null | undefined,
): string {
  return `WRA-${getReferenceYear(request?.created_at)}-${getReferenceSequence(request?.id)}`;
}

export function splitCustomerRepairDetails(issueDescription: string | null | undefined): {
  problemDescription: string;
  customerNotes: string;
} {
  const value = issueDescription ?? "";
  const marker = "\n\nCustomer notes:";
  const markerIndex = value.indexOf(marker);

  if (markerIndex === -1) {
    return {
      problemDescription: value.trim(),
      customerNotes: "",
    };
  }

  return {
    problemDescription: value.slice(0, markerIndex).trim(),
    customerNotes: value.slice(markerIndex + marker.length).trim(),
  };
}
