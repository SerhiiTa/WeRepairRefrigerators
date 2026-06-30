import { CustomerPreviewCard } from "@/components/customer/CustomerPreviewCard";

export const metadata = {
  title: "Diagnosis preview | WeRepairRefrigerators",
  description:
    "Review a safe customer repair preview before selecting technicians or creating a repair account.",
};

export default function DiagnosisPreviewPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <CustomerPreviewCard />
      </div>
    </main>
  );
}
