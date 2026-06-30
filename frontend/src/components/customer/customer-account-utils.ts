import type {
  CustomerRow,
  DatabaseCustomerContactMethod,
} from "@/lib/supabase/types";

export type CustomerProfileFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  preferredContactMethod: DatabaseCustomerContactMethod;
};

export const emptyCustomerProfileForm: CustomerProfileFormState = {
  firstName: "",
  lastName: "",
  phone: "",
  preferredContactMethod: "phone",
};

export function isEmailLike(value: string | null | undefined): boolean {
  return Boolean(value?.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
}

export function splitCustomerName(value: string | null | undefined): {
  firstName: string;
  lastName: string | null;
} {
  const cleaned = value?.trim() && !isEmailLike(value) ? value.trim() : "Customer";
  const [firstName, ...rest] = cleaned.split(/\s+/);

  return {
    firstName: firstName || "Customer",
    lastName: rest.length > 0 ? rest.join(" ") : null,
  };
}

export function getCustomerDisplayName(customer: CustomerRow | null): string {
  const firstName = customer?.first_name?.trim();
  const fullName = customer?.full_name?.trim();
  const email = customer?.email?.trim();

  if (firstName && !isEmailLike(firstName)) {
    return firstName;
  }

  if (fullName && !isEmailLike(fullName)) {
    return fullName;
  }

  return email || "Customer";
}

export function getCustomerGreetingName(customer: CustomerRow | null): string {
  const displayName = getCustomerDisplayName(customer);
  const [firstName] = displayName.split(/\s+/);

  return firstName || displayName;
}

export function getCustomerInitial(customer: CustomerRow | null): string {
  const displayName = getCustomerDisplayName(customer);
  const initial = displayName.trim().charAt(0);

  return initial ? initial.toUpperCase() : "C";
}

export function getCustomerAvatarColor(customer: CustomerRow | null): {
  background: string;
  border: string;
  text: string;
} {
  const palette = [
    { background: "#DBEAFE", border: "#93C5FD", text: "#1D4ED8" },
    { background: "#DCFCE7", border: "#86EFAC", text: "#15803D" },
    { background: "#F3E8FF", border: "#C084FC", text: "#7E22CE" },
    { background: "#FFEDD5", border: "#FDBA74", text: "#C2410C" },
    { background: "#CCFBF1", border: "#5EEAD4", text: "#0F766E" },
  ];
  const seed = getCustomerDisplayName(customer)
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);

  return palette[seed % palette.length];
}

export function getCustomerProfileForm(
  customer: CustomerRow,
): CustomerProfileFormState {
  const fullNameParts =
    customer.full_name && !isEmailLike(customer.full_name)
      ? splitCustomerName(customer.full_name)
      : null;

  return {
    firstName:
      customer.first_name && !isEmailLike(customer.first_name)
        ? customer.first_name.trim()
        : fullNameParts?.firstName === "Customer"
          ? ""
          : fullNameParts?.firstName ?? "",
    lastName:
      customer.last_name && !isEmailLike(customer.last_name)
        ? customer.last_name.trim()
        : fullNameParts?.lastName ?? "",
    phone: customer.phone?.trim() ?? "",
    preferredContactMethod: customer.preferred_contact_method ?? "phone",
  };
}

export function buildCustomerFullName({
  firstName,
  lastName,
}: CustomerProfileFormState): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export function getLocalTimeGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good Morning";
  }

  if (hour < 18) {
    return "Good Afternoon";
  }

  return "Good Evening";
}
