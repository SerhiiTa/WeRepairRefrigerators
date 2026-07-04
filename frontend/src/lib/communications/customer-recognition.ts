import type {
  CommunicationCustomerMatch,
  CommunicationCustomerSignal,
  CommunicationRecognitionResult,
} from "./types";

export type CommunicationCustomerCandidate = {
  customerId: string;
  displayName: string;
  phone?: string | null;
  email?: string | null;
  addresses?: string[];
  applianceTypes?: string[];
  brands?: string[];
  modelNumbers?: string[];
  openJobsCount?: number;
  appliancesCount?: number;
};

function normalizePhone(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return null;
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function containsNormalized(values: string[] | undefined, target: string) {
  if (!target) {
    return false;
  }

  return (values ?? []).some((value) => normalizeText(value).includes(target));
}

export function recognizeCommunicationCustomer(
  signal: CommunicationCustomerSignal,
  candidates: CommunicationCustomerCandidate[],
): CommunicationRecognitionResult {
  const inputPhone = normalizePhone(signal.phone);
  const inputEmail = normalizeText(signal.email);
  const inputAddress = normalizeText(signal.address);
  const inputApplianceType = normalizeText(signal.applianceType);
  const inputBrand = normalizeText(signal.brand);
  const inputModelNumber = normalizeText(signal.modelNumber);

  const matches = candidates
    .map<CommunicationCustomerMatch | null>((candidate) => {
      const reasons: string[] = [];
      let score = 0;

      if (inputPhone && normalizePhone(candidate.phone) === inputPhone) {
        score += 60;
        reasons.push("Phone match");
      }

      if (inputEmail && normalizeText(candidate.email) === inputEmail) {
        score += 55;
        reasons.push("Email match");
      }

      if (inputAddress && containsNormalized(candidate.addresses, inputAddress)) {
        score += 35;
        reasons.push("Address match");
      }

      if (
        inputApplianceType &&
        containsNormalized(candidate.applianceTypes, inputApplianceType)
      ) {
        score += 15;
        reasons.push("Known appliance type");
      }

      if (inputBrand && containsNormalized(candidate.brands, inputBrand)) {
        score += 12;
        reasons.push("Known appliance brand");
      }

      if (
        inputModelNumber &&
        containsNormalized(candidate.modelNumbers, inputModelNumber)
      ) {
        score += 20;
        reasons.push("Known model number");
      }

      if (score === 0) {
        return null;
      }

      return {
        customerId: candidate.customerId,
        displayName: candidate.displayName,
        matchReasons: reasons,
        openJobsCount: candidate.openJobsCount ?? 0,
        appliancesCount: candidate.appliancesCount ?? 0,
        score,
      };
    })
    .filter((match): match is CommunicationCustomerMatch => Boolean(match))
    .sort((first, second) => second.score - first.score);

  const bestMatch = matches[0] ?? null;

  return {
    status: bestMatch
      ? bestMatch.score >= 55
        ? "matched"
        : "possible_match"
      : "new_customer",
    bestMatch,
    matches,
  };
}
