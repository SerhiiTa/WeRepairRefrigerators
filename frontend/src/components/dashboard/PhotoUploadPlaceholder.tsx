const photoSlots = [
  {
    title: "Appliance label photo",
    description:
      "Dedicated placeholder for the model and serial label. AI extraction will use this later.",
    featured: true,
  },
  {
    title: "Symptom photo",
    description: "Upload placeholder only. File handling will be added later.",
    featured: false,
  },
  {
    title: "Completed repair",
    description: "Upload placeholder only. File handling will be added later.",
    featured: false,
  },
];

export function PhotoUploadPlaceholder() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {photoSlots.map((slot) => (
        <div
          key={slot.title}
          className={`rounded-lg border border-dashed p-5 text-center ${
            slot.featured
              ? "border-cyan-300/40 bg-cyan-300/10"
              : "border-white/20 bg-slate-950"
          }`}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-cyan-300/10 text-cyan-200">
            +
          </div>
          <h3 className="mt-4 text-sm font-bold text-white">{slot.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{slot.description}</p>
        </div>
      ))}
    </div>
  );
}
