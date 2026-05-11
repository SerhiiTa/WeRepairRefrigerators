type TechnicianSpecialtyBadgeProps = {
  label: string;
};

export function TechnicianSpecialtyBadge({ label }: TechnicianSpecialtyBadgeProps) {
  return (
    <span className="rounded-md border border-white/10 bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-300">
      {label}
    </span>
  );
}
