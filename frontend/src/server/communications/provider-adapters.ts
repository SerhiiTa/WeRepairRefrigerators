import {
  normalizePhoneWorkflowPayload,
  type NormalizedPhoneWorkflow,
  type PhoneWorkflowProvider,
} from "./phone-normalization";

export type ServerCommunicationProviderAdapter = {
  provider: PhoneWorkflowProvider;
  normalizePhonePayload(payload: unknown): NormalizedPhoneWorkflow;
};

function createPhoneProviderAdapter(
  provider: PhoneWorkflowProvider,
): ServerCommunicationProviderAdapter {
  return {
    provider,
    normalizePhonePayload(payload) {
      return normalizePhoneWorkflowPayload(provider, payload);
    },
  };
}

export const telnyxPhoneProviderAdapter =
  createPhoneProviderAdapter("telnyx");

export const retellPhoneProviderAdapter =
  createPhoneProviderAdapter("retell");

export function getPhoneProviderAdapter(
  provider: PhoneWorkflowProvider,
): ServerCommunicationProviderAdapter {
  return provider === "retell"
    ? retellPhoneProviderAdapter
    : telnyxPhoneProviderAdapter;
}
