type ApplianceSilhouetteProps = {
  className?: string;
  size?: "sm" | "md";
};

export function ApplianceSilhouette({ className = "", size = "sm" }: ApplianceSilhouetteProps) {
  const shellSize = size === "md" ? "h-16 w-12" : "h-11 w-8";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-2xl bg-blue-50 ${className}`}
    >
      <span className={`${shellSize} rounded-lg border border-blue-200 bg-white p-1 shadow-sm`}>
        <span className="block h-2/5 rounded-md bg-gradient-to-br from-white to-blue-50" />
        <span className="mt-1 block h-3/5 rounded-md bg-gradient-to-br from-blue-50 to-white" />
      </span>
    </span>
  );
}
