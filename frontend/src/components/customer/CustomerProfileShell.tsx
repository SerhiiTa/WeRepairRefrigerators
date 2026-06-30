"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  buildCustomerFullName,
  emptyCustomerProfileForm,
  getCustomerDisplayName,
  getCustomerProfileForm,
  splitCustomerName,
  type CustomerProfileFormState,
} from "@/components/customer/customer-account-utils";
import { CustomerPortalHeader } from "@/components/customer/CustomerPortalHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerRow,
  DatabaseCustomerContactMethod,
} from "@/lib/supabase/types";

type CustomerProfileState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "ready"; customer: CustomerRow | null }
  | { status: "unavailable"; message: string };

export function CustomerProfileShell() {
  const router = useRouter();
  const [state, setState] = useState<CustomerProfileState>({
    status: "loading",
  });
  const [profileForm, setProfileForm] =
    useState<CustomerProfileFormState>(emptyCustomerProfileForm);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer accounts are not configured in this environment yet.",
          });
        }
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        if (isMounted) {
          setState({ status: "signed_out" });
          router.replace("/customer/login?next=/customer/profile");
        }
        return;
      }

      const userId = sessionData.session.user.id;
      const userEmail = sessionData.session.user.email ?? null;
      const userFullName =
        typeof sessionData.session.user.user_metadata.full_name === "string"
          ? sessionData.session.user.user_metadata.full_name
          : null;
      const userPhone =
        typeof sessionData.session.user.user_metadata.phone === "string"
          ? sessionData.session.user.user_metadata.phone
          : null;

      const customerResult = await supabase
        .from("customers")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (customerResult.error) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message:
              "Customer account records are not ready in this environment yet.",
          });
        }
        return;
      }

      let customer = customerResult.data as CustomerRow | null;

      if (!customer) {
        const { firstName, lastName } = splitCustomerName(userFullName);
        const linkResult = await supabase.rpc("link_current_customer_account_rpc", {
          p_first_name: firstName,
          p_last_name: lastName,
          p_phone: userPhone,
          p_email: userEmail,
        });

        if (!linkResult.error) {
          const linkedCustomerResult = await supabase
            .from("customers")
            .select("*")
            .eq("auth_user_id", userId)
            .maybeSingle();

          customer = linkedCustomerResult.data as CustomerRow | null;
        }
      }

      if (isMounted) {
        if (customer) {
          setProfileForm(getCustomerProfileForm(customer));
        }

        setState({
          status: "ready",
          customer,
        });
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready" || !state.customer) {
      setProfileStatus("Finish connecting your customer record before saving profile details.");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setProfileStatus("Customer profile storage is not configured yet.");
      return;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      setProfileStatus("Please sign in again before saving your profile.");
      router.replace("/customer/login?next=/customer/profile");
      return;
    }

    if (state.customer.auth_user_id !== sessionData.session.user.id) {
      setProfileStatus("This customer profile is not linked to your signed-in account.");
      return;
    }

    setIsSavingProfile(true);
    setProfileStatus(null);

    try {
      const firstName = profileForm.firstName.trim();
      const lastName = profileForm.lastName.trim();
      const fullName = buildCustomerFullName(profileForm);
      const phone = profileForm.phone.trim();

      const { error } = await supabase
        .from("customers")
        .update({
          first_name: firstName || null,
          last_name: lastName || null,
          full_name: fullName || state.customer.email || "Customer",
          phone: phone || null,
          preferred_contact_method: profileForm.preferredContactMethod,
        })
        .eq("id", state.customer.id)
        .eq("auth_user_id", sessionData.session.user.id);

      if (error) {
        if (error.message.toLowerCase().includes("row-level security")) {
          setProfileStatus("Your account is not allowed to update this customer profile.");
        } else if (error.message.toLowerCase().includes("duplicate")) {
          setProfileStatus("That contact detail is already connected to another customer account.");
        } else {
          setProfileStatus("We could not save your profile yet. Please check the fields and try again.");
        }
        return;
      }

      const refreshedCustomerResult = await supabase
        .from("customers")
        .select("*")
        .eq("id", state.customer.id)
        .eq("auth_user_id", sessionData.session.user.id)
        .maybeSingle();

      if (refreshedCustomerResult.error) {
        setProfileStatus("Profile saved, but we could not reload it yet. Refresh the page to confirm.");
        return;
      }

      if (!refreshedCustomerResult.data) {
        setProfileStatus("Profile saved, but this account link could not be verified.");
        return;
      }

      const updatedCustomer = refreshedCustomerResult.data as CustomerRow;
      setState({ status: "ready", customer: updatedCustomer });
      setProfileForm(getCustomerProfileForm(updatedCustomer));
      setProfileStatus("Profile saved.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  if (state.status === "loading" || state.status === "signed_out") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-bold text-slate-600">Loading profile...</p>
        </div>
      </main>
    );
  }

  if (state.status === "unavailable") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-black">Profile unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-slate-950">
      <CustomerPortalHeader customer={state.customer} />
      <div className="mx-auto grid max-w-3xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="min-w-0">
            <Link
              href="/customer/dashboard"
              className="text-sm font-bold text-[#0F6BFF]"
            >
              Back to dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-black text-slate-950">
              Profile
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Keep your contact information current so repair updates reach you.
            </p>
          </div>
        </header>

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-6">
          {state.customer ? (
            <form onSubmit={saveProfile} className="grid gap-4">
              <div className="rounded-2xl bg-[#F7F9FC] p-4">
                <p className="text-sm font-black text-slate-950">
                  {getCustomerDisplayName(state.customer)}
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-600">
                  {state.customer.email || "Email not saved"}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  First name
                  <input
                    value={profileForm.firstName}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        firstName: event.target.value,
                      }))
                    }
                    className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Last name
                  <input
                    value={profileForm.lastName}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        lastName: event.target.value,
                      }))
                    }
                    className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Phone
                <input
                  value={profileForm.phone}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  type="tel"
                  placeholder="Best callback number"
                  className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold text-slate-700">
                Preferred contact method
                <select
                  value={profileForm.preferredContactMethod}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      preferredContactMethod: event.target
                        .value as DatabaseCustomerContactMethod,
                    }))
                  }
                  className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                >
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </label>

              {profileStatus ? (
                <p className="rounded-xl bg-[#F7F9FC] px-4 py-3 text-sm font-semibold text-slate-700">
                  {profileStatus}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSavingProfile}
                className="h-12 rounded-xl bg-[#0F6BFF] px-4 text-base font-bold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSavingProfile ? "Saving..." : "Save profile"}
              </button>
            </form>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-5 text-sm leading-6 text-slate-600">
              Customer profile setup is ready once your account record is linked.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
