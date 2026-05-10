type SnowflakeMotifProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "soft" | "strong";
};

const sizeClass = {
  sm: "h-7 w-7",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

export function SnowflakeMotif({
  className = "",
  size = "md",
  tone = "soft",
}: SnowflakeMotifProps) {
  const lineClass = tone === "strong" ? "bg-blue-500" : "bg-sky-200";

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex ${sizeClass[size]} items-center justify-center rounded-full border border-blue-100 bg-white/80 shadow-sm ${className}`}
    >
      {[0, 60, 120].map((rotation) => (
        <span
          key={rotation}
          className={`absolute h-0.5 w-3/4 rounded-full ${lineClass}`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      ))}
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
    </span>
  );
}
