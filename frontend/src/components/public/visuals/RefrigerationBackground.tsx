type RefrigerationBackgroundProps = {
  className?: string;
};

export function RefrigerationBackground({ className = "" }: RefrigerationBackgroundProps) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-sky-200/30 blur-3xl" />
      <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-blue-200/25 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-40 w-80 rounded-full bg-cyan-100/70 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}
