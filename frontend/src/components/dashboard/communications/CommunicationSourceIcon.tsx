import { getCommunicationSource, type SourceGlyph } from "./communication-source";

const paths: Record<SourceGlyph, string> = {
  phone: "M7.2 3.5c-.4-.8-1.2-1-2-.6L3.6 4C1 6.6 5 13 8 16s9.4 7 12 4.4l1.1-1.6c.4-.8.2-1.6-.6-2l-3.2-1.6c-.6-.3-1.2-.2-1.6.3l-1.4 1.4a15 15 0 0 1-7.2-7.2l1.4-1.4c.5-.4.6-1 .3-1.6L7.2 3.5Z",
  message: "M12 3C6.5 3 3 6.6 3 11c0 2.2.9 4.2 2.5 5.7L4 21l5-2.3c1 .2 2 .3 3 .3 5.5 0 9-3.6 9-8s-3.5-8-9-8Z",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M3 7l9 6 9-6",
  bot: "M7 7h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z M12 3v4 M8 12v1 M16 12v1 M9 16h6 M1 11v4 M23 11v4",
  generic: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M7 12h.01 M12 12h.01 M17 12h.01",
};

export function CommunicationSourceIcon({channel, source}: {channel?: string | null; source?: string | null}) {
  const identity = getCommunicationSource({channel,source});
  return <span role="img" aria-label={identity.fallback ? `${identity.label} (generic icon)` : identity.label} title={identity.label} className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${identity.color}`}>
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[identity.glyph]} /></svg>
  </span>;
}
