type RadioOption = {
  label: string;
  value: string;
  description: string;
};

type RadioCardGroupProps = {
  legend: string;
  name: string;
  options: RadioOption[];
};

export function RadioCardGroup({ legend, name, options }: RadioCardGroupProps) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-slate-100">{legend}</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex gap-3 rounded-md border border-white/10 bg-slate-950 p-4 transition focus-within:border-cyan-300 hover:border-white/20"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              className="mt-1 h-4 w-4 accent-cyan-300"
            />
            <span>
              <span className="block text-sm font-bold text-white">{option.label}</span>
              <span className="mt-1 block text-sm leading-6 text-slate-400">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
