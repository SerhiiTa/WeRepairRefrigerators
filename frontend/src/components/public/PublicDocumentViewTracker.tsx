"use client";

import { useEffect, useRef } from "react";

const WINDOW_MS = 30 * 60 * 1000;
const digest = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
), b => b.toString(16).padStart(2, "0")).join("");

// Web Locks serialize storage claims across tabs. Without secure browser APIs or
// storage, skip analytics rather than introduce competing identities/retry loops.
export async function claimDocumentView(documentType: "estimate" | "invoice", token: string) {
  if (!navigator.locks || !crypto.subtle || !crypto.randomUUID) return;
  const key = `wra-document-view:${documentType}:${await digest(token)}`;
  return navigator.locks.request(key, async () => {
    const now = Date.now();
    const previous = localStorage.getItem(key);
    if (previous) {
      const record = JSON.parse(previous) as { until?: number };
      if (typeof record.until === "number" && record.until > now && record.until <= now + WINDOW_MS) return;
    }
    const sessionHash = await digest(crypto.randomUUID());
    const eventId = crypto.randomUUID();
    // Claim before transport, including uncertain outcomes. No automatic retry.
    localStorage.setItem(key, JSON.stringify({ until: now + WINDOW_MS }));
    return { documentType, token, sessionHash, eventId };
  });
}

export function PublicDocumentViewTracker({ documentType, token }: {
  documentType: "estimate" | "invoice"; token: string;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const container = marker.current?.parentElement;
    if (!container || !globalThis.IntersectionObserver) return;
    let inViewport = false;
    let stopped = false;
    let attempted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => document.visibilityState === "visible" && inViewport;
    const update = () => {
      clearTimeout(timer);
      if (stopped || attempted || !visible()) return;
      timer = setTimeout(() => {
        if (stopped || attempted || !visible()) return;
        attempted = true;
        void (async () => {
          try {
            const payload = await claimDocumentView(documentType, token);
            if (!payload || stopped || !visible()) return;
            await fetch("/api/public/document-views", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload), credentials: "omit", cache: "no-store",
              referrerPolicy: "no-referrer", signal: AbortSignal.timeout(5000),
            });
          } catch { /* Best effort: no UI error, retry or document interaction. */ }
        })();
      }, 2000);
    };
    const observer = new IntersectionObserver(entries => {
      inViewport = entries.some(entry => entry.isIntersecting);
      update();
    });
    observer.observe(container);
    document.addEventListener("visibilitychange", update);
    return () => {
      stopped = true; clearTimeout(timer); observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [documentType, token]);
  return <span hidden ref={marker} aria-hidden="true" />;
}
