export type ServiceRequestSubmissionValues = {
  zipCode: string;
  applianceType: string;
  brand: string;
  issueDescription: string;
  preferredServiceWindow: string;
  technicianPreference: string;
  customerFirstName: string;
  phone: string;
};

export type ServiceRequestSubmitPayload = {
  values: ServiceRequestSubmissionValues;
};

export type ServiceRequestSubmitResult =
  | {
      ok: true;
      requestId: string;
      selectedTechnicianName: string | null;
    }
  | {
      ok: false;
      message: string;
    };

export async function submitServiceRequest(
  payload: ServiceRequestSubmitPayload,
): Promise<ServiceRequestSubmitResult> {
  const response = await fetch("/api/service-requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json().catch(() => null)) as
    | ServiceRequestSubmitResult
    | null;

  if (result?.ok) {
    return result;
  }

  return {
    ok: false,
    message:
      result && "message" in result
        ? result.message
        : "We could not save this request yet. Please try again.",
  };
}
