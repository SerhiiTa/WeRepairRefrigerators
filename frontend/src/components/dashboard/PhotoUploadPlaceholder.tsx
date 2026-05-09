const photoSlots = ["Appliance label", "Symptom photo", "Completed repair"];

export function PhotoUploadPlaceholder() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {photoSlots.map((slot) => (
        <div
          key={slot}
          className="rounded-lg border border-dashed border-white/20 bg-slate-950 p-5 text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-cyan-300/10 text-cyan-200">
            +
          </div>
          <h3 className="mt-4 text-sm font-bold text-white">{slot}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Upload placeholder only. File handling will be added later.
          </p>
        </div>
      ))}
    </div>
  );
}
