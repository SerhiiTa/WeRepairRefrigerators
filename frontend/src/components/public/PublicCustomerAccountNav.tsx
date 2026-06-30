"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CustomerAccountMenu } from "@/components/customer/CustomerAccountMenu";
import { resolveAuthenticatedWorkspace } from "@/lib/auth/account-routing";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CustomerRow } from "@/lib/supabase/types";

type PublicCustomerNavState =
  | { status: "loading"; customer: null }
  | { status: "signed_out"; customer: null }
  | { status: "customer"; customer: CustomerRow }
  | { status: "dashboard_user"; customer: null };

export function PublicCustomerAccountNav() {
  const [state, setState] = useState<PublicCustomerNavState>({
    status: "loading",
    customer: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadCustomerNav() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({ status: "signed_out", customer: null });
        }
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (sessionError || !sessionData.session) {
        setState({ status: "signed_out", customer: null });
        return;
      }

      const workspace = await resolveAuthenticatedWorkspace({
        supabase,
        session: sessionData.session,
        roleIntent: null,
      });

      if (!isMounted) {
        return;
      }

      if (workspace.path === "/dashboard") {
        setState({ status: "dashboard_user", customer: null });
        return;
      }

      const customerResult = await supabase
        .from("customers")
        .select("*")
        .eq("auth_user_id", sessionData.session.user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (!customerResult.error && customerResult.data) {
        setState({
          status: "customer",
          customer: customerResult.data as CustomerRow,
        });
        return;
      }

      setState({ status: "dashboard_user", customer: null });
    }

    void loadCustomerNav();

    return () => {
      isMounted = false;
    };
  }, []);

  if (state.status === "customer") {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/customer/dashboard"
          className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
        >
          Customer Portal
        </Link>
        <CustomerAccountMenu customer={state.customer} />
      </div>
    );
  }

  if (state.status === "dashboard_user") {
    return (
      <Link
        href="/dashboard"
        className="rounded-full border border-blue-200 bg-blue-700 px-4 py-2 text-sm font-black text-white shadow-sm shadow-blue-700/20 transition hover:bg-blue-800"
      >
        Technician Dashboard
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
    >
      Log in
    </Link>
  );
}
