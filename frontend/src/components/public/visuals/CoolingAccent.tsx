type CoolingAccentProps = {
  className?: string;
  density?: "calm" | "active";
};

export function CoolingAccent({ className = "", density = "calm" }: CoolingAccentProps) {
  const lineCount = density === "active" ? 5 : 3;

  return (
    <div aria-hidden="true" className={`pointer-events-none grid gap-2 ${className}`}>
      {Array.from({ length: lineCount }).map((_, index) => (
        <span
          key={index}
          className="h-1 rounded-full bg-gradient-to-r from-transparent via-sky-300/70 to-transparent"
          style={{
            width: `${72 - index * 8}%`,
            marginLeft: `${index * 9}%`,
          }}
        />
      ))}
    </div>
  );
}
