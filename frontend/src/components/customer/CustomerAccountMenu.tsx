"use client";

import Link from "next/link";
import { useState } from "react";

import {
  getCustomerAvatarColor,
  getCustomerDisplayName,
  getCustomerInitial,
} from "@/components/customer/customer-account-utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CustomerRow } from "@/lib/supabase/types";

export function CustomerAccountMenu({
  customer,
}: {
  customer: CustomerRow | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const displayName = getCustomerDisplayName(customer);
  const initial = getCustomerInitial(customer);
  const avatarColor = getCustomerAvatarColor(customer);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();

    setIsSigningOut(true);

    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      window.location.assign("/customer/login");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-label="Open customer account menu"
        className="flex h-12 w-12 items-center justify-center rounded-full border text-base font-black shadow-[0_10px_24px_rgba(15,23,42,0.10)] transition hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-blue-100"
        style={{
          backgroundColor: avatarColor.background,
          borderColor: avatarColor.border,
          color: avatarColor.text,
        }}
      >
        {initial}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-14 z-20 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
          <div className="border-b border-slate-100 p-4">
            <p className="text-sm font-black text-slate-950">{displayName}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Customer account
            </p>
          </div>

          <div className="grid p-2">
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className="rounded-xl px-3 py-3 text-sm font-bold text-slate-800 transition hover:bg-[#F7F9FC]"
            >
              Marketplace
            </Link>
            <Link
              href="/customer/profile"
              onClick={() => setIsOpen(false)}
              className="rounded-xl px-3 py-3 text-sm font-bold text-slate-800 transition hover:bg-[#F7F9FC]"
            >
              Profile
            </Link>
            <button
              type="button"
              disabled
              className="rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-400"
            >
              Addresses
              <span className="ml-2 text-xs font-semibold">Future</span>
            </button>
            <button
              type="button"
              disabled
              className="rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-400"
            >
              Notifications
              <span className="ml-2 text-xs font-semibold">Future</span>
            </button>
            <button
              type="button"
              disabled
              className="rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-400"
            >
              Community
              <span className="ml-2 text-xs font-semibold">Future</span>
            </button>
            <button
              type="button"
              disabled
              className="rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-400"
            >
              Ask a Question
              <span className="ml-2 text-xs font-semibold">Future</span>
            </button>
            <button
              type="button"
              onClick={signOut}
              disabled={isSigningOut}
              className="rounded-xl px-3 py-3 text-left text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {isSigningOut ? "Signing out..." : "Logout"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
