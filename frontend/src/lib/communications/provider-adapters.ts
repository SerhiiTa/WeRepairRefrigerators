import type { CommunicationProviderAdapter } from "./types";

function createDisabledProvider(providerName: string): CommunicationProviderAdapter {
  return {
    providerName,
    isConfigured: false,
    normalizeInbound() {
      return null;
    },
    async sendEstimateMessage() {
      return {
        ok: false,
        reason: "provider_unavailable",
        message: `${providerName} outbound delivery is not configured.`,
      };
    },
  };
}

export const telnyxCommunicationProvider =
  createDisabledProvider("telnyx");
export const retellCommunicationProvider =
  createDisabledProvider("retell");
export const emailCommunicationProvider = createDisabledProvider("email");
export const websiteCommunicationProvider = createDisabledProvider("website");

export const communicationProviders = [
  telnyxCommunicationProvider,
  retellCommunicationProvider,
  emailCommunicationProvider,
  websiteCommunicationProvider,
];

export function getConfiguredCommunicationProviders() {
  return communicationProviders.filter((provider) => provider.isConfigured);
}
